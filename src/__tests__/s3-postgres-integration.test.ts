import * as assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { ArtifactManager } from '../storage/artifactManager.js';
import { S3ArtifactStore } from '../storage/artifacts/s3ArtifactStore.js';
import type { StorageContext } from '../storage/contracts/common.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { PostgresUnitOfWork, postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';

const enabled = process.env.RUN_S3_INTEGRATION === '1' && Boolean(process.env.DATABASE_URL && process.env.S3_BUCKET);

test('real S3/MinIO and PostgreSQL commit verified artifact content and metadata', {
  skip: !enabled, timeout: 30_000,
}, async () => {
  const fixture = await setup();
  const artifactId = `s3-commit-${Date.now()}`;
  try {
    const manager = new ArtifactManager(fixture.store, fixture.unitOfWork);
    const artifact = await manager.uploadAndCommit(fixture.context, {
      artifactId, runId: fixture.runId, kind: 'integration-report',
      contentType: 'text/plain', body: Buffer.from('real MinIO content'),
    });
    assert.equal(artifact.committed, true);
    assert.equal((await fixture.repositories.artifacts.findById(fixture.context, artifactId))?.sha256, artifact.sha256);
    assert.equal(await readText(fixture.store, fixture.context, artifact.storageKey), 'real MinIO content');
    await fixture.store.delete(fixture.context, artifact.storageKey);
  } finally {
    await fixture.close();
  }
});

test('object-store/database split failures never expose partial formal artifacts', {
  skip: !enabled, timeout: 30_000,
}, async () => {
  const fixture = await setup();
  const uploadedId = `s3-db-failure-${Date.now()}`;
  const objectFailureId = `s3-object-failure-${Date.now()}`;
  let temporaryKey: string | undefined;
  try {
    const failingDatabase = new FailMetadataCommitUnitOfWork(fixture.unitOfWork);
    const manager = new ArtifactManager(fixture.store, failingDatabase);
    await assert.rejects(() => manager.uploadAndCommit(fixture.context, {
      artifactId: uploadedId, runId: fixture.runId, kind: 'split-failure',
      contentType: 'text/plain', body: Buffer.from('uploaded before database rollback'),
    }), /forced metadata transaction failure/);
    temporaryKey = `temporary/${fixture.context.tenantId}/${fixture.runId}/${uploadedId}`;
    assert.ok(await fixture.store.stat(fixture.context, temporaryKey), 'uploaded object remains sweepable');
    assert.equal(await fixture.repositories.artifacts.findById(fixture.context, uploadedId), null, 'formal metadata rolled back');

    const unavailableStore = new S3ArtifactStore({
      ...s3Config(), s3Endpoint: 'http://127.0.0.1:1',
    });
    const unavailableManager = new ArtifactManager(unavailableStore, fixture.unitOfWork);
    await assert.rejects(() => unavailableManager.uploadAndCommit(fixture.context, {
      artifactId: objectFailureId, runId: fixture.runId, kind: 'split-failure',
      contentType: 'text/plain', body: Buffer.from('must not get metadata'),
    }));
    assert.equal(await fixture.repositories.artifacts.findById(fixture.context, objectFailureId), null);
  } finally {
    if (temporaryKey) await fixture.store.delete(fixture.context, temporaryKey).catch(() => undefined);
    await fixture.close();
  }
});

class FailMetadataCommitUnitOfWork implements UnitOfWork {
  private calls = 0;
  constructor(private readonly delegate: UnitOfWork) {}
  async transaction<T>(ctx: StorageContext, work: (repositories: StorageRepositories) => Promise<T>): Promise<T> {
    this.calls += 1;
    if (this.calls > 1) throw new Error('forced metadata transaction failure');
    return this.delegate.transaction(ctx, work);
  }
}

async function setup() {
  const database = new PostgresDatabase({
    ...DEFAULT_STORAGE_CONFIG, databaseUrl: process.env.DATABASE_URL!, databaseSsl: false,
    databasePoolMin: 1, databasePoolMax: 3,
  });
  await runStorageMigrations(database);
  const repositories = postgresRepositories(database);
  const unitOfWork = new PostgresUnitOfWork(database);
  const context = { tenantId: `s3-integration-${Date.now()}` };
  const runId = `s3-run-${Date.now()}`;
  const state: ExecutionState = {
    runId, name: 'S3 integration', status: 'idle', currentNodeIndex: 0, nodes: [],
    permissionMode: 'default', modelOverrides: {}, startedAt: Date.now(), updatedAt: Date.now(),
  };
  await repositories.runs.create(context, state);
  const store = new S3ArtifactStore(s3Config());
  return {
    database, repositories, unitOfWork, context, runId, store,
    close: async () => {
      await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [context.tenantId, runId]).catch(() => undefined);
      await database.close();
    },
  };
}

function s3Config() {
  return {
    ...DEFAULT_STORAGE_CONFIG,
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Bucket: process.env.S3_BUCKET!,
    s3Region: process.env.S3_REGION ?? 'us-east-1',
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
  };
}

async function readText(store: S3ArtifactStore, context: StorageContext, key: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of await store.read(context, key)) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
