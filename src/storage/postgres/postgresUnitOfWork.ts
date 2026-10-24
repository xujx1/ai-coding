import type { StorageContext } from '../contracts/common.js';
import type { StorageRepositories, UnitOfWork } from '../contracts/unitOfWork.js';
import { PostgresDatabase, type SqlExecutor } from './database.js';
import { PostgresAgentRepository } from './postgresAgentRepository.js';
import { PostgresArtifactRepository } from './postgresArtifactRepository.js';
import { PostgresEventRepository } from './postgresEventRepository.js';
import { PostgresLeaseRepository } from './postgresLeaseRepository.js';
import { PostgresLifecycleRepository } from './postgresLifecycleRepository.js';
import { PostgresMigrationRepository } from './postgresMigrationRepository.js';
import { PostgresRunRepository } from './postgresRunRepository.js';
import { PostgresWorkflowRepository } from './postgresWorkflowRepository.js';
import { PostgresCheckpointRepository } from './postgresCheckpointRepository.js';
import { logStorageEvent } from '../structuredLogging.js';

export function postgresRepositories(sql: SqlExecutor): StorageRepositories {
  return {
    runs: new PostgresRunRepository(sql),
    agents: new PostgresAgentRepository(sql),
    lifecycle: new PostgresLifecycleRepository(sql),
    migrations: new PostgresMigrationRepository(sql),
    events: new PostgresEventRepository(sql),
    workflows: new PostgresWorkflowRepository(sql),
    artifacts: new PostgresArtifactRepository(sql),
    leases: new PostgresLeaseRepository(sql),
    checkpoints: new PostgresCheckpointRepository(sql),
  };
}

export class PostgresUnitOfWork implements UnitOfWork {
  constructor(private readonly database: PostgresDatabase) {}

  async transaction<T>(ctx: StorageContext, work: (repositories: StorageRepositories) => Promise<T>): Promise<T> {
    const transactionId = ctx.transactionId ?? `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const transactionContext = { ...ctx, transactionId };
    logStorageEvent('storage_transaction_started', transactionContext);
    try {
      const result = await this.database.transaction(client => work(postgresRepositories(client)));
      logStorageEvent('storage_transaction_committed', transactionContext);
      return result;
    } catch (error) {
      logStorageEvent('storage_transaction_rolled_back', { ...transactionContext, error: error instanceof Error ? error.message : String(error) }, 'error');
      throw error;
    }
  }
}
