import * as assert from 'assert/strict';
import test from 'node:test';
import {
  createEmptyLifecycleState,
  loadLifecycleState,
  saveLifecycleState,
} from '../lifecycle/index.js';
import {
  getTestingArtifact,
  getTestingDashboard,
  getTestingExecutionReport,
  getTestingWorkflowStatus,
  listTestingArtifacts,
  startTestingWorkflow,
  submitTestingReviewDecision,
} from '../server/controllers/testingController.js';

test('testing controller starts workflow and exposes status artifacts dashboard and reports', async () => {
  const runId = 'testing-controller-run';
  saveLifecycleState(createLifecycle(runId));

  const start = await startTestingWorkflow(fakeContext({
    body: {
      requirementId: 'req-testing-controller',
      runId,
      workflowInstanceId: 'wf-testing-controller',
      requirementSummary: 'Checkout creates order',
      appIds: ['checkout'],
      autoApproveReviews: true,
      dryRunExecution: true,
    },
  }));
  assert.equal(start.status, 200);
  assert.equal(start.body.workflow.status, 'completed');

  const status = getTestingWorkflowStatus(fakeContext({
    params: { runId, workflowInstanceId: 'wf-testing-controller' },
  }));
  assert.equal(status.body.workflow.status, 'completed');

  const artifacts = listTestingArtifacts(fakeContext({ params: { runId } }));
  assert.equal(artifacts.body.artifacts.length > 0, true);

  const reportRef = artifacts.body.artifacts.find((ref: any) => ref.type === 'testing-execution-report');
  assert.ok(reportRef);
  const report = getTestingExecutionReport(fakeContext({
    params: { runId, artifactId: reportRef.artifactId },
  }));
  assert.equal(report.status, 200);
  assert.equal(report.body.report.artifactKind, 'testing-execution-report');

  const artifact = getTestingArtifact(fakeContext({
    params: { runId, artifactId: reportRef.artifactId },
  }));
  assert.equal(artifact.body.artifact.executionReportId, report.body.report.executionReportId);

  const dashboard = getTestingDashboard(fakeContext({ params: { runId } }));
  assert.equal(dashboard.body.dashboard.lifecycle.runId, runId);
  assert.equal(dashboard.body.dashboard.executionReports.length, 1);
});

test('testing controller review endpoint resumes approved gate', async () => {
  const runId = 'testing-controller-review-run';
  saveLifecycleState(createLifecycle(runId));

  const start = await startTestingWorkflow(fakeContext({
    body: {
      requirementId: 'req-testing-controller',
      runId,
      workflowInstanceId: 'wf-testing-controller-review',
      requirementSummary: 'Checkout creates order',
      appIds: ['checkout'],
      autoApproveReviews: false,
      dryRunExecution: true,
    },
  }));
  const token = start.body.workflow.pendingGate.resumeToken;

  const reviewed = await submitTestingReviewDecision(fakeContext({
    params: { runId, workflowInstanceId: 'wf-testing-controller-review' },
    body: {
      resumeToken: token,
      decision: 'approved',
      dryRunExecution: true,
    },
  }));

  assert.equal(reviewed.status, 200);
  assert.equal(reviewed.body.workflow.pendingGate.nodeId, 'review_cases');
  assert.equal((loadLifecycleState(runId)?.artifacts.length ?? 0) > 1, true);
});

test('testing controller returns validation errors', async () => {
  const response = await startTestingWorkflow(fakeContext({ body: { runId: 'missing-req' } }));
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'requirementId is required');
});

function createLifecycle(runId: string) {
  const state = createEmptyLifecycleState({
    requirementId: 'req-testing-controller',
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
  state.environments.push({
    environmentId: 'env-testing-controller',
    requirementId: state.requirementId,
    runId,
    mode: 'local-simulated',
  });
  state.deploymentSets.push({
    deploymentSetId: 'deployment-set-testing-controller',
    requirementId: state.requirementId,
    runId,
    version: 1,
    environmentId: 'env-testing-controller',
    appIds: ['checkout'],
    pipelineRunIds: [],
    artifactIds: [],
    createdAt: 1000,
  });
  return state;
}

function fakeContext(args: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
} = {}) {
  return {
    req: {
      param: (name: string) => args.params?.[name] ?? '',
      query: (name: string) => args.query?.[name] ?? '',
      json: async () => args.body ?? {},
    },
    json: (body: unknown, status = 200) => ({ body, status }),
  };
}
