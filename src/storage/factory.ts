import type { PipelineConfig } from '../config/types.js';
import { MemoryEventBus, PostgresEventBus, type EventBus } from '../events/eventBus.js';
import { OutboxPublisher, OutboxPublisherLoop, PostgresOutboxRepository } from '../events/outbox.js';
import { LocalArtifactStore } from './artifacts/localArtifactStore.js';
import { S3ArtifactStore } from './artifacts/s3ArtifactStore.js';
import type { ArtifactStore } from './contracts/artifactStore.js';
import type { StorageRepositories, UnitOfWork } from './contracts/unitOfWork.js';
import { FileAgentRepository } from './file/fileAgentRepository.js';
import { FileArtifactRepository } from './file/fileArtifactRepository.js';
import { FileEventRepository } from './file/fileEventRepository.js';
import { FileLifecycleRepository } from './file/fileLifecycleRepository.js';
import { FileMigrationRepository } from './file/fileMigrationRepository.js';
import { FileRunRepository } from './file/fileRunRepository.js';
import { FileUnitOfWork } from './file/fileUnitOfWork.js';
import { FileWorkflowRepository } from './file/fileWorkflowRepository.js';
import { FileCheckpointRepository } from './file/fileCheckpointRepository.js';
import { PostgresDatabase } from './postgres/database.js';
import { postgresRepositories, PostgresUnitOfWork } from './postgres/postgresUnitOfWork.js';
import { observeStorageOperation } from './metrics.js';
import { ShadowWriteCoordinator } from './shadow.js';

export interface StorageDependencies {
  repositories: StorageRepositories;
  unitOfWork: UnitOfWork;
  artifactStore: ArtifactStore;
  eventBus: EventBus;
  start(): void;
  health(ctx: { tenantId: string }): Promise<StorageHealth>;
  close(): Promise<void>;
}

export interface StorageHealth {
  database: 'ok' | 'disabled' | 'error';
  eventBus: 'ok' | 'disabled' | 'error';
  artifactStore: 'ok' | 'error';
  outboxPending: number | null;
  workerReady: boolean;
}

export class StorageReadinessError extends Error {
  constructor(readonly health: StorageHealth, readonly failures: string[]) {
    super(`Production storage is not ready: ${failures.join(', ')}.`);
    this.name = 'StorageReadinessError';
  }
}

/** Production must prove every durable dependency is usable before HTTP starts listening. */
export async function ensureStorageReadyForStartup(
  profile: PipelineConfig['storage']['profile'],
  dependencies: Pick<StorageDependencies, 'health'>,
  ctx: { tenantId: string },
): Promise<StorageHealth> {
  const health = await dependencies.health(ctx);
  if (profile !== 'production') return health;

  const failures: string[] = [];
  if (health.database !== 'ok') failures.push(`database=${health.database}`);
  if (health.eventBus !== 'ok') failures.push(`eventBus=${health.eventBus}`);
  if (health.artifactStore !== 'ok') failures.push(`artifactStore=${health.artifactStore}`);
  if (health.outboxPending === null || health.outboxPending < 0) failures.push(`outboxPending=${health.outboxPending}`);
  if (!health.workerReady) failures.push('workerReady=false');
  if (failures.length > 0) throw new StorageReadinessError(health, failures);
  return health;
}

/** The only infrastructure composition point; product code receives contracts. */
export function createStorageDependencies(config: PipelineConfig): StorageDependencies {
  const rawArtifactStore: ArtifactStore = config.storage.artifactStore === 's3'
    ? new S3ArtifactStore(config.storage)
    : new LocalArtifactStore(config.storage.artifactLocalDir);
  const artifactStore = instrumentArtifactStore(rawArtifactStore);
  if (config.storage.driver === 'postgres') {
    const database = new PostgresDatabase(config.storage);
    const eventBus: EventBus = config.storage.eventBus === 'postgres'
      ? new PostgresEventBus(config.storage, { applicationName: `${config.storage.workerId}-events` })
      : new MemoryEventBus();
    const outboxLoop = new OutboxPublisherLoop(
      new OutboxPublisher(new PostgresOutboxRepository(database), eventBus, config.storage.workerId),
      {
        onError: error => console.error('Outbox publisher iteration failed:', error),
      },
    );
    return {
      repositories: instrumentRepositories(postgresRepositories(database)),
      unitOfWork: instrumentUnitOfWork(new PostgresUnitOfWork(database)),
      artifactStore,
      eventBus,
      start: () => outboxLoop.start(),
      health: async ctx => {
        const [databaseReady, eventBusStatus, artifactStoreStatus, outboxPending] = await Promise.all([
          database.health(),
          eventBusHealth(eventBus, config.storage.eventBus),
          artifactStoreHealth(artifactStore, ctx),
          pendingOutbox(database, ctx.tenantId),
        ]);
        return {
          database: databaseReady ? 'ok' : 'error',
          eventBus: eventBusStatus,
          artifactStore: artifactStoreStatus,
          outboxPending,
          workerReady: databaseReady && eventBusStatus === 'ok' && artifactStoreStatus === 'ok' && outboxPending >= 0,
        };
      },
      close: async () => { await outboxLoop.stop(); await eventBus.close(); await database.close(); },
    };
  }
  const repositories: StorageRepositories = {
    runs: new FileRunRepository(), agents: new FileAgentRepository(), lifecycle: new FileLifecycleRepository(), migrations: new FileMigrationRepository(),
    events: new FileEventRepository(), workflows: new FileWorkflowRepository(), artifacts: new FileArtifactRepository(),
    // File mode must never coordinate distributed Workers; this throws if used.
    leases: unsupportedFileLeases(),
    checkpoints: new FileCheckpointRepository(),
  };
  let selectedRepositories = repositories;
  let shadowCoordinator: ShadowWriteCoordinator | undefined;
  let shadowDatabase: PostgresDatabase | undefined;
  if (config.storage.shadowWriteEnabled) {
    shadowDatabase = new PostgresDatabase({
      ...config.storage,
      databaseUrl: config.storage.shadowDatabaseUrl,
      shadowWriteEnabled: false,
    });
    shadowCoordinator = new ShadowWriteCoordinator(repositories, postgresRepositories(shadowDatabase));
    selectedRepositories = shadowCoordinator.repositories();
  }
  const instrumentedRepositories = instrumentRepositories(selectedRepositories);
  const eventBus = new MemoryEventBus();
  return {
    repositories: instrumentedRepositories, unitOfWork: instrumentUnitOfWork(new FileUnitOfWork(instrumentedRepositories)), artifactStore, eventBus,
    start: () => undefined,
    health: async ctx => ({ database: 'disabled', eventBus: await eventBusHealth(eventBus, config.storage.eventBus), artifactStore: await artifactStoreHealth(artifactStore, ctx), outboxPending: null, workerReady: await artifactStoreHealth(artifactStore, ctx) === 'ok' }),
    close: async () => {
      await shadowCoordinator?.drain();
      await shadowDatabase?.close();
      await eventBus.close();
    },
  };
}

function instrumentRepositories(repositories: StorageRepositories): StorageRepositories {
  return Object.fromEntries(Object.entries(repositories).map(([name, repository]) => [name, new Proxy(repository, {
    get(target, property, receiver) {
      if (property === 'constructor') return target.constructor;
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function') return value;
      return (...args: unknown[]) => observeStorageOperation(name, property, () => Promise.resolve(value.apply(target, args)));
    },
  })])) as StorageRepositories;
}

function instrumentArtifactStore(store: ArtifactStore): ArtifactStore {
  return new Proxy(store, {
    get(target, property, receiver) {
      if (property === 'constructor') return target.constructor;
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function') return value;
      return (...args: unknown[]) => observeStorageOperation('artifact', property, () => Promise.resolve(value.apply(target, args)));
    },
  });
}

function instrumentUnitOfWork(unitOfWork: UnitOfWork): UnitOfWork {
  return {
    transaction: (ctx, work) => observeStorageOperation('unit_of_work', 'transaction', () =>
      unitOfWork.transaction(ctx, repositories => work(instrumentRepositories(repositories))),
    ),
  };
}

async function eventBusHealth(eventBus: EventBus, driver: PipelineConfig['storage']['eventBus']): Promise<'ok' | 'disabled' | 'error'> {
  if (driver === 'memory') return 'disabled';
  return await eventBus.health?.() ? 'ok' : 'error';
}

async function artifactStoreHealth(artifactStore: ArtifactStore, ctx: { tenantId: string }): Promise<'ok' | 'error'> {
  try { await artifactStore.listTemporary(ctx, Date.now()); return 'ok'; } catch { return 'error'; }
}

async function pendingOutbox(database: PostgresDatabase, tenantId: string): Promise<number> {
  try {
    const result = await database.query<{ count: string }>('SELECT count(*)::text AS count FROM outbox_events WHERE tenant_id = $1 AND published_at IS NULL AND terminal_failed_at IS NULL', [tenantId]);
    return Number(result.rows[0]?.count ?? 0);
  } catch { return -1; }
}

function unsupportedFileLeases(): StorageRepositories['leases'] {
  const unavailable = async (): Promise<never> => { throw new Error('Execution leases require PostgreSQL storage.'); };
  return { acquire: unavailable, renew: unavailable, release: unavailable, find: unavailable, assertCurrent: unavailable, recordIdempotent: unavailable, findIdempotent: unavailable };
}
