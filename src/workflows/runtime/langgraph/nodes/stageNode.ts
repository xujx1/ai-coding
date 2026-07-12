import { WorkflowNode } from '../../../types.js';
import {
  GraphNodeState,
  PipelineGraphState,
  PipelineGraphStatePatch,
} from '../state.js';

export type LangGraphStageHandler = (
  graph: PipelineGraphState,
  node: WorkflowNode
) => Promise<PipelineGraphStatePatch> | PipelineGraphStatePatch;

export function createStageNodeHandler(
  node: WorkflowNode,
  handler?: LangGraphStageHandler
): LangGraphStageHandler {
  return async (graph) => {
    const startedAt = graph.nodes[node.id]?.startedAt ?? Date.now();
    const startPatch: PipelineGraphStatePatch = {
      currentNodeId: node.id,
      nodes: {
        [node.id]: {
          id: node.id,
          status: 'running',
          startedAt,
          failureCount: graph.nodes[node.id]?.failureCount ?? 0,
        },
      },
    };

    try {
      const resultPatch = handler ? await handler(graph, node) : {};
      const resultNode = resultPatch.nodes?.[node.id] as Partial<GraphNodeState> | undefined;
      return {
        ...startPatch,
        ...resultPatch,
        nodes: {
          ...startPatch.nodes,
          ...resultPatch.nodes,
          [node.id]: {
            ...startPatch.nodes?.[node.id],
            ...resultNode,
            id: node.id,
            status: resultNode?.status ?? 'completed',
            completedAt: resultNode?.completedAt ?? Date.now(),
            failureCount: resultNode?.failureCount ?? graph.nodes[node.id]?.failureCount ?? 0,
          },
        },
      };
    } catch (err) {
      return {
        ...startPatch,
        status: 'failed',
        error: (err as Error).message,
        nodes: {
          [node.id]: {
            id: node.id,
            status: 'failed',
            startedAt,
            completedAt: Date.now(),
            error: (err as Error).message,
            failureCount: (graph.nodes[node.id]?.failureCount ?? 0) + 1,
          },
        },
      };
    }
  };
}
