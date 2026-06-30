import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

test('example activity hit preview MRD runs marketing and marketing-admin through real dynamic full-flow', {
  skip: process.env.AI_CODING_RUN_EXAMPLE_FULL_FLOW !== '1'
    ? 'Set AI_CODING_RUN_EXAMPLE_FULL_FLOW=1 to run the real example flow with configured model providers.'
    : false,
  timeout: 600_000,
}, async () => {
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coding-example-full-flow-'));
  process.env.RUNTIME_DIR = runtimeDir;
  delete process.env.AI_CODING_MOCK_LLM;

  const { getSessionManager } = await import('../session/SessionManager.js');
  const { getPipeline, removePipeline } = await import('../pipeline/engine.js');
  const { getRunPaths } = await import('../runtime/paths.js');
  const { getStateStore } = await import('../persistence/stateStore.js');
  const { getEventLog, closeEventLog } = await import('../events/EventLog.js');

  const session = getSessionManager().createRun('活动命中预览双应用正式流程');
  const paths = getRunPaths(session.runId);
  const exampleRoot = path.resolve('example');
  fs.writeFileSync(
    path.join(paths.inputDir, 'activity-hit-preview-mrd.md'),
    fs.readFileSync(path.join(exampleRoot, 'activity-hit-preview-mrd.md'), 'utf-8'),
    'utf-8',
  );
  copyExampleProject(path.join(exampleRoot, 'marketing'), path.join(paths.projectDir, 'marketing'));
  copyExampleProject(path.join(exampleRoot, 'marketing-admin'), path.join(paths.projectDir, 'marketing-admin'));

  const pipeline = getPipeline(session.runId);
  await pipeline.start({ skipConfirmations: true });

  const finalState = getStateStore(session.runId).loadExecutionState();
  assert.equal(finalState?.status, 'completed');
  const branchNames = finalState?.workflowInstance?.branches
    .map(branch => branch.projectName)
    .sort();
  assert.deepEqual(branchNames, ['marketing', 'marketing-admin']);
  assert.equal(finalState?.workflowInstance?.executionPlan?.validation.valid, true);
  const tracksByProject = new Map(
    finalState?.workflowInstance?.executionPlan?.branches.map(branch => [
      branch.projectName,
      branch.tracks.map(track => track.kind),
    ]) ?? []
  );
  assert.deepEqual(tracksByProject.get('marketing'), ['backend', 'contract']);
  assert.deepEqual(tracksByProject.get('marketing-admin'), ['backend', 'frontend', 'e2e', 'contract']);
  for (const project of ['marketing', 'marketing-admin']) {
    const branch: {
      status?: string;
      nodes?: Array<{ id: string; status: string }>;
    } | undefined = finalState?.workflowInstance?.branches.find(item => item.projectName === project);
    assert.equal(branch?.status, 'completed', `${project} branch should complete`);
    assert.ok(
      branch?.nodes?.some(node => node.id === 'java-impl' && node.status === 'completed'),
      `${project} java node should complete`,
    );
    assert.equal(fs.existsSync(path.join(paths.artifactsDir, project, 'tech-design.md')), true);
    assert.equal(fs.existsSync(path.join(paths.artifactsDir, project, 'branch-summary.json')), true);
    assert.equal(
      fs.existsSync(path.join(paths.artifactsDir, project, 'openspec', 'changes', `run-${session.runId.toLowerCase()}-${project}`, 'tasks.md')),
      true,
      `${project} OpenSpec tasks should exist`,
    );
    const summary = JSON.parse(fs.readFileSync(path.join(paths.artifactsDir, project, 'branch-summary.json'), 'utf-8'));
    assert.equal(summary.openSpec.changeId, `run-${session.runId.toLowerCase()}-${project}`);
    assert.ok(summary.tracks.some((track: { trackId?: string }) => track.trackId === 'backend'));
  }

  const deliveryPath = path.join(paths.artifactsDir, 'cross-app', 'delivery-metadata.json');
  assert.equal(fs.existsSync(deliveryPath), true, 'delivery metadata should exist');
  const delivery = JSON.parse(fs.readFileSync(deliveryPath, 'utf-8'));
  assert.equal(delivery.branches.length, 2);
  assert.ok(delivery.branches.every((branch: { openSpec?: unknown; tracks?: unknown[] }) =>
    branch.openSpec && branch.tracks?.length
  ));
  assert.ok(getEventLog(session.runId).getAllEvents().some(event => event.type === 'fanout_decision'));

  removePipeline(session.runId);
  closeEventLog(session.runId);
  fs.rmSync(runtimeDir, { recursive: true, force: true });
});

function copyExampleProject(source: string, target: string): void {
  fs.cpSync(source, target, {
    recursive: true,
    filter: (entry) => {
      const normalized = entry.replace(/\\/g, '/');
      return !normalized.includes('/.git/') &&
        !normalized.endsWith('/.git') &&
        !normalized.includes('/target/') &&
        !normalized.endsWith('/target') &&
        !normalized.endsWith('/.DS_Store');
    },
  });
}
