import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { importFileRun } from '../storage/migration/fileMigrationImport.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { PostgresUnitOfWork } from '../storage/postgres/postgresUnitOfWork.js';
import { createPostgresCheckpointer } from '../workflows/runtime/langgraph/checkpointer.js';
import { langGraphRunConfig } from '../workflows/runtime/langgraph/runtime.js';

test('file migration importer writes a validated run through one UnitOfWork', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-migration-import-'));
  const run = path.join(root, 'runs', 'run-a');
  fs.mkdirSync(path.join(run, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(run, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(run, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(run, 'execution-state.json'), JSON.stringify({
    runId: 'run-a', metadata: { workflowSnapshot: { definition: { id: 'workflow-a', version: 1, nodes: [] } } },
  }));
  fs.writeFileSync(path.join(run, 'agents', 'agent-a.json'), JSON.stringify({ agentRunId: 'agent-a', runId: 'run-a' }));
  fs.writeFileSync(path.join(run, 'agents', 'agent-a.plan.json'), JSON.stringify({ title: 'plan', steps: [], risks: [], createdAt: 1 }));
  fs.writeFileSync(path.join(run, 'artifacts', 'lifecycle-state.json'), JSON.stringify({ runId: 'run-a' }));
  fs.mkdirSync(path.join(run, 'artifacts', 'reports'), { recursive: true });
  fs.writeFileSync(path.join(run, 'artifacts', 'reports', 'report.txt'), 'legacy report');
  fs.writeFileSync(path.join(run, 'logs', 'events.ndjson'), JSON.stringify({ id: 'event-a', runId: 'run-a', type: 'pipeline_created', timestamp: 1 }) + '\n');
  fs.mkdirSync(path.join(run, 'langgraph'), { recursive: true });
  fs.writeFileSync(path.join(run, 'langgraph', 'latest.json'), JSON.stringify(checkpointEnvelope('run-a')));
  const calls: string[] = [];
  const repositories = {
    runs: { findById: async () => null, create: async () => { calls.push('run'); } },
    agents: { create: async (_ctx: unknown, agent: { plan?: unknown }) => { assert.ok(agent.plan); calls.push('agent'); } },
    lifecycle: { create: async () => { calls.push('lifecycle'); } },
    workflows: { save: async () => { calls.push('workflow'); } },
    events: { append: async () => { calls.push('event'); } },
    checkpoints: { import: async () => { calls.push('checkpoint'); } },
  } as unknown as StorageRepositories;
  const unitOfWork: UnitOfWork = { transaction: async (_ctx, work) => work(repositories) };
  const uploads: Array<{ kind: string; body: Uint8Array }> = [];
  const result = await importFileRun({
    sourceRoot: root, runId: 'run-a', context: { tenantId: 'tenant-a' }, unitOfWork,
    artifactUploader: { uploadAndCommit: async (_ctx, input) => {
      uploads.push({ kind: input.kind, body: input.body as Uint8Array });
      return { ...input, tenantId: 'tenant-a', storageKey: 'committed/report', sizeBytes: 13, sha256: 'hash', committed: true, createdAt: 1 } as any;
    } },
  });
  assert.deepEqual(result, { runId: 'run-a', imported: true, agents: 1, lifecycle: true, workflow: true, events: 1, artifacts: 1, checkpoint: true });
  assert.deepEqual(calls, ['run', 'agent', 'lifecycle', 'workflow', 'event', 'checkpoint']);
  assert.equal(uploads[0]?.kind, 'legacy/txt');
  assert.equal(Buffer.from(uploads[0]?.body ?? []).toString('utf8'), 'legacy report');
  fs.rmSync(root, { recursive: true, force: true });
});

test('file migration imports a legacy graph checkpoint into the official PostgreSQL checkpointer transaction', {
  skip: !process.env.DATABASE_URL, timeout: 20_000,
}, async () => {
  const runId = `migration-checkpoint-${Date.now()}`;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-migration-postgres-checkpoint-'));
  const run = path.join(root, 'runs', runId);
  fs.mkdirSync(path.join(run, 'langgraph'), { recursive: true });
  fs.writeFileSync(path.join(run, 'execution-state.json'), JSON.stringify({
    runId, name: 'checkpoint migration', status: 'suspended', currentNodeIndex: 0, nodes: [], permissionMode: 'default',
    modelOverrides: {}, startedAt: 1, updatedAt: 2, metadata: {},
  }));
  fs.writeFileSync(path.join(run, 'langgraph', 'latest.json'), JSON.stringify(checkpointEnvelope(runId)));
  const database = new PostgresDatabase({
    ...DEFAULT_STORAGE_CONFIG,
    databaseUrl: process.env.DATABASE_URL!, databaseSsl: false,
    databasePoolMin: 1, databasePoolMax: 3,
  });
  try {
    await runStorageMigrations(database);
    const imported = await importFileRun({
      sourceRoot: root, runId, context: { tenantId: 'default' },
      unitOfWork: new PostgresUnitOfWork(database),
    });
    assert.equal(imported.checkpoint, true);
    const checkpointer = await createPostgresCheckpointer(process.env.DATABASE_URL!);
    try {
      const stored = await checkpointer.getTuple(langGraphRunConfig(runId));
      assert.equal((stored?.checkpoint.channel_values.graph as { runId?: string })?.runId, runId);
    } finally {
      await checkpointer.end();
    }
  } finally {
    await database.query('DELETE FROM ai_coding_langgraph.checkpoint_writes WHERE thread_id = $1', [runId]).catch(() => undefined);
    await database.query('DELETE FROM ai_coding_langgraph.checkpoints WHERE thread_id = $1', [runId]).catch(() => undefined);
    await database.query('DELETE FROM ai_coding_langgraph.checkpoint_blobs WHERE thread_id = $1', [runId]).catch(() => undefined);
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', ['default', runId]).catch(() => undefined);
    await database.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('file migration importer treats an already present run as an idempotent partial migration', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-migration-partial-'));
  const run = path.join(root, 'runs', 'run-partial');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'execution-state.json'), JSON.stringify({ runId: 'run-partial', metadata: {} }));
  let wrote = false;
  const repositories = { runs: { findById: async () => ({ value: { runId: 'run-partial' } }), create: async () => { wrote = true; } } } as unknown as StorageRepositories;
  const unitOfWork: UnitOfWork = { transaction: async (_ctx, work) => work(repositories) };
  const result = await importFileRun({ sourceRoot: root, runId: 'run-partial', context: { tenantId: 'tenant-a' }, unitOfWork });
  assert.equal(result.imported, false);
  assert.equal(wrote, false);
  fs.rmSync(root, { recursive: true, force: true });
});

function checkpointEnvelope(runId: string) {
  return {
    id: `checkpoint-${runId}`,
    runId,
    threadId: runId,
    state: {
      runId, workflowId: 'migration-workflow', workflowVersion: 1, status: 'running',
      nodes: {}, projects: [], branches: {}, branchOrder: [], joins: {}, artifactIndex: {},
      contextManifests: {}, modelOverrides: {}, permissionMode: 'default',
      retry: { nodeAttempts: {}, branchAttempts: {}, reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 },
      startedAt: 1, updatedAt: 2,
    },
    metadata: { workflowId: 'migration-workflow', workflowVersion: 1, createdAt: 2, reason: 'legacy-import' },
  };
}
