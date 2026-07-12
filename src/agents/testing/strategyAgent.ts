import {
  TestStrategySchema,
  type TestStrategy,
} from '../../testing/artifacts.js';
import type { StrategyAgentInput } from './types.js';

export async function generateTestingStrategy(input: StrategyAgentInput): Promise<TestStrategy> {
  const fallback: TestStrategy = {
    schemaVersion: 1,
    artifactKind: 'testing-strategy',
    requirementId: input.requirementId,
    runId: input.runId,
    workflowInstanceId: input.workflowInstanceId,
    sourceNodeId: 'generate_strategy',
    status: 'draft',
    generatedAt: input.generatedAt ?? Date.now(),
    upstreamArtifactIds: [],
    strategyId: `strategy-${input.requirementId}`,
    title: 'Requirement testing strategy',
    scope: {
      appIds: input.appIds,
      requirementSummary: input.requirementSummary,
      risks: input.risks ?? [],
    },
    objectives: [
      'Validate the primary requirement flow.',
      'Verify cross-application and data side effects.',
      'Capture enough evidence for triage and regression planning.',
    ],
    testLevels: ['integration', 'contract', 'regression'],
    assumptions: [],
  };
  const generated = await input.modelGenerate?.('Generate a structured testing strategy artifact.', fallback) ?? fallback;
  return TestStrategySchema.parse(generated);
}
