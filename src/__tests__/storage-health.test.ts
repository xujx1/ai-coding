import * as assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import {
  createStorageDependencies,
  ensureStorageReadyForStartup,
  StorageReadinessError,
  type StorageHealth,
} from '../storage/factory.js';

test('local storage health explicitly disables database notifications while retaining Worker readiness', async () => {
  const dependencies = createStorageDependencies({
    ...DEFAULT_CONFIG,
    storage: { ...DEFAULT_CONFIG.storage, driver: 'file', eventBus: 'memory', artifactStore: 'local' },
  });
  try {
    assert.deepEqual(await dependencies.health({ tenantId: 'health-test' }), {
      database: 'disabled', eventBus: 'disabled', artifactStore: 'ok', outboxPending: null, workerReady: true,
    });
  } finally { await dependencies.close(); }
});

test('PostgreSQL storage health reports database, artifact store, and outbox readiness', { skip: !process.env.DATABASE_URL }, async () => {
  const dependencies = createStorageDependencies({
    ...DEFAULT_CONFIG,
    storage: {
      ...DEFAULT_CONFIG.storage, driver: 'postgres', databaseUrl: process.env.DATABASE_URL,
      databaseSsl: false, eventBus: 'postgres', artifactStore: 'local',
    },
  });
  try {
    // Repository calls exercise the same database pool used by health checks.
    const health = await dependencies.health({ tenantId: `health-pg-${Date.now()}` });
    assert.equal(health.database, 'ok');
    assert.equal(health.artifactStore, 'ok');
    assert.equal(health.outboxPending, 0);
    assert.equal(health.eventBus, 'ok');
    assert.equal(health.workerReady, true);
  } finally { await dependencies.close(); }
});

test('production startup accepts only fully ready durable infrastructure', async () => {
  const health: StorageHealth = {
    database: 'ok', eventBus: 'ok', artifactStore: 'ok', outboxPending: 0, workerReady: true,
  };
  const result = await ensureStorageReadyForStartup('production', { health: async () => health }, { tenantId: 'startup-test' });
  assert.equal(result, health);
});

test('production startup rejects unhealthy infrastructure before listening', async () => {
  const health: StorageHealth = {
    database: 'error', eventBus: 'error', artifactStore: 'error', outboxPending: -1, workerReady: false,
  };
  await assert.rejects(
    ensureStorageReadyForStartup('production', { health: async () => health }, { tenantId: 'startup-test' }),
    (error: unknown) => {
      assert.ok(error instanceof StorageReadinessError);
      assert.deepEqual(error.failures, [
        'database=error', 'eventBus=error', 'artifactStore=error', 'outboxPending=-1', 'workerReady=false',
      ]);
      return true;
    },
  );
});

test('local startup permits explicitly disabled production services', async () => {
  const health: StorageHealth = {
    database: 'disabled', eventBus: 'disabled', artifactStore: 'ok', outboxPending: null, workerReady: true,
  };
  assert.equal(
    await ensureStorageReadyForStartup('local', { health: async () => health }, { tenantId: 'startup-test' }),
    health,
  );
});
