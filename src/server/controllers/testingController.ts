import { createTestingService } from '../../testing/index.js';
import { createTestingWorkflowRuntime } from '../../workflows/runtime/testing/index.js';
import type { TestingRepositoryResolver } from '../../platform-sources/testingRepositoryResolver.js';
import type { NodeLeaseExecutor } from '../../storage/nodeLeaseExecutor.js';
import type { LifecycleStatePersistence } from '../../storage/lifecycleStatePersistence.js';
import type { FencedRuntimeTransitionCommitter } from '../../storage/runtimeNodeTransition.js';
import type { PipelineArtifactWriter } from '../../storage/pipelineArtifactWriter.js';

function testingServiceFor(
  repositoryResolver?: TestingRepositoryResolver,
  nodeLeaseExecutor?: NodeLeaseExecutor,
  lifecyclePersistence?: LifecycleStatePersistence,
  transitionCommitter?: FencedRuntimeTransitionCommitter,
  artifactWriter?: PipelineArtifactWriter,
) {
  return createTestingService({
    runtime: createTestingWorkflowRuntime({ repositoryResolver, nodeLeaseExecutor, lifecyclePersistence, transitionCommitter, artifactWriter }),
    lifecyclePersistence,
  });
}

export async function startTestingWorkflow(c: any, repositoryResolver?: TestingRepositoryResolver, nodeLeaseExecutor?: NodeLeaseExecutor, lifecyclePersistence?: LifecycleStatePersistence, transitionCommitter?: FencedRuntimeTransitionCommitter, artifactWriter?: PipelineArtifactWriter) {
  try {
    const testingService = testingServiceFor(repositoryResolver, nodeLeaseExecutor, lifecyclePersistence, transitionCommitter, artifactWriter);
    const body = await c.req.json().catch(() => ({}));
    const requirementId = stringValue(body.requirementId);
    const runId = stringValue(body.runId);
    if (!requirementId) return c.json({ error: 'requirementId is required' }, 400);
    if (!runId) return c.json({ error: 'runId is required' }, 400);
    const result = await testingService.startWorkflow({
      requirementId,
      runId,
      workflowInstanceId: stringValue(body.workflowInstanceId) || undefined,
      requirementSummary: stringValue(body.requirementSummary) || undefined,
      appIds: stringArray(body.appIds),
      dependencyEdges: Array.isArray(body.dependencyEdges) ? body.dependencyEdges : undefined,
      deploymentSetId: stringValue(body.deploymentSetId) || undefined,
      environmentId: stringValue(body.environmentId) || undefined,
      autoApproveReviews: body.autoApproveReviews === true,
      dryRunExecution: body.dryRunExecution === true,
    });
    return c.json({ workflow: result.state, artifacts: result.context.refs });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export async function getTestingWorkflowStatus(c: any, repositoryResolver?: TestingRepositoryResolver, lifecyclePersistence?: LifecycleStatePersistence, transitionCommitter?: FencedRuntimeTransitionCommitter) {
  try {
    const testingService = testingServiceFor(repositoryResolver, undefined, lifecyclePersistence, transitionCommitter);
    const runId = c.req.param('runId');
    const workflowInstanceId = c.req.param('workflowInstanceId');
    return c.json({ workflow: await testingService.getWorkflowStatusAsync(runId, workflowInstanceId) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
}

export async function submitTestingReviewDecision(c: any, repositoryResolver?: TestingRepositoryResolver, nodeLeaseExecutor?: NodeLeaseExecutor, lifecyclePersistence?: LifecycleStatePersistence, transitionCommitter?: FencedRuntimeTransitionCommitter, artifactWriter?: PipelineArtifactWriter) {
  try {
    const testingService = testingServiceFor(repositoryResolver, nodeLeaseExecutor, lifecyclePersistence, transitionCommitter, artifactWriter);
    const body = await c.req.json().catch(() => ({}));
    const decision = stringValue(body.decision);
    if (decision !== 'approved' && decision !== 'needs_changes' && decision !== 'cancelled') {
      return c.json({ error: 'decision must be approved, needs_changes, or cancelled' }, 400);
    }
    const result = await testingService.resumeWorkflow({
      runId: c.req.param('runId'),
      workflowInstanceId: c.req.param('workflowInstanceId'),
      resumeToken: stringValue(body.resumeToken),
      decision,
      feedback: stringValue(body.feedback) || undefined,
      autoApproveReviews: body.autoApproveReviews === true,
      dryRunExecution: body.dryRunExecution === true,
    });
    return c.json({ workflow: result.state });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export async function listTestingArtifacts(c: any, repositoryResolver?: TestingRepositoryResolver, lifecyclePersistence?: LifecycleStatePersistence) {
  try {
    const testingService = testingServiceFor(repositoryResolver, undefined, lifecyclePersistence);
    return c.json({
      artifacts: await testingService.listArtifactsAsync({
        runId: c.req.param('runId'),
        type: stringValue(c.req.query('type')) as any,
        workflowInstanceId: stringValue(c.req.query('workflowInstanceId')) || undefined,
        testRunId: stringValue(c.req.query('testRunId')) || undefined,
      }),
    });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
}

export async function getTestingArtifact(c: any, repositoryResolver?: TestingRepositoryResolver, lifecyclePersistence?: LifecycleStatePersistence) {
  try {
    const testingService = testingServiceFor(repositoryResolver, undefined, lifecyclePersistence);
    const saved = await testingService.getArtifactAsync(c.req.param('runId'), c.req.param('artifactId'));
    return c.json({ artifact: saved.artifact, ref: saved.ref });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
}

export async function getTestingExecutionReport(c: any, repositoryResolver?: TestingRepositoryResolver, lifecyclePersistence?: LifecycleStatePersistence) {
  try {
    const testingService = testingServiceFor(repositoryResolver, undefined, lifecyclePersistence);
    const saved = await testingService.getExecutionReportAsync(c.req.param('runId'), c.req.param('artifactId'));
    return c.json({ report: saved.artifact, ref: saved.ref });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
}

export async function getTestingDashboard(c: any, repositoryResolver?: TestingRepositoryResolver, lifecyclePersistence?: LifecycleStatePersistence, transitionCommitter?: FencedRuntimeTransitionCommitter) {
  try {
    const testingService = testingServiceFor(repositoryResolver, undefined, lifecyclePersistence, transitionCommitter);
    return c.json({ dashboard: await testingService.getDashboardAsync(c.req.param('runId'), stringValue(c.req.query('workflowInstanceId')) || undefined) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}
