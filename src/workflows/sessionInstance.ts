import { PIPELINE_NODES } from '../pipeline/definition.js';
import type { NodeState } from '../persistence/stateStore.js';
import {
  BUILTIN_APP_BRANCH_WORKFLOW_ID,
  BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
} from './builtinDefinitions.js';
import type { FanoutDecision } from './fanoutDecision.js';
import type { WorkflowSnapshot } from './types.js';

export const SESSION_WORKFLOW_INSTANCE_VERSION = 1;
export const SESSION_BRANCH_NODE_SEQUENCE = [
  'implementation-plan',
  'spec-generate',
  'java-impl',
  'testcode-generate',
  'app-branch-summary',
];

export type SessionWorkflowLayout = 'dynamic-fanout' | 'legacy-fixed';

export type SessionWorkflowNodeKind =
  | 'stage'
  | 'fanout'
  | 'join'
  | 'aggregate_review'
  | 'archive'
  | 'legacy_stage';

export type SessionWorkflowRuntimeStatus =
  | 'pending'
  | 'running'
  | 'waiting_confirmation'
  | 'completed'
  | 'failed'
  | 'waiting_fix'
  | 'cancelled'
  | 'suspended'
  | 'interrupted'
  | 'skipped';

export interface SessionWorkflowTemplateRef {
  workflowId: string;
  workflowVersion: number;
  capturedAt: string;
}

export interface SessionWorkflowNode {
  id: string;
  label: string;
  kind: SessionWorkflowNodeKind;
  status?: SessionWorkflowRuntimeStatus;
  error?: string;
  sourceNodeId?: string;
  branchIds?: string[];
  joinId?: string;
  artifactHints?: string[];
}

export interface SessionWorkflowEdge {
  id: string;
  source: string;
  target: string;
  kind: 'normal' | 'fanout' | 'join' | 'review' | 'legacy';
}

export interface SessionWorkflowBranchRef {
  branchId: string;
  projectName: string;
  projectRoot: string;
  workflowId: string;
  status: SessionWorkflowRuntimeStatus;
  currentNodeId?: string;
  nodes?: SessionWorkflowBranchNode[];
  artifactIndex?: Record<string, string[]>;
  childAgentIds?: string[];
  retry?: {
    reviewBlockCount: number;
    testRetryCount: number;
    coverageRetryCount: number;
  };
}

export interface SessionWorkflowJoinRef {
  joinId: string;
  waitingForBranchIds: string[];
  completedBranchIds: string[];
  failedBranchIds: string[];
  cancelledBranchIds: string[];
  status: 'pending' | 'waiting' | 'completed' | 'failed';
}

export interface SessionWorkflowBranchNode {
  id: string;
  label: string;
  status: SessionWorkflowRuntimeStatus;
  outputArtifacts?: string[];
  childAgentIds?: string[];
  failureCount?: number;
  error?: string;
}

export interface SessionWorkflowInstance {
  id: string;
  version: number;
  layout: SessionWorkflowLayout;
  template: SessionWorkflowTemplateRef;
  nodes: SessionWorkflowNode[];
  edges: SessionWorkflowEdge[];
  branches: SessionWorkflowBranchRef[];
  joins: SessionWorkflowJoinRef[];
  createdAt: string;
  updatedAt: string;
  legacyFallback: boolean;
  fanoutDecisionArtifact?: string;
  fanoutDecision?: FanoutDecision;
}

export function createInitialSessionWorkflowInstance(args: {
  runId: string;
  templateSnapshot: WorkflowSnapshot;
  createdAt?: string;
}): SessionWorkflowInstance {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const nodes = createDynamicTopLevelNodes();
  return {
    id: `${args.runId}-workflow-instance`,
    version: SESSION_WORKFLOW_INSTANCE_VERSION,
    layout: 'dynamic-fanout',
    template: workflowTemplateRef(args.templateSnapshot),
    nodes,
    edges: createDynamicTopLevelEdges(nodes),
    branches: [],
    joins: [],
    createdAt,
    updatedAt: createdAt,
    legacyFallback: false,
  };
}

export function createLegacySessionWorkflowInstance(args: {
  runId: string;
  nodes: NodeState[];
  createdAt?: string;
}): SessionWorkflowInstance {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const workflowNodes: SessionWorkflowNode[] = args.nodes.map((node) => ({
    id: node.id,
    label: node.name,
    kind: 'legacy_stage',
    sourceNodeId: node.id,
    artifactHints: node.outputArtifacts,
  }));
  return {
    id: `${args.runId}-legacy-workflow-instance`,
    version: SESSION_WORKFLOW_INSTANCE_VERSION,
    layout: 'legacy-fixed',
    template: {
      workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
      workflowVersion: 1,
      capturedAt: createdAt,
    },
    nodes: workflowNodes,
    edges: createLinearEdges(workflowNodes, 'legacy'),
    branches: [],
    joins: [],
    createdAt,
    updatedAt: createdAt,
    legacyFallback: true,
  };
}

export function getSessionWorkflowInstanceOrLegacy(args: {
  runId: string;
  workflowInstance?: SessionWorkflowInstance;
  nodes: NodeState[];
  createdAt?: string;
}): SessionWorkflowInstance {
  return args.workflowInstance ?? createLegacySessionWorkflowInstance({
    runId: args.runId,
    nodes: args.nodes,
    createdAt: args.createdAt,
  });
}

function workflowTemplateRef(snapshot: WorkflowSnapshot): SessionWorkflowTemplateRef {
  return {
    workflowId: snapshot.workflowId,
    workflowVersion: snapshot.workflowVersion,
    capturedAt: snapshot.capturedAt,
  };
}

function createDynamicTopLevelNodes(): SessionWorkflowNode[] {
  return [
    {
      id: 'upload-init',
      label: labelForPipelineNode('upload-init', '上传/初始化'),
      kind: 'stage',
      sourceNodeId: 'upload-init',
      artifactHints: ['artifacts/project-manifest.json'],
    },
    {
      id: 'mrd-clarify',
      label: '需求澄清',
      kind: 'stage',
      sourceNodeId: 'mrd-render',
      artifactHints: ['artifacts/mrd-clarify-questions.md', 'artifacts/implementation-boundaries.md'],
    },
    {
      id: 'mrd-render',
      label: labelForPipelineNode('mrd-render', '需求拆解'),
      kind: 'stage',
      sourceNodeId: 'mrd-render',
      artifactHints: ['artifacts/mrd-clarified.md', 'artifacts/fanout-decision.json'],
    },
    {
      id: 'project-fanout',
      label: '项目 Fanout',
      kind: 'fanout',
      branchIds: [],
      artifactHints: ['artifacts/fanout-decision.json'],
    },
    {
      id: 'app-join',
      label: '分支 Join',
      kind: 'join',
      joinId: 'app-join',
    },
    {
      id: 'cross-app-code-review',
      label: '跨应用代码审查',
      kind: 'aggregate_review',
      artifactHints: ['artifacts/cross-app/code-review-findings.json'],
    },
    {
      id: 'cross-app-integration-review',
      label: '跨应用集成审查',
      kind: 'aggregate_review',
      artifactHints: ['artifacts/cross-app/integration-review-findings.json'],
    },
    {
      id: 'archive',
      label: labelForPipelineNode('archive', '归档'),
      kind: 'archive',
      sourceNodeId: 'archive',
      artifactHints: ['artifacts/archive-manifest.json'],
    },
  ];
}

function createDynamicTopLevelEdges(nodes: SessionWorkflowNode[]): SessionWorkflowEdge[] {
  return createLinearEdges(nodes, 'normal').map((edge) => {
    if (edge.source === 'mrd-render' && edge.target === 'project-fanout') return { ...edge, kind: 'fanout' };
    if (edge.source === 'project-fanout' && edge.target === 'app-join') return { ...edge, kind: 'join' };
    if (edge.source === 'app-join') return { ...edge, kind: 'review' };
    return edge;
  });
}

function createLinearEdges(
  nodes: SessionWorkflowNode[],
  kind: SessionWorkflowEdge['kind']
): SessionWorkflowEdge[] {
  const edges: SessionWorkflowEdge[] = [];
  for (let index = 0; index < nodes.length - 1; index += 1) {
    edges.push({
      id: `${nodes[index].id}->${nodes[index + 1].id}`,
      source: nodes[index].id,
      target: nodes[index + 1].id,
      kind,
    });
  }
  return edges;
}

function labelForPipelineNode(nodeId: string, fallback: string): string {
  return PIPELINE_NODES.find(node => node.id === nodeId)?.name ?? fallback;
}

export function createBranchRef(args: {
  branchId: string;
  projectName: string;
  projectRoot: string;
  workflowId?: string;
  status?: SessionWorkflowBranchRef['status'];
  currentNodeId?: string;
}): SessionWorkflowBranchRef {
  return {
    branchId: args.branchId,
    projectName: args.projectName,
    projectRoot: args.projectRoot,
    workflowId: args.workflowId ?? BUILTIN_APP_BRANCH_WORKFLOW_ID,
    status: args.status ?? 'pending',
    currentNodeId: args.currentNodeId,
    nodes: createInitialBranchNodes(),
    artifactIndex: {},
    childAgentIds: [],
    retry: {
      reviewBlockCount: 0,
      testRetryCount: 0,
      coverageRetryCount: 0,
    },
  };
}

export function applyFanoutDecisionToSessionWorkflowInstance(args: {
  instance: SessionWorkflowInstance;
  runId: string;
  decision: FanoutDecision;
  artifactPath?: string;
  updatedAt?: string;
}): void {
  const branchRefs = args.decision.includedProjects.map((project) => createBranchRef({
    branchId: createStableSessionBranchId(args.runId, project.name),
    projectName: project.name,
    projectRoot: project.root,
  }));
  const branchIds = branchRefs.map(branch => branch.branchId);

  args.instance.branches = branchRefs;
  args.instance.joins = [{
    joinId: 'app-join',
    waitingForBranchIds: branchIds,
    completedBranchIds: [],
    failedBranchIds: [],
    cancelledBranchIds: [],
    status: branchIds.length ? 'waiting' : 'failed',
  }];
  args.instance.fanoutDecisionArtifact = args.artifactPath;
  args.instance.fanoutDecision = args.decision;
  args.instance.updatedAt = args.updatedAt ?? new Date().toISOString();

  const fanoutNode = args.instance.nodes.find(node => node.id === 'project-fanout');
  if (fanoutNode) {
    fanoutNode.branchIds = branchIds;
    fanoutNode.artifactHints = args.artifactPath ? [args.artifactPath] : fanoutNode.artifactHints;
    fanoutNode.status = resolveFanoutNodeStatus(args.decision);
    fanoutNode.error = resolveFanoutNodeError(args.decision);
  }
}

export function createStableSessionBranchId(runId: string, projectName: string): string {
  const safeProjectName = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
  return `${runId}-${safeProjectName}`;
}

export function resetSessionBranchFromNode(
  branch: SessionWorkflowBranchRef,
  fromNodeId: string
): void {
  const startIndex = SESSION_BRANCH_NODE_SEQUENCE.indexOf(fromNodeId);
  if (startIndex < 0) return;
  branch.status = 'pending';
  branch.currentNodeId = fromNodeId;
  for (const node of branch.nodes ?? []) {
    const index = SESSION_BRANCH_NODE_SEQUENCE.indexOf(node.id);
    if (index >= startIndex) {
      node.status = 'pending';
      node.error = undefined;
      node.failureCount = 0;
      node.childAgentIds = [];
      node.outputArtifacts = [];
    }
  }
  if (branch.artifactIndex) {
    for (const nodeId of SESSION_BRANCH_NODE_SEQUENCE.slice(startIndex)) {
      delete branch.artifactIndex[nodeId];
    }
  }
}

export function cancelSessionBranch(branch: SessionWorkflowBranchRef): void {
  branch.status = 'cancelled';
  const currentNode = branch.nodes?.find(node => node.id === branch.currentNodeId);
  if (currentNode) currentNode.status = 'cancelled';
}

export function syncSessionWorkflowJoinFromBranches(instance: SessionWorkflowInstance): void {
  if (!instance.joins.length) return;
  const completedBranchIds = instance.branches
    .filter(branch => branch.status === 'completed')
    .map(branch => branch.branchId);
  const failedBranchIds = instance.branches
    .filter(branch => ['failed', 'waiting_fix', 'interrupted'].includes(branch.status))
    .map(branch => branch.branchId);
  const cancelledBranchIds = instance.branches
    .filter(branch => branch.status === 'cancelled')
    .map(branch => branch.branchId);
  const terminal = new Set([...completedBranchIds, ...failedBranchIds, ...cancelledBranchIds]);
  const waitingForBranchIds = instance.branches
    .filter(branch => !terminal.has(branch.branchId))
    .map(branch => branch.branchId);
  instance.joins[0] = {
    ...instance.joins[0],
    waitingForBranchIds,
    completedBranchIds,
    failedBranchIds,
    cancelledBranchIds,
    status: waitingForBranchIds.length
      ? 'waiting'
      : failedBranchIds.length
        ? 'failed'
        : 'completed',
  };
}

function resolveFanoutNodeStatus(decision: FanoutDecision): SessionWorkflowNode['status'] {
  if (!decision.includedProjects.length) return 'failed';
  if (decision.unresolvedProjects.length) return 'waiting_confirmation';
  return 'completed';
}

function resolveFanoutNodeError(decision: FanoutDecision): string | undefined {
  if (!decision.includedProjects.length) {
    return decision.fallbackReason ?? 'Fanout could not resolve any project branches.';
  }
  if (decision.unresolvedProjects.length) {
    return `MRD references missing projects: ${decision.unresolvedProjects.map(project => project.name).join(', ')}`;
  }
  return undefined;
}

function createInitialBranchNodes(): SessionWorkflowBranchNode[] {
  return SESSION_BRANCH_NODE_SEQUENCE.map(nodeId => ({
    id: nodeId,
    label: branchNodeLabel(nodeId),
    status: 'pending',
  }));
}

function branchNodeLabel(nodeId: string): string {
  return {
    'implementation-plan': '实施方案',
    'spec-generate': 'SPEC生成',
    'java-impl': 'Java实现',
    'testcode-generate': '测试代码',
    'app-branch-summary': 'Summary',
  }[nodeId] ?? nodeId;
}
