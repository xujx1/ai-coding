import { getPlanNodeContract, isRegisteredPlanNodeType } from './planNodeRegistry.js';
import type { PlanValidationIssue, SessionExecutionPlan } from './sessionPlan.js';

export function validateStructuredPlanDocument(plan: unknown): PlanValidationIssue[] {
  const issues: PlanValidationIssue[] = [];
  if (!plan || typeof plan !== 'object') {
    return [issue('invalid-plan-document', 'Planner output must be a JSON object.')];
  }
  const value = plan as Partial<SessionExecutionPlan>;
  if (value.schemaVersion !== 1) {
    issues.push(issue('invalid-schema-version', 'Planner output must use schemaVersion 1.'));
  }
  if (!value.runId) {
    issues.push(issue('missing-run-id', 'Planner output must include runId.'));
  }
  if (!value.currentRevisionId) {
    issues.push(issue('missing-plan-revision', 'Planner output must include currentRevisionId.'));
  }
  if (!Array.isArray(value.revisions)) {
    issues.push(issue('missing-plan-revisions', 'Planner output must include revisions array.'));
  }
  if (!value.migration || typeof value.migration !== 'object') {
    issues.push(issue('missing-plan-migration', 'Planner output must include migration metadata.'));
  }
  if (!Array.isArray(value.nodeContracts)) {
    issues.push(issue('missing-node-contracts', 'Planner output must include node contract summaries.'));
  }
  if (!Array.isArray(value.branches)) {
    issues.push(issue('missing-branches', 'Planner output must include branches array.'));
    return issues;
  }
  for (const branch of value.branches) {
    if (!branch?.branchId) issues.push(issue('missing-branch-id', 'Branch is missing branchId.'));
    if (!Array.isArray(branch?.nodes)) {
      issues.push(issue('missing-branch-nodes', 'Branch is missing nodes array.', branch?.branchId));
      continue;
    }
    const nodeIds = new Set(branch.nodes.map(node => String(node?.id ?? '')));
    for (const node of branch.nodes) {
      if (!node?.id) issues.push(issue('missing-node-id', 'Node is missing id.', branch?.branchId));
      if (!node?.type || !isRegisteredPlanNodeType(String(node.type))) {
        issues.push(issue('unknown-node-type', `Node '${node?.id ?? 'unknown'}' uses unknown type '${String(node?.type ?? '')}'.`, branch?.branchId, undefined, node?.id));
        continue;
      }
      const contract = getPlanNodeContract(node.type);
      if (contract && node.runner !== contract.runner) {
        issues.push(issue('runner-contract-mismatch', `Node '${node.id}' runner '${node.runner}' does not match registered runner '${contract.runner}'.`, branch?.branchId, node.trackId, node.id));
      }
      if (!Array.isArray(node.dependsOn)) {
        issues.push(issue('missing-node-dependencies', `Node '${node.id}' must declare dependsOn array.`, branch?.branchId, node.trackId, node.id));
      } else {
        for (const dependency of node.dependsOn) {
          if (!nodeIds.has(dependency)) {
            issues.push(issue('missing-dependency', `Node '${node.id}' depends on missing node '${dependency}'.`, branch?.branchId, node.trackId, node.id));
          }
        }
      }
      if (!Array.isArray(node.requiredArtifacts)) {
        issues.push(issue('missing-node-required-artifacts', `Node '${node.id}' must declare requiredArtifacts array.`, branch?.branchId, node.trackId, node.id));
      }
      if (!Array.isArray(node.artifactHints)) {
        issues.push(issue('missing-node-artifact-hints', `Node '${node.id}' must declare artifactHints array.`, branch?.branchId, node.trackId, node.id));
      }
    }
  }
  return issues;
}

function issue(
  code: string,
  message: string,
  branchId?: string,
  trackId?: string,
  nodeId?: string
): PlanValidationIssue {
  return {
    code,
    message,
    branchId,
    trackId,
    nodeId,
    severity: 'error',
  };
}
