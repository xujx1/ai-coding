import {
  RegressionPlanSchema,
  type RegressionPlan,
} from '../../lifecycle/testingArtifactSchemas.js';
import type { RegressionAgentInput } from './types.js';

export async function planTestingRegression(input: RegressionAgentInput): Promise<RegressionPlan> {
  const fallback: RegressionPlan = {
    schemaVersion: 1,
    artifactKind: 'testing-regression-plan',
    requirementId: input.requirementId,
    runId: input.runId,
    workflowInstanceId: input.workflowInstanceId,
    sourceNodeId: 'regression_update',
    status: 'draft',
    generatedAt: input.generatedAt ?? Date.now(),
    upstreamArtifactIds: [],
    regressionPlanId: `regression-${input.requirementId}`,
    rerunCaseIds: input.failedCaseIds,
    impactedAppIds: input.impactedAppIds,
    dependencyRefs: input.dependencyRefs ?? [],
    rationale: input.triage
      ? `Regression scope selected from ${input.triage.category} triage.`
      : 'Regression scope selected from failed testing cases and impacted apps.',
  };
  const generated = await input.modelGenerate?.('Plan testing regression rerun scope.', fallback) ?? fallback;
  return RegressionPlanSchema.parse(generated);
}
