import {
  FailureTriageSchema,
  type FailureTriage,
} from '../../testing/artifacts.js';
import { classifyWithAiOpsReference } from '../../lifecycle/externalAdapters.js';
import type { FailureTriageAgentInput } from './types.js';

export async function triageTestingFailure(input: FailureTriageAgentInput): Promise<FailureTriage> {
  const operational = classifyWithAiOpsReference(input.message);
  const category = classifyTestingFailure(input.message, operational.category);
  const fallback: FailureTriage = {
    schemaVersion: 1,
    artifactKind: 'testing-failure-triage',
    requirementId: input.requirementId,
    runId: input.runId,
    workflowInstanceId: input.workflowInstanceId,
    sourceNodeId: 'failure_triage',
    status: 'draft',
    generatedAt: input.generatedAt ?? Date.now(),
    upstreamArtifactIds: [],
    triageId: `triage-${input.requirementId}`,
    category,
    confidence: category === 'operational' ? operational.confidence : 0.7,
    summary: input.message,
    evidenceArtifactIds: input.evidenceArtifactIds ?? [],
    recommendedActions: recommendedActions(category),
  };
  const generated = await input.modelGenerate?.('Classify testing failure and recommend next actions.', fallback) ?? fallback;
  return FailureTriageSchema.parse(generated);
}

function classifyTestingFailure(
  message: string,
  opsCategory: ReturnType<typeof classifyWithAiOpsReference>['category'],
): FailureTriage['category'] {
  const text = message.toLowerCase();
  if (opsCategory === 'ENVIRONMENT' || opsCategory === 'CI_INFRA' || opsCategory === 'CONFIGURATION') return 'operational';
  if (/module not found|importerror|command not found|enoent/.test(text)) return 'dependency';
  if (/seed|fixture|cleanup|data|isolation/.test(text)) return 'data';
  if (/syntax|pytest|script/.test(text)) return 'script';
  if (/assert|expected|actual|regression|bug/.test(text)) return 'application_regression';
  return 'test';
}

function recommendedActions(category: FailureTriage['category']): string[] {
  if (category === 'operational') return ['Check environment readiness and deployment health.'];
  if (category === 'dependency') return ['Install or declare missing test execution dependencies.'];
  if (category === 'data') return ['Review data setup, validation, cleanup, and isolation keys.'];
  if (category === 'script') return ['Regenerate or review the generated script.'];
  if (category === 'application_regression') return ['Open a fix cycle against the impacted application branch.'];
  return ['Review test case assumptions and captured evidence.'];
}
