import { interrupt } from '@langchain/langgraph';
import { WorkflowNode } from '../../workflows/types.js';
import {
  GraphConfirmationState,
  PipelineGraphState,
  PipelineGraphStatePatch,
} from '../state.js';

export interface ConfirmationDecision {
  approved: boolean;
  feedback?: string;
}

export function runConfirmationNode(
  graph: PipelineGraphState,
  node: WorkflowNode
): PipelineGraphStatePatch {
  const confirmation: GraphConfirmationState = {
    nodeId: node.id,
    sourceStageId: node.data.sourceStageId ?? node.id,
    title: node.data.label,
    contentPreview: node.data.description,
  };

  const decision = interrupt<GraphConfirmationState, ConfirmationDecision>(
    confirmation
  );

  return resolveConfirmationDecision(graph, node, confirmation, decision);
}

export function resolveConfirmationDecision(
  graph: PipelineGraphState,
  node: WorkflowNode,
  confirmation: GraphConfirmationState,
  decision: ConfirmationDecision
): PipelineGraphStatePatch {
  return {
    status: decision.approved ? 'running' : decision.feedback ? 'running' : 'cancelled',
    currentNodeId: node.id,
    confirmation: {
      ...confirmation,
      approved: decision.approved,
      feedback: decision.feedback,
    },
    nodes: {
      [node.id]: {
        id: node.id,
        status: decision.approved ? 'completed' : decision.feedback ? 'waiting_fix' : 'interrupted',
        startedAt: graph.nodes[node.id]?.startedAt ?? Date.now(),
        completedAt: Date.now(),
        failureCount: graph.nodes[node.id]?.failureCount ?? 0,
      },
    },
  };
}
