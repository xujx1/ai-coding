import { WorkflowDefinition } from '../../../types.js';
import {
  GraphRollbackState,
  GraphRetryState,
  PipelineGraphState,
  PipelineGraphStatePatch,
} from '../state.js';

export type FailureCategory =
  | 'review_block'
  | 'implementation_failure'
  | 'test_code_failure'
  | 'backend_test_failure'
  | 'frontend_test_failure'
  | 'coverage_failure'
  | 'runner_asset_failure'
  | 'success'
  | 'unknown';

export interface RouterDecision {
  targetNodeId: string;
  rollback?: GraphRollbackState;
  retry?: Partial<GraphRetryState>;
}

export function routeAfterJavaImpl(
  state: PipelineGraphState,
  fallbackTargetNodeId: string
): RouterDecision {
  if (state.rollback?.active && state.rollback.sourceNodeId === 'java-impl') {
    return {
      targetNodeId: state.rollback.targetNodeId,
      rollback: state.rollback,
      retry: {
        reviewBlockCount: state.retry.reviewBlockCount + 1,
      },
    };
  }
  return { targetNodeId: fallbackTargetNodeId };
}

export function routeAfterTestCode(
  state: PipelineGraphState,
  failureCategory: FailureCategory,
  fallbackTargetNodeId: string,
  sourceNodeId = 'testcode-generate'
): RouterDecision {
  if (failureCategory === 'success') {
    return { targetNodeId: fallbackTargetNodeId };
  }

  const targetNodeId = targetNodeForFailure(failureCategory);
  return {
    targetNodeId,
    retry: retryPatchForFailure(state.retry, failureCategory),
    rollback: {
      active: true,
      sourceNodeId,
      targetNodeId,
      affectedProjects: state.projects.map((project) => project.name),
      reason: `Test failure category '${failureCategory}' from '${sourceNodeId}' routed to '${targetNodeId}'.`,
      category: failureCategory,
      startedAt: Date.now(),
      attempt: retryAttemptForFailure(state.retry, failureCategory) + 1,
    },
  };
}

export function resetDownstreamNodeState(
  state: PipelineGraphState,
  workflow: WorkflowDefinition,
  targetNodeId: string,
  sourceNodeId: string
): PipelineGraphStatePatch {
  const orderedNodeIds = workflow.nodes
    .filter((node) => node.type !== 'end')
    .map((node) => node.id);
  const targetIndex = orderedNodeIds.indexOf(targetNodeId);
  const sourceIndex = orderedNodeIds.indexOf(sourceNodeId);
  if (targetIndex < 0 || sourceIndex < 0) return {};

  const resetNodeIds = orderedNodeIds.slice(targetIndex, sourceIndex + 1);
  return {
    nodes: Object.fromEntries(resetNodeIds.map((nodeId) => [
      nodeId,
      {
        status: 'pending' as const,
        startedAt: undefined,
        completedAt: undefined,
        error: undefined,
      },
    ])),
    currentNodeId: targetNodeId,
  };
}

export function targetNodeForFailure(category: FailureCategory): string {
  if (category === 'frontend_test_failure') {
    return 'frontend-impl';
  }
  if (category === 'backend_test_failure') {
    return 'java-impl';
  }
  if (category === 'implementation_failure' || category === 'review_block') {
    return 'java-impl';
  }
  if (category === 'coverage_failure' || category === 'test_code_failure') {
    return 'testcode-generate';
  }
  return 'failed';
}

function retryPatchForFailure(
  retry: GraphRetryState,
  category: FailureCategory
): Partial<GraphRetryState> {
  if (category === 'coverage_failure') {
    return { coverageRetryCount: retry.coverageRetryCount + 1 };
  }
  if (category === 'implementation_failure' || category === 'review_block') {
    return { reviewBlockCount: retry.reviewBlockCount + 1 };
  }
  return { testRetryCount: retry.testRetryCount + 1 };
}

function retryAttemptForFailure(
  retry: GraphRetryState,
  category: FailureCategory
): number {
  if (category === 'coverage_failure') return retry.coverageRetryCount;
  if (category === 'implementation_failure' || category === 'review_block') {
    return retry.reviewBlockCount;
  }
  return retry.testRetryCount;
}
