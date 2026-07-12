import * as assert from 'assert/strict';
import test from 'node:test';
import {
  DEFAULT_TESTING_AGENTS,
  generateTestingStrategy,
  triageTestingFailure,
} from '../agents/testing/index.js';
import type { TestStrategy } from '../testing/index.js';

test('testing strategy agent validates structured model output', async () => {
  const strategy = await generateTestingStrategy({
    requirementId: 'req-agent',
    runId: 'run-agent',
    workflowInstanceId: 'wf-agent',
    requirementSummary: 'Checkout should create an order.',
    appIds: ['checkout', 'orders'],
    generatedAt: 1000,
    modelGenerate: <T>(_prompt: string, fallback: T) => ({
      ...fallback,
      strategyId: 'strategy-from-model',
      title: 'Model strategy',
    }) as T,
  });

  assert.equal(strategy.strategyId, 'strategy-from-model');
  assert.deepEqual(strategy.scope.appIds, ['checkout', 'orders']);
});

test('testing default agents generate cases, data plans, script review, triage, and regression plans', async () => {
  const strategy = await DEFAULT_TESTING_AGENTS.generateStrategy({
    requirementId: 'req-agent-flow',
    runId: 'run-agent-flow',
    workflowInstanceId: 'wf-agent-flow',
    requirementSummary: 'Checkout should create an order.',
    appIds: ['checkout'],
    generatedAt: 1000,
  });
  const caseSet = await DEFAULT_TESTING_AGENTS.generateCases({
    requirementId: 'req-agent-flow',
    runId: 'run-agent-flow',
    workflowInstanceId: 'wf-agent-flow',
    strategy,
    generatedAt: 1000,
  });
  const dataPlan = await DEFAULT_TESTING_AGENTS.generateDataPlan({
    requirementId: 'req-agent-flow',
    runId: 'run-agent-flow',
    workflowInstanceId: 'wf-agent-flow',
    caseSet,
    dependencyEdges: [{
      edgeId: 'edge-1',
      type: 'publish',
      source: 'checkout',
      target: 'order-topic',
      metadata: { topic: 'ORDER_CREATED' },
    }],
    generatedAt: 1000,
  });
  const review = await DEFAULT_TESTING_AGENTS.reviewScripts({
    requirementId: 'req-agent-flow',
    runId: 'run-agent-flow',
    workflowInstanceId: 'wf-agent-flow',
    scripts: [],
    generatedAt: 1000,
  });
  const triage = await DEFAULT_TESTING_AGENTS.triageFailure({
    requirementId: 'req-agent-flow',
    runId: 'run-agent-flow',
    workflowInstanceId: 'wf-agent-flow',
    message: 'ModuleNotFoundError: No module named pytest',
    generatedAt: 1000,
  });
  const regression = await DEFAULT_TESTING_AGENTS.planRegression({
    requirementId: 'req-agent-flow',
    runId: 'run-agent-flow',
    workflowInstanceId: 'wf-agent-flow',
    failedCaseIds: ['case-primary-flow'],
    impactedAppIds: ['checkout'],
    dependencyRefs: ['edge-1'],
    triage,
    generatedAt: 1000,
  });

  assert.equal(caseSet.cases[0].testCaseId, 'case-primary-flow');
  assert.equal(dataPlan.steps.length, 1);
  assert.equal(review.decision, 'failed');
  assert.equal(triage.category, 'dependency');
  assert.deepEqual(regression.rerunCaseIds, ['case-primary-flow']);
  assert.deepEqual(regression.dependencyRefs, ['edge-1']);
});

test('testing failure triage reuses operational classification for environment failures', async () => {
  const triage = await triageTestingFailure({
    requirementId: 'req-agent-triage',
    runId: 'run-agent-triage',
    workflowInstanceId: 'wf-agent-triage',
    message: 'readiness health check failed after deploy',
    evidenceArtifactIds: ['evidence-health'],
    generatedAt: 1000,
  });

  assert.equal(triage.category, 'operational');
  assert.equal(triage.evidenceArtifactIds[0], 'evidence-health');
  assert.equal(triage.recommendedActions.length > 0, true);
});
