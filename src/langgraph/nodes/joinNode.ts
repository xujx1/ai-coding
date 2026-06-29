import { BranchFailurePolicy } from '../../workflows/types.js';
import { JoinState, PipelineGraphState, PipelineGraphStatePatch } from '../state.js';

export function updateJoinState(
  state: PipelineGraphState,
  joinNodeId: string,
  failurePolicy: BranchFailurePolicy = 'continue_and_collect',
  maxFailures = 0
): PipelineGraphStatePatch {
  const join = state.joins[joinNodeId];
  if (!join) return {};

  const completedBranchIds = join.waitingForBranchIds.filter(
    branchId => state.branches[branchId]?.status === 'completed'
  );
  const failedBranchIds = join.waitingForBranchIds.filter(
    branchId => state.branches[branchId]?.status === 'failed'
  );
  const nextJoin = computeJoinState(join, completedBranchIds, failedBranchIds, failurePolicy, maxFailures);

  return {
    joins: {
      [joinNodeId]: nextJoin,
    },
  };
}

export function computeJoinState(
  join: JoinState,
  completedBranchIds: string[],
  failedBranchIds: string[],
  failurePolicy: BranchFailurePolicy,
  maxFailures = 0
): JoinState {
  const terminalCount = completedBranchIds.length + failedBranchIds.length;
  const allTerminal = terminalCount >= join.waitingForBranchIds.length;
  const failedOverThreshold = failurePolicy === 'threshold' && failedBranchIds.length > maxFailures;
  const failFastFailed = failurePolicy === 'fail_fast' && failedBranchIds.length > 0;

  return {
    ...join,
    completedBranchIds,
    failedBranchIds,
    status: failedOverThreshold || failFastFailed
      ? 'failed'
      : allTerminal
      ? 'completed'
      : 'waiting',
  };
}
