import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { verifyFileMigration } from '../storage/migration/fileMigrationVerify.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';

test('migration verification compares canonical source state and sampled replay', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-migration-verify-'));
  const run = path.join(root, 'runs', 'run-v');
  fs.mkdirSync(path.join(run, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(run, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(run, 'logs'), { recursive: true });
  const execution = { runId: 'run-v', metadata: {}, nodes: [] };
  const agent = { agentRunId: 'agent-v', runId: 'run-v' };
  const lifecycle = { runId: 'run-v', requirementId: 'req-v' };
  const event = { id: 'event-v', type: 'pipeline_created', runId: 'run-v', timestamp: 1 };
  fs.writeFileSync(path.join(run, 'execution-state.json'), JSON.stringify(execution));
  fs.writeFileSync(path.join(run, 'agents', 'agent-v.json'), JSON.stringify(agent));
  fs.writeFileSync(path.join(run, 'artifacts', 'lifecycle-state.json'), JSON.stringify(lifecycle));
  fs.writeFileSync(path.join(run, 'logs', 'events.ndjson'), JSON.stringify(event) + '\n');
  const repositories = {
    runs: { findById: async () => ({ value: execution }) },
    agents: { listByRun: async () => ({ items: [{ value: agent }] }) },
    lifecycle: { findByRunId: async () => ({ value: lifecycle }) },
    events: { listByRun: async () => ({ items: [{ ...event, tenantId: 'tenant-v', sequence: 1 }] }) },
  } as unknown as StorageRepositories;
  const unitOfWork: UnitOfWork = { transaction: async (_ctx, work) => work(repositories) };
  const verified = await verifyFileMigration({ sourceRoot: root, runId: 'run-v', context: { tenantId: 'tenant-v' }, unitOfWork });
  assert.equal(verified.matched, true);
  assert.equal(verified.transcriptSampleMatched, true);
  assert.equal(verified.lifecycleMatched, true);
  fs.rmSync(root, { recursive: true, force: true });
});
