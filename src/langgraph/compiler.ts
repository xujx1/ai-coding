import {
  Annotation,
  END,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '../workflows/types.js';
import {
  PipelineGraphState,
  PipelineGraphStatePatch,
  mergeGraphState,
} from './state.js';
import { runConfirmationNode } from './nodes/confirmationNode.js';
import { createStageNodeHandler } from './nodes/stageNode.js';

const RuntimeState = Annotation.Root({
  graph: Annotation<PipelineGraphState>(),
});

export interface WorkflowCompilerOptions {
  handlers?: Record<string, WorkflowNodeHandler>;
  checkpointer?: unknown;
}

export type WorkflowNodeHandler = (
  graph: PipelineGraphState,
  node: WorkflowNode
) => Promise<PipelineGraphStatePatch> | PipelineGraphStatePatch;

export function compileWorkflowDefinition(
  workflow: WorkflowDefinition,
  options: WorkflowCompilerOptions = {}
) {
  let builder: any = new StateGraph(RuntimeState);

  for (const node of workflow.nodes) {
    if (node.type === 'end') continue;
    builder = builder.addNode(node.id, async (state: typeof RuntimeState.State) => {
      const patch = await runWorkflowNode(state.graph, node, options.handlers);
      return {
        graph: mergeGraphState(state.graph, patch),
      };
    });
  }

  const nodeIds = new Set(workflow.nodes.map((node) => node.id));
  const incoming = new Set(workflow.edges.map((edge) => edge.target));

  for (const node of workflow.nodes) {
    if (node.type === 'end') continue;
    if (!incoming.has(node.id)) {
      builder = builder.addEdge(START, node.id);
    }
  }

  const outgoingBySource = groupEdgesBySource(workflow.edges);
  for (const [source, edges] of outgoingBySource.entries()) {
    if (!nodeIds.has(source) || source === 'end') continue;

    const conditionalEdges = edges.filter((edge) => edge.kind !== 'normal' && edge.kind !== 'approval');
    if (conditionalEdges.length > 0) {
      const routeMap = Object.fromEntries(
        edges.map((edge) => [edge.condition?.routeKey ?? edge.target, edge.target === 'end' ? END : edge.target])
      );
      builder = builder.addConditionalEdges(
        source,
        (state: typeof RuntimeState.State) => selectRoute(state.graph, edges),
        routeMap
      );
      continue;
    }

    for (const edge of edges) {
      builder = builder.addEdge(source, edge.target === 'end' ? END : edge.target);
    }
  }

  return builder.compile({
    checkpointer: options.checkpointer as never,
  });
}

async function runWorkflowNode(
  graph: PipelineGraphState,
  node: WorkflowNode,
  handlers: WorkflowCompilerOptions['handlers'] = {}
): Promise<PipelineGraphStatePatch> {
  const handler = handlers[node.id] ?? handlers[node.data.runner ?? ''];
  if (handler) return handler(graph, node);

  if (node.type === 'confirmation') {
    return runConfirmationNode(graph, node);
  }

  return createStageNodeHandler(node)(graph, node);
}

function selectRoute(graph: PipelineGraphState, edges: WorkflowEdge[]): string {
  if (graph.rollback?.active) {
    const rollbackEdge = edges.find((edge) => edge.target === graph.rollback?.targetNodeId);
    if (rollbackEdge) return rollbackEdge.condition?.routeKey ?? rollbackEdge.target;
  }

  const defaultEdge =
    edges.find((edge) => edge.condition?.routeKey === 'default') ??
    edges.find((edge) => edge.kind === 'normal') ??
    edges[0];
  return defaultEdge?.condition?.routeKey ?? defaultEdge?.target ?? END;
}

function groupEdgesBySource(edges: WorkflowEdge[]): Map<string, WorkflowEdge[]> {
  const grouped = new Map<string, WorkflowEdge[]>();
  for (const edge of edges) {
    const current = grouped.get(edge.source) ?? [];
    current.push(edge);
    grouped.set(edge.source, current);
  }
  return grouped;
}
