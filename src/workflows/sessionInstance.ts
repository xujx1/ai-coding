import { PIPELINE_NODES } from './definitions/pipelineDefinition.js';
import type { NodeState } from '../persistence/executionTypes.js';
import {
  BUILTIN_APP_BRANCH_WORKFLOW_ID,
  BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
} from './builtinDefinitions.js';
import type { FanoutDecision } from './fanoutDecision.js';
import type { RequirementOwnershipArtifact } from './requirementOwnership.js';
import type { WorkflowSnapshot } from './types.js';
import type { ProjectManifest } from '../agents/codegen/upload-init.js';
import {
  ApplicationBranchPlan,
  AppTrackPlan,
  createSessionExecutionPlan,
  SessionExecutionPlan,
} from './sessionPlan.js';

export const SESSION_WORKFLOW_INSTANCE_VERSION = 1;
export const SESSION_BRANCH_NODE_SEQUENCE = [
  'implementation-plan',
  'spec-generate',
  'java-impl',
  'testcode-generate',
  'app-integration-test',
];

const DEPRECATED_BRANCH_NODE_IDS = new Set([
  'api-contract-check',
  'app-track-join',
  'app-branch-summary',
]);

const DEPRECATED_BRANCH_TRACK_IDS = new Set([
  'contract',
]);

const DEPRECATED_TOP_LEVEL_NODE_IDS = new Set([
  'cross-app-code-review',
  'cross-app-integration-review',
]);

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
  trackId?: string;
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
  tracks?: SessionWorkflowTrackRef[];
  plan?: ApplicationBranchPlan;
  validationErrors?: string[];
  artifactIndex?: Record<string, string[]>;
  childAgentIds?: string[];
  retry?: {
    reviewBlockCount: number;
    testRetryCount: number;
    coverageRetryCount: number;
    integrationRetryCount?: number;
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
  trackId?: string;
  plannedType?: string;
  runner?: string;
  outputArtifacts?: string[];
  childAgentIds?: string[];
  failureCount?: number;
  error?: string;
}

export interface SessionWorkflowTrackRef {
  trackId: string;
  kind: string;
  label: string;
  required: boolean;
  status: SessionWorkflowRuntimeStatus;
  currentNodeId?: string;
  nodeIds: string[];
  dependsOn?: string[];
  fallbackReason?: string;
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
  executionPlan?: SessionExecutionPlan;
  plannerValidation?: SessionExecutionPlan['validation'];
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
      label: '需求归属确认',
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
      label: '项目分流',
      kind: 'fanout',
      branchIds: [],
      artifactHints: ['artifacts/fanout-decision.json'],
    },
    {
      id: 'app-join',
      label: '分支汇合',
      kind: 'join',
      joinId: 'app-join',
    },
    {
      id: 'cross-app-test',
      label: '跨应用测试',
      kind: 'aggregate_review',
      sourceNodeId: 'cross-app-test',
      artifactHints: ['artifacts/cross-app/test-results.json'],
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
  plan?: ApplicationBranchPlan;
}): SessionWorkflowBranchRef {
  return {
    branchId: args.branchId,
    projectName: args.projectName,
    projectRoot: args.projectRoot,
    workflowId: args.workflowId ?? BUILTIN_APP_BRANCH_WORKFLOW_ID,
    status: args.status ?? 'pending',
    currentNodeId: args.currentNodeId,
    nodes: createInitialBranchNodes(args.plan),
    tracks: args.plan ? createTrackRefs(args.plan.tracks) : undefined,
    plan: args.plan,
    validationErrors: args.plan ? [] : undefined,
    artifactIndex: {},
    childAgentIds: [],
    retry: {
      reviewBlockCount: 0,
      testRetryCount: 0,
      coverageRetryCount: 0,
      integrationRetryCount: 0,
    },
  };
}

export function applyFanoutDecisionToSessionWorkflowInstance(args: {
  instance: SessionWorkflowInstance;
  runId: string;
  decision: FanoutDecision;
  manifest?: ProjectManifest;
  clarifiedMrd?: string;
  requirementOwnership?: RequirementOwnershipArtifact;
  artifactPath?: string;
  updatedAt?: string;
}): void {
  const plan = createSessionExecutionPlan({
    runId: args.runId,
    decision: args.decision,
    manifest: args.manifest,
    clarifiedMrd: args.clarifiedMrd,
    requirementOwnership: args.requirementOwnership,
    sourceArtifacts: [
      'artifacts/project-manifest.json',
      'artifacts/mrd-clarified.md',
      ...(args.requirementOwnership ? ['artifacts/requirement-ownership.json'] : []),
      args.artifactPath ?? 'artifacts/fanout-decision.json',
    ],
    generatedAt: args.updatedAt,
  });
  const branchRefs = plan.branches.map((branchPlan) => createBranchRef({
    branchId: branchPlan.branchId,
    projectName: branchPlan.projectName,
    projectRoot: branchPlan.projectRoot,
    plan: branchPlan,
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
  args.instance.executionPlan = plan;
  args.instance.plannerValidation = plan.validation;
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
  normalizeSessionBranchExecutionShape(branch);
  const nodeOrder = branch.nodes?.length
    ? branch.nodes.map(node => node.id)
    : SESSION_BRANCH_NODE_SEQUENCE;
  const startIndex = nodeOrder.indexOf(fromNodeId);
  if (startIndex < 0) return;
  const resetNodeIds = new Set(nodeOrder.slice(startIndex));
  branch.status = 'pending';
  branch.currentNodeId = fromNodeId;
  for (const node of branch.nodes ?? []) {
    if (resetNodeIds.has(node.id)) {
      node.status = 'pending';
      node.error = undefined;
      node.failureCount = 0;
      node.childAgentIds = [];
      node.outputArtifacts = [];
    }
  }
  if (branch.artifactIndex) {
    for (const nodeId of resetNodeIds) {
      delete branch.artifactIndex[nodeId];
    }
  }
  for (const track of branch.tracks ?? []) {
    if (track.nodeIds.some(nodeId => resetNodeIds.has(nodeId))) {
      track.status = 'pending';
      track.currentNodeId = track.nodeIds.find(nodeId => resetNodeIds.has(nodeId));
      track.error = undefined;
    }
  }
}

export function normalizeSessionWorkflowInstanceShape(instance: SessionWorkflowInstance): void {
  const hasDeprecatedTopLevel = instance.nodes.some(node => DEPRECATED_TOP_LEVEL_NODE_IDS.has(node.id));
  if (hasDeprecatedTopLevel) {
    instance.nodes = instance.nodes.filter(node => !DEPRECATED_TOP_LEVEL_NODE_IDS.has(node.id));
    const archiveIndex = instance.nodes.findIndex(node => node.id === 'archive');
    if (!instance.nodes.some(node => node.id === 'cross-app-test')) {
      const crossAppTestNode: SessionWorkflowNode = {
        id: 'cross-app-test',
        label: '跨应用测试',
        kind: 'aggregate_review',
        sourceNodeId: 'cross-app-test',
        artifactHints: ['artifacts/cross-app/test-results.json'],
      };
      if (archiveIndex >= 0) {
        instance.nodes.splice(archiveIndex, 0, crossAppTestNode);
      } else {
        instance.nodes.push(crossAppTestNode);
      }
    }
    instance.edges = createDynamicTopLevelEdges(instance.nodes);
  }
  const crossAppTestNode = instance.nodes.find(node => node.id === 'cross-app-test');
  if (crossAppTestNode && !crossAppTestNode.sourceNodeId) {
    crossAppTestNode.sourceNodeId = 'cross-app-test';
  }
  for (const branch of instance.branches ?? []) {
    normalizeSessionBranchExecutionShape(branch);
  }
  instance.updatedAt = new Date().toISOString();
}

function normalizeSessionBranchExecutionShape(branch: SessionWorkflowBranchRef): void {
  if (branch.nodes?.length) {
    branch.nodes = branch.nodes.filter(node => !DEPRECATED_BRANCH_NODE_IDS.has(node.id));
  }
  if (branch.tracks?.length) {
    branch.tracks = branch.tracks
      .filter(track => !DEPRECATED_BRANCH_TRACK_IDS.has(track.trackId))
      .map(track => ({
        ...track,
        nodeIds: track.nodeIds.filter(nodeId => !DEPRECATED_BRANCH_NODE_IDS.has(nodeId)),
      }));
  }
  for (const nodeId of DEPRECATED_BRANCH_NODE_IDS) {
    delete branch.artifactIndex?.[nodeId];
  }
  if (branch.currentNodeId && DEPRECATED_BRANCH_NODE_IDS.has(branch.currentNodeId)) {
    branch.currentNodeId = branch.nodes?.at(-1)?.id ?? branch.currentNodeId;
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

export function syncSessionBranchRuntimeFromNodes(branch: SessionWorkflowBranchRef): void {
  const nodes = branch.nodes ?? [];
  if (!nodes.length) return;

  const failed = nodes.find(node => ['failed', 'waiting_fix', 'interrupted', 'cancelled'].includes(node.status));
  if (failed) {
    branch.currentNodeId = failed.id;
    branch.status = failed.status === 'waiting_fix'
      ? 'waiting_fix'
      : failed.status === 'cancelled'
        ? 'cancelled'
        : failed.status === 'interrupted'
          ? 'interrupted'
          : 'failed';
    return;
  }

  const waitingConfirmation = nodes.find(node => node.status === 'waiting_confirmation');
  if (waitingConfirmation) {
    branch.currentNodeId = waitingConfirmation.id;
    branch.status = 'waiting_confirmation';
    return;
  }

  const running = nodes.find(node => ['running', 'suspended'].includes(node.status));
  if (running) {
    branch.currentNodeId = running.id;
    branch.status = running.status;
    return;
  }

  const firstPending = nodes.find(node => node.status === 'pending');
  if (firstPending) {
    branch.currentNodeId = firstPending.id;
    branch.status = 'pending';
    return;
  }

  const completed = nodes.every(node => ['completed', 'skipped'].includes(node.status));
  if (completed) {
    branch.currentNodeId = nodes.at(-1)?.id ?? branch.currentNodeId;
    branch.status = 'completed';
  }
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

function createInitialBranchNodes(plan?: ApplicationBranchPlan): SessionWorkflowBranchNode[] {
  if (plan) {
    return plan.nodes.map(node => ({
      id: node.id,
      label: node.label,
      status: 'pending',
      trackId: node.trackId,
      plannedType: node.type,
      runner: node.runner,
      outputArtifacts: node.artifactHints,
    }));
  }
  return SESSION_BRANCH_NODE_SEQUENCE.map(nodeId => ({
    id: nodeId,
    label: branchNodeLabel(nodeId),
    status: 'pending',
  }));
}

function createTrackRefs(tracks: AppTrackPlan[]): SessionWorkflowTrackRef[] {
  return tracks.map(track => ({
    trackId: track.trackId,
    kind: track.kind,
    label: track.label,
    required: track.required,
    status: 'pending',
    nodeIds: track.nodes.map(node => node.id),
    dependsOn: track.dependsOn,
    fallbackReason: track.fallbackReason,
  }));
}

function branchNodeLabel(nodeId: string): string {
  return {
    'implementation-plan': '实施方案',
    'spec-generate': 'SPEC生成',
    'java-impl': 'Java实现',
    'testcode-generate': '测试代码',
    'backend-test': '后端测试',
    'frontend-impl': '前端实现',
    'frontend-test': '前端测试',
    'e2e-verify': '端到端验证',
    'app-integration-test': '端到端验证',
  }[nodeId] ?? nodeId;
}
