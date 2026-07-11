import type { ExecutionState, NodeState, ProjectState } from '../persistence/stateStore.js';
import type {
  AppDeliveryState,
  LifecyclePhase,
  LifecycleState,
  NodeRunRef,
  NodeRunStatus,
  WorkflowRunRef,
  WorkflowRunStatus,
} from './types.js';
import {
  attachLifecycleReference,
  createEmptyLifecycleState,
} from './store.js';
import { appendLifecycleEvent } from './events.js';

export interface DeriveLifecycleStateOptions {
  requirementId?: string;
  workflowId?: string;
  now?: number;
}

export function deriveLifecycleStateFromExecutionState(
  execution: ExecutionState,
  options: DeriveLifecycleStateOptions = {},
): LifecycleState {
  const workflowRunId = `${execution.runId}-workflow`;
  const requirementId = options.requirementId
    ?? String(execution.metadata?.requirementId ?? execution.runId);
  const workflow: WorkflowRunRef = {
    workflowRunId,
    workflowId: options.workflowId
      ?? String(execution.metadata?.workflowId ?? execution.workflowInstance?.template.workflowId ?? 'legacy-pipeline'),
    status: mapWorkflowStatus(execution.status),
  };
  const nodes = execution.nodes.map(node => mapNode(node, workflowRunId));
  const apps = (execution.projects ?? []).map(mapProject);
  const state = createEmptyLifecycleState({
    requirementId,
    runId: execution.runId,
    phase: inferLifecyclePhase(execution),
    status: execution.status === 'waiting_confirmation' ? 'waiting_approval' : execution.status === 'completed' ? 'completed' : execution.status === 'failed' ? 'failed' : 'active',
    apps,
    workflowRuns: [workflow],
    nodeRuns: nodes,
    metadata: {
      migratedFromExecutionState: true,
      executionStateName: execution.name,
    },
    now: options.now,
  });
  appendLifecycleEvent(state, {
    type: 'state_migrated',
    workflowRunId,
    data: {
      source: 'execution-state',
      nodeCount: execution.nodes.length,
      appCount: execution.projects?.length ?? 0,
    },
    now: options.now,
  });
  return state;
}

export function attachLifecycleReferenceToExecutionState(
  execution: ExecutionState,
): ExecutionState {
  return attachLifecycleReference(execution);
}

function mapWorkflowStatus(status: ExecutionState['status']): WorkflowRunStatus {
  switch (status) {
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'waiting_confirmation':
      return 'waiting_approval';
    case 'running':
      return 'running';
    case 'suspended':
      return 'failed';
    case 'idle':
    default:
      return 'pending';
  }
}

function mapNode(node: NodeState, workflowRunId: string): NodeRunRef {
  return {
    nodeRunId: `${workflowRunId}-${node.id}`,
    workflowRunId,
    nodeId: node.id,
    status: mapNodeStatus(node.status),
  };
}

function mapNodeStatus(status: NodeState['status']): NodeRunStatus {
  switch (status) {
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'waiting_confirmation':
      return 'waiting_approval';
    case 'running':
      return 'running';
    case 'skipped':
      return 'skipped';
    case 'interrupted':
    case 'suspended':
      return 'cancelled';
    case 'waiting_fix':
    case 'pending':
    default:
      return 'pending';
  }
}

function mapProject(project: ProjectState): AppDeliveryState {
  return {
    appId: project.name,
    role: 'primary',
    status: mapProjectStatus(project.status),
    repoRef: project.root,
    branchName: project.branchId,
    artifactIds: [],
    ciRunIds: [],
    testRunIds: [],
  };
}

function mapProjectStatus(status: ProjectState['status']): AppDeliveryState['status'] {
  switch (status) {
    case 'completed':
      return 'passed';
    case 'failed':
    case 'waiting_fix':
    case 'interrupted':
      return 'failed';
    case 'running':
      return 'implementing';
    case 'suspended':
      return 'failed';
    case 'pending':
    default:
      return 'pending';
  }
}

function inferLifecyclePhase(execution: ExecutionState): LifecyclePhase {
  if (execution.status === 'completed') return 'completed';
  if (execution.status === 'failed' || execution.status === 'cancelled') return 'failed';
  const current = execution.currentNodeId ?? execution.nodes[execution.currentNodeIndex]?.id ?? '';
  if (current.includes('archive')) return 'archive';
  if (current.includes('test')) return 'testing';
  if (current.includes('impl') || current.includes('code')) return 'implementation';
  if (current.includes('plan') || current.includes('spec')) return 'planning';
  if (current.includes('fanout') || current.includes('mrd')) return 'fanout';
  return 'created';
}

