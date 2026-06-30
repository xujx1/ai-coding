import {
  ExecutionState,
  NodeState,
  ProjectState,
  RollbackState,
} from '../persistence/stateStore.js';
import { WorkflowDefinition } from '../workflows/types.js';
import {
  BranchState,
  GraphNodeState,
  GraphProjectState,
  PipelineGraphState,
} from './state.js';

export interface ReadModelSyncOptions {
  reason: string;
  existing?: ExecutionState | null;
  workflow?: WorkflowDefinition;
}

export function syncExecutionStateFromGraph(
  graphState: PipelineGraphState,
  options: ReadModelSyncOptions
): ExecutionState {
  const orderedNodeIds = getOrderedNodeIds(graphState, options.workflow);
  const nodes = orderedNodeIds.map((nodeId) =>
    toExecutionNodeState(nodeId, graphState.nodes[nodeId])
  );
  const currentNodeIndex = graphState.currentNodeId
    ? Math.max(orderedNodeIds.indexOf(graphState.currentNodeId), -1)
    : options.existing?.currentNodeIndex ?? -1;

  return {
    runId: graphState.runId,
    name: options.existing?.name ?? `Run ${graphState.runId.slice(0, 6)}`,
    description: options.existing?.description,
    status: graphState.status,
    currentNodeIndex,
    currentNodeId: graphState.currentNodeId,
    nodes,
    currentAgentRunId: graphState.currentAgentRunId,
    permissionMode: graphState.permissionMode,
    modelOverrides: graphState.modelOverrides,
    startedAt: graphState.startedAt,
    updatedAt: graphState.updatedAt,
    completedAt: graphState.completedAt,
    error: graphState.error,
    metadata: {
      ...options.existing?.metadata,
      workflowId: graphState.workflowId,
      workflowVersion: graphState.workflowVersion,
      lastGraphSyncReason: options.reason,
    },
    artifactIndex: graphState.artifactIndex,
    projects: [
      ...graphState.projects.map(toExecutionProjectState),
      ...graphState.branchOrder
        .map((branchId) => graphState.branches[branchId])
        .filter(Boolean)
        .map(toProjectStateFromBranch),
    ],
    rollback: graphState.rollback
      ? toExecutionRollbackState(graphState.rollback)
      : options.existing?.rollback,
    contextManifests: graphState.contextManifests,
    workflowInstance: options.existing?.workflowInstance,
  };
}

function getOrderedNodeIds(
  graphState: PipelineGraphState,
  workflow?: WorkflowDefinition
): string[] {
  if (workflow) {
    return workflow.nodes
      .filter((node) => node.type !== 'end')
      .map((node) => node.id);
  }
  return Object.keys(graphState.nodes);
}

function toExecutionNodeState(
  nodeId: string,
  graphNode?: GraphNodeState
): NodeState {
  return {
    id: nodeId,
    name: nodeId,
    status: graphNode?.status ?? 'pending',
    startedAt: graphNode?.startedAt,
    completedAt: graphNode?.completedAt,
    outputArtifacts: graphNode?.outputArtifacts,
    childAgentIds: graphNode?.childAgentIds,
    error: graphNode?.error,
    failureCount: graphNode?.failureCount ?? 0,
  };
}

function toExecutionProjectState(project: GraphProjectState): ProjectState {
  return {
    name: project.name,
    root: project.root,
    currentNodeId: project.currentNodeId,
    status: normalizeProjectStatus(project.status),
    retry: {
      reviewBlockCount: project.retry.reviewBlockCount,
      testRetryCount: project.retry.testRetryCount,
      coverageRetryCount: project.retry.coverageRetryCount,
      integrationRetryCount: project.retry.integrationRetryCount ?? 0,
      crossAppReviewBlockCount: project.retry.crossAppReviewBlockCount ?? 0,
    },
  };
}

function toProjectStateFromBranch(branch: BranchState): ProjectState {
  return {
    name: branch.projectName,
    root: branch.projectRoot,
    branchId: branch.branchId,
    currentNodeId: branch.currentNodeId,
    status: normalizeProjectStatus(branch.status),
    retry: {
      reviewBlockCount: branch.retry.reviewBlockCount,
      testRetryCount: branch.retry.testRetryCount,
      coverageRetryCount: branch.retry.coverageRetryCount,
      integrationRetryCount: branch.retry.integrationRetryCount ?? 0,
      crossAppReviewBlockCount: branch.retry.crossAppReviewBlockCount ?? 0,
    },
    nodes: branch.nodes,
    tracks: branch.tracks,
    artifactIndex: branch.artifactIndex,
    outputArtifacts: Object.values(branch.artifactIndex).flat(),
  };
}

function normalizeProjectStatus(status: GraphProjectState['status'] | BranchState['status']): ProjectState['status'] {
  if (status === 'waiting_confirmation') return 'running';
  if (status === 'cancelled') return 'interrupted';
  return status;
}

function toExecutionRollbackState(rollback: NonNullable<PipelineGraphState['rollback']>): RollbackState {
  return {
    active: rollback.active,
    sourceNodeId: rollback.sourceNodeId,
    targetNodeId: rollback.targetNodeId,
    affectedProjects: rollback.affectedProjects,
    reason: rollback.reason,
    category: rollback.category,
    startedAt: rollback.startedAt,
    attempt: rollback.attempt,
  };
}
