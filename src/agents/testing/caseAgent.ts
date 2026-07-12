import {
  TestCaseSchema,
  type TestCase,
} from '../../testing/artifacts.js';
import type { CaseAgentInput } from './types.js';

export async function generateTestingCases(input: CaseAgentInput): Promise<TestCase> {
  const fallback: TestCase = {
    schemaVersion: 1,
    artifactKind: 'testing-test-cases',
    requirementId: input.requirementId,
    runId: input.runId,
    workflowInstanceId: input.workflowInstanceId,
    sourceNodeId: 'generate_cases',
    status: 'draft',
    generatedAt: input.generatedAt ?? Date.now(),
    upstreamArtifactIds: [],
    caseSetId: `cases-${input.requirementId}`,
    cases: [{
      testCaseId: 'case-primary-flow',
      title: 'Primary requirement integration flow',
      appIds: input.strategy.scope.appIds,
      priority: 'p0',
      preconditions: input.strategy.assumptions,
      steps: input.strategy.objectives,
      expectedResult: 'Requirement flow succeeds and evidence is captured.',
      requirementRefs: [input.requirementId],
      tags: input.strategy.testLevels,
    }],
  };
  const generated = await input.modelGenerate?.('Generate structured testing cases from the approved strategy.', fallback) ?? fallback;
  return TestCaseSchema.parse(generated);
}
