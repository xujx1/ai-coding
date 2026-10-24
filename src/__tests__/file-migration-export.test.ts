import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { exportFileMigration } from '../storage/migration/fileMigrationExport.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';

test('migration export writes a compatible rollback snapshot without overwriting an existing run', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-migration-export-'));
  const execution = { runId: 'run-export', metadata: {}, nodes: [] };
  const agent = { agentRunId: 'agent-export', runId: 'run-export', plan: { title: 'plan', steps: [], risks: [], createdAt: 1 } };
  const lifecycle = { runId: 'run-export', requirementId: 'req-export' };
  const event = { id: 'event-export', type: 'pipeline_created', runId: 'run-export', timestamp: 1 };
  const repositories = {
    runs: { findById: async () => ({ value: execution }) },
    agents: { listByRun: async () => ({ items: [{ value: agent }] }) },
    lifecycle: { findByRunId: async () => ({ value: lifecycle }) },
    events: { listByRun: async () => ({ items: [{ ...event, tenantId: 'tenant', sequence: 1 }] }) },
  } as unknown as StorageRepositories;
  const unitOfWork: UnitOfWork = { transaction: async (_ctx, work) => work(repositories) };
  const exported = await exportFileMigration({ destinationRoot: root, runId: 'run-export', context: { tenantId: 'tenant' }, unitOfWork });
  assert.equal(fs.existsSync(path.join(exported.directory, 'execution-state.json')), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(exported.directory, 'agents', 'agent-export.plan.json'), 'utf8')), agent.plan);
  assert.match(fs.readFileSync(path.join(exported.directory, 'logs', 'events.ndjson'), 'utf8'), /event-export/);
  await assert.rejects(() => exportFileMigration({ destinationRoot: root, runId: 'run-export', context: { tenantId: 'tenant' }, unitOfWork }), /already exists/);
  fs.rmSync(root, { recursive: true, force: true });
});
