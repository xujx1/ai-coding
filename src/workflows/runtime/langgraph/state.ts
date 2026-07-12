import type { ContextManifest, NodeStatus, PipelineStatus } from '../../../persistence/executionTypes.js';
import { BranchFailurePolicy } from '../../types.js';

export type GraphStatus = Extract<
  PipelineStatus,
  'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'
>;

export interface PipelineGraphState {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  status: GraphStatus;
  currentNodeId?: string;
  nodes: Record<string, GraphNodeState>;
  projects: GraphProjectState[];
  branches: Record<string, BranchState>;
  branchOrder: string[];
  joins: Record<string, JoinState>;
  artifactIndex: Record<string, string[]>;
  contextManifests: Record<string, ContextManifest>;
  modelOverrides: Record<string, string>;
  permissionMode: string;
  currentAgentRunId?: string;
  confirmation?: GraphConfirmationState;
  rollback?: GraphRollbackState;
  retry: GraphRetryState;
  error?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface GraphNodeState {
  id: string;
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
  outputArtifacts?: string[];
  childAgentIds?: string[];
  error?: string;
  failureCount: number;
  idempotencyKeys?: string[];
  resourceWaitReason?: string;
}

export interface GraphProjectState {
  name: string;
  root: string;
  branchId?: string;
  currentNodeId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_fix' | 'suspended' | 'interrupted' | 'cancelled';
  retry: GraphRetryState;
  nodes?: Record<string, GraphNodeState>;
  outputArtifacts?: string[];
  dependencyChanges?: DependencyChange[];
  apiChanges?: ApiChange[];
}

export interface GraphConfirmationState {
  nodeId: string;
  sourceStageId: string;
  title: string;
  contentPath?: string;
  contentPreview?: string;
  approved?: boolean;
  feedback?: string;
}

export interface BranchState {
  branchId: string;
  workflowId: string;
  projectName: string;
  projectRoot: string;
  status:
    | 'pending'
    | 'running'
    | 'waiting_confirmation'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'waiting_fix';
  currentNodeId?: string;
  nodes: Record<string, GraphNodeState>;
  tracks?: Record<string, BranchTrackState>;
  artifactIndex: Record<string, string[]>;
  contextManifests: Record<string, ContextManifest>;
  childAgentIds: string[];
  retry: GraphRetryState;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface BranchTrackState {
  trackId: string;
  kind: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_fix';
  currentNodeId?: string;
  nodeIds: string[];
  artifactIndex: Record<string, string[]>;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface JoinState {
  joinNodeId: string;
  waitingForBranchIds: string[];
  completedBranchIds: string[];
  failedBranchIds: string[];
  status: 'pending' | 'waiting' | 'completed' | 'failed';
}

export interface GraphRetryState {
  reviewBlockCount: number;
  testRetryCount: number;
  coverageRetryCount: number;
  integrationRetryCount?: number;
  crossAppReviewBlockCount?: number;
}

export interface GraphRollbackState {
  active: boolean;
  sourceNodeId: string;
  targetNodeId: string;
  affectedProjects: string[];
  reason: string;
  category?: string;
  startedAt: number;
  attempt: number;
  affectedBranchIds?: string[];
  targetNodeIdByBranch?: Record<string, string>;
}

export interface BranchSummary {
  branchId: string;
  projectName: string;
  tracks?: BranchTrackSummary[];
  openSpec?: BranchOpenSpecSummary;
  changedFiles: string[];
  publicApiChanges: ApiChange[];
  databaseChanges: DatabaseChange[];
  configChanges: ConfigChange[];
  dependencyChanges: DependencyChange[];
  testResults: TestResultSummary;
  e2eVerification?: E2EVerificationSummary;
  riskNotes: string[];
  requiredCrossAppChecks: string[];
}

export interface BranchTrackSummary {
  trackId: string;
  kind: string;
  status: string;
  nodeIds: string[];
  artifactPaths: string[];
}

export interface BranchOpenSpecSummary {
  changeId: string;
  proposalPath: string;
  designPath: string;
  tasksPath: string;
  specPath: string;
  taskStatus: {
    total: number;
    completed: number;
  };
}

export interface CrossAppReviewResult {
  status: 'approved' | 'blocked';
  findings: CrossAppFinding[];
  affectedBranches: string[];
  requiredFixes: Array<{
    branchId: string;
    projectName: string;
    targetNodeId: string;
    feedback: string;
  }>;
}

export interface CrossAppFinding {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'blocking';
  category: 'api' | 'dto' | 'database' | 'config' | 'dependency' | 'release' | 'other';
  message: string;
  affectedBranches: string[];
}

export interface ApiChange {
  path?: string;
  method?: string;
  symbol?: string;
  description: string;
}

export interface DatabaseChange {
  objectName: string;
  changeType: string;
  description: string;
}

export interface ConfigChange {
  key: string;
  description: string;
}

export interface DependencyChange {
  name: string;
  fromVersion?: string;
  toVersion?: string;
  scope?: string;
}

export interface TestResultSummary {
  status: 'passed' | 'failed' | 'skipped';
  total?: number;
  passed?: number;
  failed?: number;
  coverage?: number;
}

export interface E2EVerificationSummary {
  status: 'passed' | 'failed' | 'skipped' | 'unsupported';
  failureClassification?: 'frontend' | 'backend' | 'contract' | 'environment';
  fallbackReason?: string;
  artifactPaths: string[];
}

export interface FanoutRuntimeConfig {
  concurrencyLimit: number;
  failurePolicy: BranchFailurePolicy;
  maxFailures?: number;
}

export type PipelineGraphStatePatch = Partial<
  Omit<PipelineGraphState, 'nodes' | 'projects' | 'branches' | 'joins' | 'artifactIndex' | 'contextManifests' | 'retry'>
> & {
  nodes?: Record<string, Partial<GraphNodeState>>;
  projects?: GraphProjectState[];
  branches?: Record<string, Partial<BranchState>>;
  joins?: Record<string, Partial<JoinState>>;
  artifactIndex?: Record<string, string[]>;
  contextManifests?: Record<string, ContextManifest>;
  retry?: Partial<GraphRetryState>;
};

export function createInitialGraphState(args: {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  nodeIds: string[];
  permissionMode: string;
  modelOverrides?: Record<string, string>;
  startedAt?: number;
}): PipelineGraphState {
  const startedAt = args.startedAt ?? Date.now();
  return {
    runId: args.runId,
    workflowId: args.workflowId,
    workflowVersion: args.workflowVersion,
    status: 'running',
    nodes: Object.fromEntries(
      args.nodeIds.map((id) => [
        id,
        {
          id,
          status: 'pending' as const,
          failureCount: 0,
        },
      ])
    ),
    projects: [],
    branches: {},
    branchOrder: [],
    joins: {},
    artifactIndex: {},
    contextManifests: {},
    modelOverrides: args.modelOverrides ?? {},
    permissionMode: args.permissionMode,
    retry: createEmptyRetryState(),
    startedAt,
    updatedAt: startedAt,
  };
}

export function createEmptyRetryState(): GraphRetryState {
  return {
    reviewBlockCount: 0,
    testRetryCount: 0,
    coverageRetryCount: 0,
    integrationRetryCount: 0,
    crossAppReviewBlockCount: 0,
  };
}

export function mergeGraphState(
  state: PipelineGraphState,
  patch: PipelineGraphStatePatch
): PipelineGraphState {
  return {
    ...state,
    ...patch,
    nodes: mergeGraphNodeRecord(state.nodes, patch.nodes, (current, next) => ({
      ...current,
      ...next,
    })),
    projects: patch.projects ?? state.projects,
    branches: mergeBranchRecord(state.branches, patch.branches, (current, next) => ({
      ...current,
      ...next,
      nodes: next.nodes ? { ...current.nodes, ...next.nodes } : current.nodes,
      tracks: next.tracks
        ? { ...(current.tracks ?? {}), ...next.tracks }
        : current.tracks,
      artifactIndex: next.artifactIndex
        ? { ...current.artifactIndex, ...next.artifactIndex }
        : current.artifactIndex,
      contextManifests: next.contextManifests
        ? { ...current.contextManifests, ...next.contextManifests }
        : current.contextManifests,
      retry: next.retry ? { ...current.retry, ...next.retry } : current.retry,
    })),
    joins: mergeJoinRecord(state.joins, patch.joins, (current, next) => ({
      ...current,
      ...next,
    })),
    artifactIndex: {
      ...state.artifactIndex,
      ...patch.artifactIndex,
    },
    contextManifests: {
      ...state.contextManifests,
      ...patch.contextManifests,
    },
    retry: {
      ...state.retry,
      ...patch.retry,
    },
    updatedAt: patch.updatedAt ?? Date.now(),
  };
}

export function hasNodeIdempotencyKey(
  state: PipelineGraphState,
  nodeId: string,
  key: string
): boolean {
  return state.nodes[nodeId]?.idempotencyKeys?.includes(key) ?? false;
}

export function addNodeIdempotencyKey(
  state: PipelineGraphState,
  nodeId: string,
  key: string
): PipelineGraphState {
  const existing = state.nodes[nodeId]?.idempotencyKeys ?? [];
  if (existing.includes(key)) return state;
  return mergeGraphState(state, {
    nodes: {
      [nodeId]: {
        idempotencyKeys: [...existing, key],
      },
    },
  });
}

function mergeGraphNodeRecord(
  current: Record<string, GraphNodeState>,
  patch: Record<string, Partial<GraphNodeState>> | undefined,
  merge: (current: GraphNodeState, patch: Partial<GraphNodeState>) => GraphNodeState
): Record<string, GraphNodeState> {
  if (!patch) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    next[key] = merge(next[key] ?? {
      id: key,
      status: 'pending',
      failureCount: 0,
    }, value);
  }
  return next;
}

function mergeBranchRecord(
  current: Record<string, BranchState>,
  patch: Record<string, Partial<BranchState>> | undefined,
  merge: (current: BranchState, patch: Partial<BranchState>) => BranchState
): Record<string, BranchState> {
  if (!patch) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const currentBranch = next[key] ?? {
      branchId: key,
      workflowId: '',
      projectName: key,
      projectRoot: '',
      status: 'pending' as const,
      nodes: {},
      tracks: {},
      artifactIndex: {},
      contextManifests: {},
      childAgentIds: [],
      retry: createEmptyRetryState(),
    };
    next[key] = merge(currentBranch, value);
  }
  return next;
}

function mergeJoinRecord(
  current: Record<string, JoinState>,
  patch: Record<string, Partial<JoinState>> | undefined,
  merge: (current: JoinState, patch: Partial<JoinState>) => JoinState
): Record<string, JoinState> {
  if (!patch) return current;
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    const currentJoin = next[key] ?? {
      joinNodeId: key,
      waitingForBranchIds: [],
      completedBranchIds: [],
      failedBranchIds: [],
      status: 'pending' as const,
    };
    next[key] = merge(currentJoin, value);
  }
  return next;
}
