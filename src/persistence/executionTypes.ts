import type { SessionWorkflowInstance } from '../workflows/sessionInstance.js';

export type NodeStatus = 'pending' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'waiting_fix' | 'suspended' | 'interrupted' | 'skipped';

export interface NodeState {
  id: string;
  name: string;
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
  agentRunId?: string;
  output?: unknown;
  outputArtifacts?: string[];
  childAgentIds?: string[];
  error?: string;
  resourceWaitReason?: string;
  confirmation?: {
    waiting: boolean;
    content?: string;
    approved?: boolean;
    feedback?: string;
    resumeApproved?: boolean;
  };
  failureCount: number;
}

export type PipelineStatus = 'idle' | 'running' | 'waiting_confirmation' | 'suspended' | 'completed' | 'failed' | 'cancelled';

export interface ProjectState {
  name: string;
  root: string;
  branchId?: string;
  currentNodeId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_fix' | 'suspended' | 'interrupted';
  retry: {
    reviewBlockCount: number;
    testRetryCount: number;
    coverageRetryCount: number;
    integrationRetryCount?: number;
    crossAppReviewBlockCount?: number;
  };
  nodes?: Record<string, {
    id: string;
    status: NodeStatus;
    startedAt?: number;
    completedAt?: number;
    outputArtifacts?: string[];
    childAgentIds?: string[];
    error?: string;
    failureCount: number;
    resourceWaitReason?: string;
  }>;
  tracks?: Record<string, {
    trackId: string;
    kind: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting_fix';
    currentNodeId?: string;
    nodeIds: string[];
    artifactIndex: Record<string, string[]>;
    error?: string;
    startedAt?: number;
    completedAt?: number;
  }>;
  artifactIndex?: Record<string, string[]>;
  outputArtifacts?: string[];
}

export interface RollbackState {
  active: boolean;
  sourceNodeId: string;
  targetNodeId: string;
  affectedProjects: string[];
  reason: string;
  category?: string;
  startedAt: number;
  attempt: number;
}

export interface ContextManifest {
  nodeId: string;
  projectName?: string;
  outputArtifacts: Array<{
    path: string;
    summary: string;
    size: number;
  }>;
  importantDecisions: string[];
  riskNotes: string[];
  confirmation?: {
    approved: boolean;
    feedback?: string;
  };
  nextNodeInputs: string[];
}

export interface ExecutionState {
  runId: string;
  name: string;
  description?: string;
  status: PipelineStatus;
  currentNodeIndex: number;
  currentNodeId?: string;
  nodes: NodeState[];
  currentAgentRunId?: string;
  permissionMode: string;
  modelOverrides: Record<string, string>;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  artifactIndex?: Record<string, string[]>;
  projects?: ProjectState[];
  rollback?: RollbackState;
  contextManifests?: Record<string, ContextManifest>;
  workflowInstance?: SessionWorkflowInstance;
}
