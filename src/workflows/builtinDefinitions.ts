import { PIPELINE_NODES, PipelineNode } from '../pipeline/definition.js';
import {
  BranchWorkflowDefinition,
  WorkflowDefinition,
  WorkflowEdge,
  WorkflowGlobalConfig,
  WorkflowNode,
} from './types.js';

export const BUILTIN_MRD_TO_CODE_WORKFLOW_ID = 'default-mrd-to-code';
export const BUILTIN_APP_BRANCH_WORKFLOW_ID = 'mrd-to-code-app-branch';
export const BUILTIN_MRD_TO_CODE_WORKFLOW_VERSION = 1;

const DEFAULT_CREATED_AT = '2026-06-28T00:00:00.000Z';

export function createBuiltInMrdToCodeWorkflow(
  options: {
    createdAt?: string;
    updatedAt?: string;
    globalConfig?: Partial<WorkflowGlobalConfig>;
  } = {}
): WorkflowDefinition {
  const timestamp = options.createdAt ?? DEFAULT_CREATED_AT;
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];
  let previousNodeId: string | undefined;

  PIPELINE_NODES.forEach((pipelineNode, index) => {
    const stageNode = toStageWorkflowNode(pipelineNode, index);
    nodes.push(stageNode);

    if (previousNodeId) {
      edges.push(createEdge(previousNodeId, stageNode.id, 'normal'));
    }

    previousNodeId = stageNode.id;

    if (pipelineNode.hasConfirmationGate) {
      const confirmationNode = toConfirmationWorkflowNode(pipelineNode, index);
      nodes.push(confirmationNode);
      edges.push(createEdge(stageNode.id, confirmationNode.id, 'approval'));
      previousNodeId = confirmationNode.id;
    }
  });

  const endNode: WorkflowNode = {
    id: 'end',
    type: 'end',
    position: { x: 360, y: PIPELINE_NODES.length * 180 },
    data: {
      label: 'End',
      description: 'Terminal workflow node',
    },
  };
  nodes.push(endNode);

  if (previousNodeId) {
    edges.push(createEdge(previousNodeId, endNode.id, 'normal'));
  }

  return {
    id: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    name: 'MRD-to-Code',
    version: BUILTIN_MRD_TO_CODE_WORKFLOW_VERSION,
    locked: true,
    nodes,
    edges,
    globalConfig: {
      runtime: 'legacy',
      structureEditable: false,
      branchConcurrencyLimit: 4,
      llmConcurrencyLimit: 6,
      testConcurrencyLimit: 2,
      ...options.globalConfig,
    },
    createdAt: timestamp,
    updatedAt: options.updatedAt ?? timestamp,
  };
}

export function createBuiltInAppBranchWorkflow(
  options: {
    createdAt?: string;
    updatedAt?: string;
    globalConfig?: Partial<WorkflowGlobalConfig>;
  } = {}
): BranchWorkflowDefinition {
  const timestamp = options.createdAt ?? DEFAULT_CREATED_AT;
  const nodeIds = [
    'app-spec-generate',
    'app-code-impl',
    'app-code-review',
    'app-testcode-generate',
    'app-unit-test',
    'app-integration-test',
    'app-branch-summary',
  ];

  const nodes: WorkflowNode[] = nodeIds.map((id, index) => ({
    id,
    type: id.includes('review') ? 'agent' : 'stage',
    position: { x: 80, y: index * 160 },
    data: {
      label: branchNodeLabel(id),
      stageId: id,
      runner: id,
      maxTurns: id.includes('impl') || id.includes('testcode') ? 50 : 12,
      artifactOutputs: branchArtifactOutputs(id),
      modelOverrideKey: id,
    },
  }));

  nodes.push({
    id: 'end',
    type: 'end',
    position: { x: 80, y: nodeIds.length * 160 },
    data: {
      label: 'End',
    },
  });

  const edges: WorkflowEdge[] = [];
  for (let i = 0; i < nodeIds.length - 1; i++) {
    edges.push(createEdge(nodeIds[i], nodeIds[i + 1], 'normal'));
  }
  edges.push(createEdge(nodeIds[nodeIds.length - 1], 'end', 'normal'));

  return {
    id: BUILTIN_APP_BRANCH_WORKFLOW_ID,
    name: 'MRD-to-Code Application Branch',
    version: 1,
    locked: true,
    branchKind: 'application',
    inputSchema: {
      branchId: '',
      projectName: '',
      projectRoot: '',
      requirementSlicePath: '',
      upstreamArtifacts: [],
    },
    nodes,
    edges,
    globalConfig: {
      runtime: 'langgraph',
      structureEditable: false,
      ...options.globalConfig,
    },
    createdAt: timestamp,
    updatedAt: options.updatedAt ?? timestamp,
  };
}

function toStageWorkflowNode(
  pipelineNode: PipelineNode,
  index: number
): WorkflowNode {
  return {
    id: pipelineNode.id,
    type: pipelineNode.usesReActLoop ? 'agent' : 'stage',
    position: { x: 80, y: index * 180 },
    data: {
      label: pipelineNode.name,
      description: pipelineNode.description,
      stageId: pipelineNode.id,
      runner: pipelineNode.id,
      hasConfirmationGate: pipelineNode.hasConfirmationGate,
      usesReActLoop: pipelineNode.usesReActLoop,
      maxTurns: pipelineNode.maxTurns,
      planModeRequired: pipelineNode.planModeRequired,
      artifactOutputs:
        pipelineNode.artifactOutputs ??
        (pipelineNode.artifactOutput ? [pipelineNode.artifactOutput] : []),
      modelOverrideKey: pipelineNode.id,
    },
  };
}

function toConfirmationWorkflowNode(
  pipelineNode: PipelineNode,
  index: number
): WorkflowNode {
  return {
    id: `${pipelineNode.id}-confirmation`,
    type: 'confirmation',
    position: { x: 520, y: index * 180 },
    data: {
      label: `${pipelineNode.name} Confirmation`,
      description: `User confirmation gate for ${pipelineNode.name}`,
      sourceStageId: pipelineNode.id,
      stageId: `${pipelineNode.id}-confirmation`,
    },
  };
}

function createEdge(
  source: string,
  target: string,
  kind: WorkflowEdge['kind']
): WorkflowEdge {
  return {
    id: `${source}->${target}`,
    source,
    target,
    kind,
  };
}

function branchNodeLabel(nodeId: string): string {
  return {
    'app-spec-generate': 'App Spec Generate',
    'app-code-impl': 'App Code Impl',
    'app-code-review': 'App Code Review',
    'app-testcode-generate': 'App Test Code Generate',
    'app-unit-test': 'App Unit Test',
    'app-integration-test': 'App Integration Test',
    'app-branch-summary': 'App Branch Summary',
  }[nodeId] ?? nodeId;
}

function branchArtifactOutputs(nodeId: string): string[] {
  return {
    'app-spec-generate': ['{project}/openspec-task.md'],
    'app-code-impl': ['{project}/changed-files.json', '{project}/code-review.md'],
    'app-code-review': ['{project}/review-findings.json'],
    'app-testcode-generate': ['{project}/testcode-generation-report.md'],
    'app-unit-test': ['{project}/test-report.md', '{project}/coverage-summary.json'],
    'app-integration-test': ['{project}/integration-test-report.md'],
    'app-branch-summary': ['{project}/branch-summary.json'],
  }[nodeId] ?? [];
}
