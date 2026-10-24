import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import { createEmptyLifecycleState } from '../lifecycle/store.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { PostgresUnitOfWork, postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';
import { importFileRun } from '../storage/migration/fileMigrationImport.js';
import { verifyFileMigration } from '../storage/migration/fileMigrationVerify.js';
import { exportFileMigration } from '../storage/migration/fileMigrationExport.js';
import { planFileMigration } from '../storage/migration/fileMigrationPlan.js';

test('staged PostgreSQL cutover rehearses pause export verify and file rollback', {
  skip: !process.env.DATABASE_URL, timeout: 20_000,
}, async () => {
  const runId = `rollout-rehearsal-${Date.now()}`;
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'rollout-source-'));
  const rollback = fs.mkdtempSync(path.join(os.tmpdir(), 'rollout-rollback-'));
  const run = path.join(source, 'runs', runId);
  fs.mkdirSync(path.join(run, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(run, 'logs'), { recursive: true });
  const execution = {
    runId, name: 'rollout rehearsal', status: 'completed', currentNodeIndex: 0,
    nodes: [], permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 2, completedAt: 2,
  };
  fs.writeFileSync(path.join(run, 'execution-state.json'), JSON.stringify(execution));
  fs.writeFileSync(path.join(run, 'artifacts', 'lifecycle-state.json'), JSON.stringify(createEmptyLifecycleState({
    runId, requirementId: 'rollout-requirement', phase: 'completed', status: 'completed', now: 1,
  })));
  fs.writeFileSync(path.join(run, 'logs', 'events.ndjson'), `${JSON.stringify({
    id: `event-${runId}`, runId, type: 'pipeline_completed', timestamp: 2,
  })}\n`);

  const database = new PostgresDatabase({
    ...DEFAULT_STORAGE_CONFIG,
    databaseUrl: process.env.DATABASE_URL!, databaseSsl: false,
    databasePoolMin: 1, databasePoolMax: 3,
  });
  const context = { tenantId: 'rollout-rehearsal' };
  const unitOfWork = new PostgresUnitOfWork(database);
  try {
    await runStorageMigrations(database);
    const imported = await importFileRun({ sourceRoot: source, runId, context, unitOfWork });
    assert.equal(imported.imported, true);
    const beforeCutover = await verifyFileMigration({ sourceRoot: source, runId, context, unitOfWork });
    assert.equal(beforeCutover.matched, true, beforeCutover.diagnostics.join('; '));

    // Staged cutover: PostgreSQL becomes the only read authority after verification.
    const authoritative = await postgresRepositories(database).runs.findById(context, runId);
    assert.equal(authoritative?.value.name, 'rollout rehearsal');
    const activeLeases = await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM execution_leases WHERE tenant_id = $1 AND lease_key LIKE $2 AND lease_until > now()",
      [context.tenantId, `run:${runId}:%`],
    );
    assert.equal(Number(activeLeases.rows[0]?.count), 0, 'writes must be paused before rollback export');

    const exported = await exportFileMigration({ destinationRoot: rollback, runId, context, unitOfWork });
    assert.ok(exported.checksum);
    const rollbackPlan = planFileMigration(rollback);
    assert.equal(rollbackPlan.runs[0]?.valid, true, rollbackPlan.runs[0]?.diagnostics.join('; '));
    const rollbackVerified = await verifyFileMigration({ sourceRoot: rollback, runId, context, unitOfWork });
    assert.equal(rollbackVerified.matched, true, rollbackVerified.diagnostics.join('; '));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(rollback, 'runs', runId, 'execution-state.json'), 'utf8')), execution);
  } finally {
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [context.tenantId, runId]).catch(() => undefined);
    await database.close();
    fs.rmSync(source, { recursive: true, force: true });
    fs.rmSync(rollback, { recursive: true, force: true });
  }
});
