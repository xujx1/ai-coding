import {
  QualityGateResultSchema,
  type QualityGateResult,
} from '../../testing/artifacts.js';
import type { ScriptReviewAgentInput } from './types.js';

export async function reviewTestingScripts(input: ScriptReviewAgentInput): Promise<QualityGateResult> {
  const reasons: string[] = [];
  if (input.scripts.length < (input.minimumScriptCount ?? 1)) {
    reasons.push('No generated scripts are available for execution.');
  }
  for (const script of input.scripts) {
    if (!script.command.includes('pytest')) reasons.push(`Script ${script.scriptId} does not use pytest.`);
    if (!script.testCaseIds.length) reasons.push(`Script ${script.scriptId} is not linked to a test case.`);
    if (!script.content.trim()) reasons.push(`Script ${script.scriptId} has empty content.`);
  }
  const fallback: QualityGateResult = {
    schemaVersion: 1,
    artifactKind: 'testing-quality-gate',
    requirementId: input.requirementId,
    runId: input.runId,
    workflowInstanceId: input.workflowInstanceId,
    sourceNodeId: 'review_scripts',
    status: reasons.length ? 'failed' : 'passed',
    generatedAt: input.generatedAt ?? Date.now(),
    upstreamArtifactIds: [],
    qualityGateId: `script-review-${input.requirementId}`,
    decision: reasons.length ? 'failed' : 'passed',
    reasons,
    metricArtifactIds: [],
  };
  const generated = await input.modelGenerate?.('Review generated testing scripts for execution readiness.', fallback) ?? fallback;
  return QualityGateResultSchema.parse(generated);
}
