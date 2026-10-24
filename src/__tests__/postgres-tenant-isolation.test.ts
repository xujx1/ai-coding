import * as assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL repositories require tenant context and isolate identical run identities', { skip: !databaseUrl }, async () => {
  const database = new PostgresDatabase({ ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false });
  const suffix = Date.now().toString();
  const tenantA = { tenantId: `tenant-a-${suffix}` };
  const tenantB = { tenantId: `tenant-b-${suffix}` };
  const runId = `same-run-${suffix}`;
  const repos = postgresRepositories(database);
  await runStorageMigrations(database);

  const state = (name: string): ExecutionState => ({
    runId, name, status: 'idle', currentNodeIndex: -1, nodes: [], permissionMode: 'default', modelOverrides: {},
    startedAt: Date.now(), updatedAt: Date.now(),
  });
  try {
    await repos.runs.create(tenantA, state('Tenant A'));
    await repos.runs.create(tenantB, state('Tenant B'));
    await repos.events.append(tenantA, { id: `event-a-${suffix}`, type: 'pipeline_created', runId, timestamp: Date.now() });
    await repos.events.append(tenantB, { id: `event-b-${suffix}`, type: 'pipeline_created', runId, timestamp: Date.now() });
    await repos.artifacts.save(tenantA, {
      artifactId: `artifact-${suffix}`, runId, tenantId: tenantA.tenantId, kind: 'report', storageKey: `committed/a/${suffix}`,
      contentType: 'text/plain', sizeBytes: 1, sha256: 'a'.repeat(64), retentionClass: 'standard', committed: true, createdAt: Date.now(),
    });

    assert.equal((await repos.runs.findById(tenantA, runId))?.value.name, 'Tenant A');
    assert.equal((await repos.runs.findById(tenantB, runId))?.value.name, 'Tenant B');
    assert.deepEqual((await repos.events.listByRun(tenantA, runId)).items.map(event => event.id), [`event-a-${suffix}`]);
    assert.deepEqual((await repos.events.listByRun(tenantB, runId)).items.map(event => event.id), [`event-b-${suffix}`]);
    assert.equal(await repos.artifacts.findById(tenantB, `artifact-${suffix}`), null);
  } finally {
    await database.query('DELETE FROM runs WHERE tenant_id = ANY($1::text[])', [[tenantA.tenantId, tenantB.tenantId]]);
    await database.close();
  }
});
