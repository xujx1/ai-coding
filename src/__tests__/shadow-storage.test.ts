import * as assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import type { StorageRepositories } from '../storage/contracts/unitOfWork.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';
import { compareShadowRun, ShadowWriteCoordinator } from '../storage/shadow.js';
import { getStorageMetrics } from '../storage/metrics.js';

test('file-authoritative shadow writes preserve primary responses and expose failures as metrics', async () => {
  const state = execution('shadow-unit');
  const primary = repositoriesForState(() => state);
  const shadow = repositoriesForState(() => null, async () => { throw new Error('shadow unavailable'); });
  const coordinator = new ShadowWriteCoordinator(primary, shadow);
  getStorageMetrics().reset();

  const created = await coordinator.repositories().runs.create({ tenantId: 'tenant' }, state);
  assert.equal(created.value.name, 'file authority');
  await coordinator.drain();
  assert.equal(getStorageMetrics().snapshot().counters.storage_shadow_write_errors_total, 1);
});

test('real PostgreSQL shadow comparison records cutover readiness and mismatches', {
  skip: !process.env.DATABASE_URL, timeout: 20_000,
}, async () => {
  const runId = `shadow-postgres-${Date.now()}`;
  let sourceState = execution(runId);
  const source = repositoriesForState(() => sourceState);
  const database = new PostgresDatabase({
    ...DEFAULT_STORAGE_CONFIG,
    databaseUrl: process.env.DATABASE_URL!, databaseSsl: false,
    databasePoolMin: 1, databasePoolMax: 3,
  });
  try {
    await runStorageMigrations(database);
    const target = postgresRepositories(database);
    const coordinator = new ShadowWriteCoordinator(source, target);
    const created = await coordinator.repositories().runs.create({ tenantId: 'shadow-test' }, sourceState);
    assert.equal(created.value.name, 'file authority');
    await coordinator.drain();

    const ready = await compareShadowRun({ tenantId: 'shadow-test' }, runId, source, target);
    assert.equal(ready.ready, true);
    assert.deepEqual(ready.mismatches, []);

    sourceState = { ...sourceState, name: 'unmirrored mismatch', updatedAt: sourceState.updatedAt + 1 };
    const mismatch = await compareShadowRun({ tenantId: 'shadow-test' }, runId, source, target);
    assert.equal(mismatch.ready, false);
    assert.deepEqual(mismatch.mismatches, ['run']);
  } finally {
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', ['shadow-test', runId]).catch(() => undefined);
    await database.close();
  }
});

function execution(runId: string): ExecutionState {
  return {
    runId, name: 'file authority', status: 'idle', currentNodeIndex: 0, nodes: [],
    permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1,
  };
}

function repositoriesForState(
  state: () => ExecutionState | null,
  createOverride?: () => Promise<never>,
): StorageRepositories {
  const emptyPage = async () => ({ items: [] });
  return {
    runs: {
      create: createOverride ?? (async (_ctx: any, value: any) => ({ tenantId: 'tenant', runId: value.runId, value, version: 1 })),
      findById: async (_ctx: any, runId: any) => {
        const value = state();
        return value && value.runId === runId ? { tenantId: 'tenant', runId, value, version: 1 } : null;
      },
      list: emptyPage, save: async () => { throw new Error('unused'); }, softDelete: async () => false,
    },
    agents: { create: async () => { throw new Error('unused'); }, findById: async () => null, listByRun: emptyPage, save: async () => { throw new Error('unused'); }, savePlan: async () => { throw new Error('unused'); } },
    lifecycle: { create: async () => { throw new Error('unused'); }, findByRunId: async () => null, save: async () => { throw new Error('unused'); } },
    migrations: { find: async () => null, record: async (_ctx: any, value: any) => value },
    events: { append: async () => { throw new Error('unused'); }, listByRun: emptyPage },
    workflows: { findById: async () => null, list: emptyPage, save: async () => { throw new Error('unused'); } },
    artifacts: { save: async (_ctx: any, value: any) => value, findById: async () => null, listByRun: emptyPage, markCommitted: async () => { throw new Error('unused'); } },
    leases: { acquire: async () => null, renew: async () => null, release: async () => false, find: async () => null, assertCurrent: async () => { throw new Error('unused'); }, recordIdempotent: async () => { throw new Error('unused'); }, findIdempotent: async () => null },
    checkpoints: { import: async () => undefined, findLatest: async () => null },
  } as unknown as StorageRepositories;
}
