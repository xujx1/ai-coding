import * as assert from 'assert/strict';
import test from 'node:test';
import {
  createEmptyLifecycleState,
  loadLifecycleState,
  saveLifecycleState,
} from '../lifecycle/index.js';
import {
  createTestingWorkflowRuntime,
} from '../workflows/runtime/testing/index.js';
import { InMemoryTestingRepositoryResolver } from '../platform-sources/testingRepositoryResolver.js';
import {
  TESTING_WORKFLOW_NODES,
} from '../workflows/definitions/testing/index.js';

test('testing workflow executes ordered nodes and records terminal test run', async () => {
  const runId = 'testing-workflow-complete-run';
  saveLifecycleState(createLifecycle(runId, true));

  const runtime = configuredRuntime();
  const result = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-complete',
    requirementSummary: 'Checkout creates order',
    appIds: ['checkout'],
    autoApproveReviews: true,
    dryRunExecution: true,
    now: 1000,
  });

  assert.equal(result.state.status, 'completed');
  assert.deepEqual(result.state.nodes.map(node => node.nodeId), TESTING_WORKFLOW_NODES.map(node => node.id));
  assert.equal(result.state.nodes.find(node => node.nodeId === 'failure_triage')?.status, 'skipped');
  assert.equal(result.state.nodes.find(node => node.nodeId === 'persist_artifacts')?.status, 'succeeded');

  const lifecycle = loadLifecycleState(runId);
  assert.equal(lifecycle?.testRuns[0].status, 'passed');
  assert.equal(lifecycle?.artifacts.some(ref => ref.type === 'testing-coverage-report'), true);
});

test('testing workflow can advance through PI testing stage boundaries', async () => {
  const runId = 'testing-workflow-segmented-run';
  saveLifecycleState(createLifecycle(runId, true));

  const runtime = configuredRuntime();
  const cases = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-segmented',
    requirementSummary: 'Checkout creates order',
    appIds: ['checkout'],
    autoApproveReviews: true,
    dryRunExecution: true,
    stopAfterNode: 'review_cases',
    now: 1000,
  });

  assert.equal(cases.state.status, 'pending');
  assert.equal(cases.state.currentNodeId, 'generate_data_plans');
  assert.equal(cases.state.nodes.find(node => node.nodeId === 'review_cases')?.status, 'succeeded');

  const data = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-segmented',
    autoApproveReviews: true,
    dryRunExecution: true,
    continueExisting: true,
    stopAfterNode: 'review_data_plans',
    now: 1001,
  });
  assert.equal(data.state.currentNodeId, 'generate_scripts');

  const scripts = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-segmented',
    autoApproveReviews: true,
    dryRunExecution: true,
    continueExisting: true,
    stopAfterNode: 'review_scripts',
    now: 1002,
  });
  assert.equal(scripts.state.currentNodeId, 'deploy_related_apps');

  const deployed = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-segmented',
    autoApproveReviews: true,
    dryRunExecution: true,
    continueExisting: true,
    stopAfterNode: 'deploy_related_apps',
    now: 1003,
  });
  assert.equal(deployed.state.currentNodeId, 'execute_scripts');

  const completed = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-segmented',
    autoApproveReviews: true,
    dryRunExecution: true,
    continueExisting: true,
    now: 1004,
  });
  assert.equal(completed.state.status, 'completed');
  assert.equal(loadLifecycleState(runId)?.testRuns[0].status, 'passed');
});

test('testing workflow pauses for review and approve resume preserves upstream artifacts', async () => {
  const runId = 'testing-workflow-review-run';
  saveLifecycleState(createLifecycle(runId, true));

  const runtime = configuredRuntime();
  const paused = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-review',
    requirementSummary: 'Checkout creates order',
    appIds: ['checkout'],
    autoApproveReviews: false,
    dryRunExecution: true,
    now: 1000,
  });

  assert.equal(paused.state.status, 'waiting_review');
  assert.equal(paused.state.pendingGate?.nodeId, 'review_strategy');
  const artifactCount = loadLifecycleState(runId)?.artifacts.length ?? 0;

  const resumed = await runtime.resume({
    runId,
    workflowInstanceId: 'wf-testing-review',
    resumeToken: paused.state.pendingGate!.resumeToken,
    decision: 'approved',
    autoApproveReviews: false,
    dryRunExecution: true,
    now: 1001,
  });

  assert.equal(resumed.state.status, 'waiting_review');
  assert.equal(resumed.state.pendingGate?.nodeId, 'review_cases');
  assert.equal((loadLifecycleState(runId)?.artifacts.length ?? 0) > artifactCount, true);
  assert.equal(resumed.context.artifacts.strategy?.strategyId, 'strategy-req-testing-workflow');
});

test('testing workflow records change-request review without regenerating artifacts', async () => {
  const runId = 'testing-workflow-change-request-run';
  saveLifecycleState(createLifecycle(runId, true));

  const runtime = configuredRuntime();
  const paused = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-change-request',
    requirementSummary: 'Checkout creates order',
    appIds: ['checkout'],
    autoApproveReviews: false,
    dryRunExecution: true,
  });
  const artifactCount = loadLifecycleState(runId)?.artifacts.length ?? 0;

  const changed = await runtime.resume({
    runId,
    workflowInstanceId: 'wf-testing-change-request',
    resumeToken: paused.state.pendingGate!.resumeToken,
    decision: 'needs_changes',
    feedback: 'Add payment failure case.',
  });

  assert.equal(changed.state.status, 'waiting_review');
  assert.equal(changed.state.blockedReason, 'Add payment failure case.');
  assert.equal(loadLifecycleState(runId)?.artifacts.length, artifactCount);
});

test('testing workflow blocks execution when deployment context is missing', async () => {
  const runId = 'testing-workflow-blocked-run';
  saveLifecycleState(createLifecycle(runId, false));

  const runtime = configuredRuntime();
  const result = await runtime.start({
    requirementId: 'req-testing-workflow',
    runId,
    workflowInstanceId: 'wf-testing-blocked',
    requirementSummary: 'Checkout creates order',
    appIds: ['checkout'],
    autoApproveReviews: true,
    dryRunExecution: true,
  });

  assert.equal(result.state.status, 'blocked');
  assert.equal(result.state.currentNodeId, 'deploy_related_apps');
  assert.match(result.state.blockedReason ?? '', /Missing deployment/);
  assert.equal(result.state.nodes.find(node => node.nodeId === 'generate_data_plans')?.status, 'succeeded');
});

test('testing workflow reports a configuration wait instead of using an implicit repository', async () => {
  const runId = 'testing-workflow-no-repository-run';
  saveLifecycleState(createLifecycle(runId, true));
  const result = await createTestingWorkflowRuntime().start({
    requirementId: 'req-testing-workflow', runId, workflowInstanceId: 'wf-testing-no-repository',
    requirementSummary: 'Checkout creates order', appIds: ['checkout'], autoApproveReviews: true, dryRunExecution: true,
  });
  assert.equal(result.state.status, 'blocked');
  assert.equal(result.state.currentNodeId, 'generate_scripts');
  assert.match(result.state.blockedReason ?? '', /No compatible integration testing repository/);
});

function configuredRuntime() {
  return createTestingWorkflowRuntime({
    repositoryResolver: new InMemoryTestingRepositoryResolver([{
      repositoryId: 'testing-fixture', root: process.cwd(), repositoryType: 'integration',
      commands: { test: 'npm test' }, capabilities: ['http'], applicationIds: ['checkout'],
    }]),
  });
}

function createLifecycle(runId: string, withDeployment: boolean) {
  const state = createEmptyLifecycleState({
    requirementId: 'req-testing-workflow',
    runId,
    apps: [{
      appId: 'checkout',
      role: 'primary',
      status: 'deployed',
      artifactIds: [],
      ciRunIds: [],
      testRunIds: [],
    }],
    metadata: {
      requirementSummary: 'Checkout creates order',
    },
    now: 1000,
  });
  if (withDeployment) {
    state.environments.push({
      environmentId: 'env-testing',
      requirementId: state.requirementId,
      runId,
      mode: 'local-simulated',
    });
    state.deploymentSets.push({
      deploymentSetId: 'deployment-set-testing',
      requirementId: state.requirementId,
      runId,
      version: 1,
      environmentId: 'env-testing',
      appIds: ['checkout'],
      pipelineRunIds: [],
      artifactIds: [],
      createdAt: 1000,
    });
  }
  return state;
}
