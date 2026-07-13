import {
  DataPlanSchema,
  type DataPlan,
} from '../../lifecycle/testingArtifactSchemas.js';
import { buildDataPlanFromEdges } from '../../tools/testing/data.js';
import type { DataPlanAgentInput } from './types.js';

export async function generateTestingDataPlan(input: DataPlanAgentInput): Promise<DataPlan> {
  const fallback = buildDataPlanFromEdges({
    requirementId: input.requirementId,
    runId: input.runId,
    workflowInstanceId: input.workflowInstanceId,
    dataPlanId: `data-plan-${input.requirementId}`,
    isolationKey: `${input.requirementId}-${input.runId}`,
    edges: input.dependencyEdges ?? [],
    generatedAt: input.generatedAt,
  });
  if (fallback.steps.length === 0) {
    fallback.steps = [{
      id: 'data-step-primary-flow',
      action: 'api',
      description: 'Prepare isolated data for the primary testing flow.',
      validation: 'Validate seeded data is visible through the target API.',
      cleanup: `Cleanup data isolated by ${fallback.isolationKey}.`,
    }];
  }
  const generated = await input.modelGenerate?.('Generate a structured data plan using deterministic data tools.', fallback) ?? fallback;
  return DataPlanSchema.parse(generated);
}
