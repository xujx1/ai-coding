import { PIPELINE_NODES } from '../pipeline/definition.js';
import { BUILTIN_MRD_TO_CODE_WORKFLOW_ID, createBuiltInMrdToCodeWorkflow } from './builtinDefinitions.js';
import {
  StageRunnerId,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from './types.js';

const ALLOWED_NODE_TYPES: ReadonlySet<WorkflowNodeType> = new Set([
  'stage',
  'agent',
  'confirmation',
  'router',
  'fanout',
  'join',
  'aggregate_review',
  'end',
]);

const BUILT_IN_STAGE_RUNNERS: ReadonlySet<StageRunnerId> = new Set(
  [
    ...PIPELINE_NODES.map((node) => node.id),
    'app-spec-generate',
    'app-code-impl',
    'app-code-review',
    'app-testcode-generate',
    'app-unit-test',
    'app-integration-test',
    'app-branch-summary',
  ]
);

export function validateWorkflowDefinition(
  workflow: WorkflowDefinition
): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();

  for (const node of workflow.nodes) {
    if (nodeIds.has(node.id)) {
      issues.push(error('duplicate-node', `Duplicate node id '${node.id}'.`, node.id));
    }
    nodeIds.add(node.id);

    if (!ALLOWED_NODE_TYPES.has(node.type)) {
      issues.push(error('invalid-node-type', `Node '${node.id}' has invalid type '${node.type}'.`, node.id));
    }

    if ((node.type === 'stage' || node.type === 'agent') && !node.data.runner) {
      issues.push(error('missing-runner', `Node '${node.id}' must declare a stage runner.`, node.id));
    }

    if (node.data.runner && !isAllowedStageRunner(node.data.runner)) {
      issues.push(error('invalid-runner', `Node '${node.id}' uses unknown runner '${node.data.runner}'.`, node.id));
    }
  }

  const edgeIds = new Set<string>();
  for (const edge of workflow.edges) {
    if (edgeIds.has(edge.id)) {
      issues.push(error('duplicate-edge', `Duplicate edge id '${edge.id}'.`, undefined, edge.id));
    }
    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.source)) {
      issues.push(error('missing-edge-source', `Edge '${edge.id}' references missing source '${edge.source}'.`, undefined, edge.id));
    }
    if (!nodeIds.has(edge.target)) {
      issues.push(error('missing-edge-target', `Edge '${edge.id}' references missing target '${edge.target}'.`, undefined, edge.id));
    }
  }

  validateRequiredArtifactChain(workflow, issues);
  validateBoundedCycles(workflow, issues);

  if (workflow.id === BUILTIN_MRD_TO_CODE_WORKFLOW_ID && workflow.locked) {
    validateLockedBuiltInWorkflow(workflow, issues);
  }

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
  };
}

export function isAllowedStageRunner(runner: StageRunnerId): boolean {
  return BUILT_IN_STAGE_RUNNERS.has(runner);
}

function validateRequiredArtifactChain(
  workflow: WorkflowDefinition,
  issues: WorkflowValidationIssue[]
): void {
  for (const pipelineNode of PIPELINE_NODES) {
    const node = workflow.nodes.find((candidate) => candidate.id === pipelineNode.id);
    if (!node) {
      issues.push(error(
        'missing-required-stage',
        `Workflow is missing required stage '${pipelineNode.id}'.`,
        pipelineNode.id
      ));
      continue;
    }

    const expectedOutputs =
      pipelineNode.artifactOutputs ??
      (pipelineNode.artifactOutput ? [pipelineNode.artifactOutput] : []);
    for (const expectedOutput of expectedOutputs) {
      if (!node.data.artifactOutputs?.includes(expectedOutput)) {
        issues.push(error(
          'missing-artifact-output',
          `Stage '${pipelineNode.id}' is missing required artifact output '${expectedOutput}'.`,
          pipelineNode.id
        ));
      }
    }
  }
}

function validateLockedBuiltInWorkflow(
  workflow: WorkflowDefinition,
  issues: WorkflowValidationIssue[]
): void {
  const expected = createBuiltInMrdToCodeWorkflow({
    createdAt: workflow.createdAt,
    updatedAt: workflow.updatedAt,
    globalConfig: workflow.globalConfig,
  });
  const actualNodeById = new Map(workflow.nodes.map((node) => [node.id, node]));

  for (const expectedNode of expected.nodes) {
    const actualNode = actualNodeById.get(expectedNode.id);
    if (!actualNode) {
      issues.push(error('locked-node-removed', `Locked built-in node '${expectedNode.id}' cannot be removed.`, expectedNode.id));
      continue;
    }

    if (actualNode.type !== expectedNode.type) {
      issues.push(error('locked-node-type-changed', `Locked built-in node '${expectedNode.id}' cannot change type.`, expectedNode.id));
    }

    if (actualNode.data.runner !== expectedNode.data.runner) {
      issues.push(error('locked-runner-changed', `Locked built-in node '${expectedNode.id}' cannot change runner.`, expectedNode.id));
    }
  }

  const actualEdges = new Set(workflow.edges.map(edgeKey));
  for (const expectedEdge of expected.edges) {
    if (!actualEdges.has(edgeKey(expectedEdge))) {
      issues.push(error(
        'locked-edge-removed',
        `Locked built-in edge '${expectedEdge.source}' -> '${expectedEdge.target}' cannot be removed.`,
        undefined,
        expectedEdge.id
      ));
    }
  }
}

function validateBoundedCycles(
  workflow: WorkflowDefinition,
  issues: WorkflowValidationIssue[]
): void {
  if (workflow.globalConfig.maxSteps !== undefined) return;
  if (!hasCycle(workflow)) return;

  issues.push(error(
    'unbounded-cycle',
    'Workflow contains a cycle but globalConfig.maxSteps is not set.'
  ));
}

function hasCycle(workflow: WorkflowDefinition): boolean {
  const adjacency = new Map<string, string[]>();
  for (const node of workflow.nodes) {
    adjacency.set(node.id, []);
  }
  for (const edge of workflow.edges) {
    adjacency.get(edge.source)?.push(edge.target);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): boolean {
    if (visiting.has(nodeId)) return true;
    if (visited.has(nodeId)) return false;

    visiting.add(nodeId);
    for (const target of adjacency.get(nodeId) ?? []) {
      if (visit(target)) return true;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return false;
  }

  return workflow.nodes.some((node) => visit(node.id));
}

function edgeKey(edge: Pick<WorkflowEdge, 'source' | 'target' | 'kind'>): string {
  return `${edge.source}->${edge.target}:${edge.kind}`;
}

function error(
  code: string,
  message: string,
  nodeId?: string,
  edgeId?: string
): WorkflowValidationIssue {
  return {
    code,
    message,
    nodeId,
    edgeId,
    severity: 'error',
  };
}
