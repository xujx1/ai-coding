import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import test from 'node:test';
import {
  createEmptyLifecycleState,
  loadLifecycleState,
  saveLifecycleState,
  TESTING_ARTIFACT_TYPES,
} from '../lifecycle/index.js';
import { ensureRunDirectories } from '../runtime/paths.js';
import {
  createTestingService,
  TestStrategySchema,
  type TestStrategy,
} from '../testing/index.js';

test('testing artifact schemas validate traceable strategy metadata', () => {
  const strategy = strategyArtifact({
    requirementId: 'req-testing-schema',
    runId: 'testing-schema-run',
    workflowInstanceId: 'testing-workflow-1',
    sourceNodeId: 'generate_strategy',
  });

  const parsed = TestStrategySchema.parse(strategy);

  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.artifactKind, 'testing-strategy');
  assert.equal(parsed.requirementId, 'req-testing-schema');
  assert.equal(parsed.runId, 'testing-schema-run');
  assert.equal(parsed.workflowInstanceId, 'testing-workflow-1');
  assert.equal(parsed.sourceNodeId, 'generate_strategy');
  assert.ok(TESTING_ARTIFACT_TYPES.includes(parsed.artifactKind));
});

test('testing service writes artifacts through run paths and lifecycle refs', () => {
  const runId = 'testing-service-artifact-run';
  const state = createEmptyLifecycleState({
    requirementId: 'req-testing-service',
    runId,
    now: 1000,
  });
  saveLifecycleState(state);

  const service = createTestingService();
  const saved = service.createArtifact({
    artifactId: 'artifact-testing-strategy',
    artifact: strategyArtifact({
      requirementId: state.requirementId,
      runId,
      workflowInstanceId: 'testing-workflow-1',
      sourceNodeId: 'generate_strategy',
    }),
  });

  const paths = ensureRunDirectories(runId);
  assert.equal(saved.ref.artifactId, 'artifact-testing-strategy');
  assert.equal(saved.ref.type, 'testing-strategy');
  assert.equal(saved.ref.sourceType, 'testing');
  assert.equal(saved.ref.path?.startsWith('artifacts/testing/testing-workflow-1/generate_strategy/'), true);
  assert.equal(fs.existsSync(path.join(paths.runDir, saved.ref.path!)), true);

  const loaded = service.getArtifact<TestStrategy>(runId, saved.ref.artifactId);
  assert.equal(loaded.artifact.strategyId, 'strategy-1');
  assert.equal(loaded.artifact.title, 'Requirement testing strategy');

  const persistedState = loadLifecycleState(runId);
  assert.equal(persistedState?.artifacts.some(ref => ref.artifactId === saved.ref.artifactId), true);
});

test('testing service lists artifacts and links terminal test runs', () => {
  const runId = 'testing-service-test-run';
  const state = createEmptyLifecycleState({
    requirementId: 'req-testing-runs',
    runId,
    now: 1000,
  });
  saveLifecycleState(state);

  const service = createTestingService();
  const saved = service.createArtifact({
    artifactId: 'artifact-terminal-strategy',
    artifact: strategyArtifact({
      requirementId: state.requirementId,
      runId,
      workflowInstanceId: 'testing-workflow-2',
      sourceNodeId: 'generate_strategy',
    }),
  });

  const refs = service.listArtifacts({
    runId,
    type: 'testing-strategy',
    workflowInstanceId: 'testing-workflow-2',
  });
  assert.deepEqual(refs.map(ref => ref.artifactId), ['artifact-terminal-strategy']);

  const testRun = service.recordTerminalTestRun({
    runId,
    testRunId: 'test-run-1',
    deploymentSetId: 'deployment-set-1',
    environmentId: 'env-1',
    status: 'skipped',
    artifactIds: [saved.ref.artifactId],
  });
  assert.equal(testRun.status, 'skipped');
  assert.deepEqual(testRun.artifactIds, ['artifact-terminal-strategy']);

  const linked = service.linkArtifactToTestRun({
    runId,
    testRunId: 'test-run-1',
    artifactIds: [saved.ref.artifactId],
    evidenceArtifactIds: ['evidence-1'],
  });
  assert.deepEqual(linked.artifactIds, ['artifact-terminal-strategy']);
  assert.deepEqual(linked.evidenceArtifactIds, ['evidence-1']);
});

function strategyArtifact(args: {
  requirementId: string;
  runId: string;
  workflowInstanceId: string;
  sourceNodeId: string;
}): TestStrategy {
  return {
    schemaVersion: 1,
    artifactKind: 'testing-strategy',
    requirementId: args.requirementId,
    runId: args.runId,
    workflowInstanceId: args.workflowInstanceId,
    sourceNodeId: args.sourceNodeId,
    status: 'draft',
    generatedAt: 1001,
    upstreamArtifactIds: [],
    strategyId: 'strategy-1',
    title: 'Requirement testing strategy',
    scope: {
      appIds: ['checkout'],
      risks: ['cross-app data setup'],
    },
    objectives: ['Validate primary requirement flow'],
    testLevels: ['integration'],
    assumptions: [],
  };
}
