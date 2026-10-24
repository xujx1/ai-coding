import * as assert from 'node:assert/strict';
import test from 'node:test';
import type { IdempotencyRecord, StorageContext } from '../storage/contracts/common.js';
import type { Lease, LeaseRepository } from '../storage/contracts/leaseRepository.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';
import { IdempotentCommandExecutor } from '../storage/idempotentCommand.js';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { postgresRepositories, PostgresUnitOfWork } from '../storage/postgres/postgresUnitOfWork.js';

const databaseUrl = process.env.DATABASE_URL;

test('workflow commands replay the committed response and reject conflicting key reuse', async () => {
  const records = new Map<string, IdempotencyRecord<unknown>>();
  let fencingToken = 0;
  let current: Lease | undefined;
  const leases: LeaseRepository = {
    acquire: async (_ctx, key, ownerId) => {
      current = { key, ownerId, fencingToken: ++fencingToken, leaseUntil: Date.now() + 30_000, heartbeatAt: Date.now() };
      return current;
    },
    renew: async () => current ?? null,
    assertCurrent: async (_ctx, lease) => { assert.equal(lease.fencingToken, current?.fencingToken); },
    release: async () => { current = undefined; },
    find: async () => current ?? null,
    findIdempotent: async <T>(_ctx: StorageContext, scope: string, key: string) =>
      (records.get(`${scope}:${key}`) as IdempotencyRecord<T> | undefined) ?? null,
    recordIdempotent: async <T>(_ctx: StorageContext, record: IdempotencyRecord<T>) => {
      const identity = `${record.scope}:${record.key}`;
      const prior = records.get(identity) as IdempotencyRecord<T> | undefined;
      if (prior) return prior as IdempotencyRecord<T>;
      records.set(identity, record);
      return record;
    },
  };
  const repositories = { leases } as unknown as StorageRepositories;
  const unitOfWork: UnitOfWork = { transaction: async (_ctx, work) => work(repositories) };
  const executor = new IdempotentCommandExecutor(leases, unitOfWork, { tenantId: 'tenant' }, 'worker-a');
  let executions = 0;

  const first = await executor.execute({
    scope: 'workflow-command:run:start',
    key: 'request-1',
    payload: { fromNodeId: 'build' },
    execute: async () => ({ started: ++executions }),
  });
  const repeated = await executor.execute({
    scope: 'workflow-command:run:start',
    key: 'request-1',
    payload: { fromNodeId: 'build' },
    execute: async () => ({ started: ++executions }),
  });

  assert.deepEqual(first, { result: { started: 1 }, replayed: false });
  assert.deepEqual(repeated, { result: { started: 1 }, replayed: true });
  assert.equal(executions, 1);
  await assert.rejects(() => executor.execute({
    scope: 'workflow-command:run:start',
    key: 'request-1',
    payload: { fromNodeId: 'test' },
    execute: async () => ({ started: ++executions }),
  }), /reused with a different payload/);
  assert.equal(executions, 1);
});

test('PostgreSQL workflow command retries return the committed response', { skip: !databaseUrl }, async () => {
  const database = new PostgresDatabase({ ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false });
  const tenantId = `command-idempotency-${Date.now()}-${process.pid}`;
  const context = { tenantId };
  await runStorageMigrations(database);
  const repositories = postgresRepositories(database);
  const executor = new IdempotentCommandExecutor(
    repositories.leases,
    new PostgresUnitOfWork(database),
    context,
    'worker-command-test',
  );
  let executions = 0;
  try {
    const command = {
      scope: 'workflow-command:run-a:pipeline.confirm',
      key: 'confirm-request-a',
      payload: { nodeId: 'review', approved: true },
      execute: async () => ({ confirmed: ++executions }),
    };
    const first = await executor.execute(command);
    const replayed = await executor.execute(command);
    assert.deepEqual(first, { result: { confirmed: 1 }, replayed: false });
    assert.deepEqual(replayed, { result: { confirmed: 1 }, replayed: true });
    assert.equal(executions, 1);
  } finally {
    await database.query('DELETE FROM idempotency_records WHERE tenant_id = $1', [tenantId]);
    await database.query('DELETE FROM execution_leases WHERE tenant_id = $1', [tenantId]);
    await database.close();
  }
});
