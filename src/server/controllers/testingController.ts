import { createTestingService } from '../../testing/index.js';

const testingService = createTestingService();

export async function startTestingWorkflow(c: any) {
  try {
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

export function getTestingWorkflowStatus(c: any) {
  try {
    const runId = c.req.param('runId');
    const workflowInstanceId = c.req.param('workflowInstanceId');
    return c.json({ workflow: testingService.getWorkflowStatus(runId, workflowInstanceId) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
}

export async function submitTestingReviewDecision(c: any) {
  try {
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

export function listTestingArtifacts(c: any) {
  try {
    return c.json({
      artifacts: testingService.listArtifacts({
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

export function getTestingArtifact(c: any) {
  try {
    const saved = testingService.getArtifact(c.req.param('runId'), c.req.param('artifactId'));
    return c.json({ artifact: saved.artifact, ref: saved.ref });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
}

export function getTestingExecutionReport(c: any) {
  try {
    const saved = testingService.getExecutionReport(c.req.param('runId'), c.req.param('artifactId'));
    return c.json({ report: saved.artifact, ref: saved.ref });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
  }
}

export function getTestingDashboard(c: any) {
  try {
    return c.json({ dashboard: testingService.getDashboard(c.req.param('runId'), stringValue(c.req.query('workflowInstanceId')) || undefined) });
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
