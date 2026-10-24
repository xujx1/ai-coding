import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { planFileMigration } from '../storage/migration/fileMigrationPlan.js';

test('file migration dry-run plans valid runs and isolates malformed runs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-migration-plan-'));
  const valid = path.join(root, 'runs', 'valid-run');
  fs.mkdirSync(path.join(valid, 'agents'), { recursive: true });
  fs.mkdirSync(path.join(valid, 'artifacts'), { recursive: true });
  fs.mkdirSync(path.join(valid, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(valid, 'checkpoints'), { recursive: true });
  fs.writeFileSync(path.join(valid, 'execution-state.json'), JSON.stringify({ runId: 'valid-run', metadata: { workflowSnapshot: { id: 'builtin' } } }));
  fs.writeFileSync(path.join(valid, 'agents', 'agent.json'), JSON.stringify({ agentRunId: 'agent' }));
  fs.writeFileSync(path.join(valid, 'agents', 'agent.plan.json'), JSON.stringify({ title: 'plan' }));
  fs.writeFileSync(path.join(valid, 'artifacts', 'lifecycle-state.json'), JSON.stringify({ runId: 'valid-run' }));
  fs.writeFileSync(path.join(valid, 'artifacts', 'report.txt'), 'report');
  fs.writeFileSync(path.join(valid, 'logs', 'events.ndjson'), '{"id":"one"}\n{"id":"two"}\n');
  fs.writeFileSync(path.join(valid, 'checkpoints', 'one.json'), JSON.stringify({ checkpoint: 1 }));
  const invalid = path.join(root, 'runs', 'broken-run');
  fs.mkdirSync(invalid, { recursive: true });
  fs.writeFileSync(path.join(invalid, 'execution-state.json'), '{bad');

  const plan = planFileMigration(root);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.totals.validRuns, 1);
  assert.equal(plan.totals.invalidRuns, 1);
  assert.deepEqual(plan.runs.find(item => item.runId === 'valid-run')?.records, {
    executionStates: 1, agents: 1, agentPlans: 1, lifecycleStates: 1, workflowSnapshots: 1,
    events: 2, checkpoints: 1, artifacts: 1, artifactBytes: 6,
  });
  assert.match(plan.runs.find(item => item.runId === 'broken-run')?.diagnostics.join('\n') ?? '', /required/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('file migration dry-run rejects a missing source directory', () => {
  assert.throws(() => planFileMigration(path.join(os.tmpdir(), `missing-migration-source-${Date.now()}`)), /does not exist/);
});

test('file migration dry-run plans a large run without loading artifact bodies', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-migration-large-'));
  const run = path.join(root, 'runs', 'large-run');
  fs.mkdirSync(path.join(run, 'logs'), { recursive: true });
  fs.mkdirSync(path.join(run, 'agents'), { recursive: true });
  fs.writeFileSync(path.join(run, 'execution-state.json'), JSON.stringify({ runId: 'large-run', metadata: {} }));
  fs.writeFileSync(path.join(run, 'logs', 'events.ndjson'), Array.from({ length: 1000 }, (_, index) => JSON.stringify({ id: `event-${index}` })).join('\n'));
  for (let index = 0; index < 100; index += 1) fs.writeFileSync(path.join(run, 'agents', `agent-${index}.json`), JSON.stringify({ agentRunId: `agent-${index}` }));
  const plan = planFileMigration(root).runs[0]!;
  assert.equal(plan.valid, true);
  assert.equal(plan.records.events, 1000);
  assert.equal(plan.records.agents, 100);
  fs.rmSync(root, { recursive: true, force: true });
});
