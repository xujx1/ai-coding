import {
  Annotation,
  END,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { WorkflowDefinition, WorkflowEdge, WorkflowNode } from '../../types.js';
import {
  PipelineGraphState,
  PipelineGraphStatePatch,
  mergeGraphState,
} from './state.js';
import { runConfirmationNode } from './nodes/confirmationNode.js';
import { createStageNodeHandler } from './nodes/stageNode.js';
import type { NodeLeaseExecutor } from '../../../storage/nodeLeaseExecutor.js';
import type { FencedRuntimeTransitionCommitter } from '../../../storage/runtimeNodeTransition.js';
import type { PipelineArtifactWriter } from '../../../storage/pipelineArtifactWriter.js';
import { syncExecutionStateFromGraph } from './readModelSync.js';
import { prepareGraphTransitionArtifacts } from './runtimeArtifacts.js';

const RuntimeState = Annotation.Root({
  graph: Annotation<PipelineGraphState>(),
});

export interface WorkflowCompilerOptions {
  handlers?: Record<string, WorkflowNodeHandler>;
  checkpointer?: unknown;
  /** Optional PostgreSQL lease boundary for executable (non-approval) nodes. */
  nodeLeaseExecutor?: NodeLeaseExecutor;
  /** Product-visible commit boundary; checkpoints remain runtime-internal. */
  transitionCommitter?: FencedRuntimeTransitionCommitter;
  artifactWriter?: PipelineArtifactWriter;
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
      const work = async (lease?: Parameters<FencedRuntimeTransitionCommitter['commit']>[0]['lease']) => {
        const patch = await runWorkflowNode(state.graph, node, options.handlers);
        const graph = mergeGraphState(state.graph, patch);
        if (options.transitionCommitter) {
          if (!lease) throw new Error(`LangGraph node '${node.id}' requires a lease for its product-state transition.`);
          const nodeState = graph.nodes[node.id];
          const committedArtifacts = await prepareGraphTransitionArtifacts(state.graph, graph, node.id, options.artifactWriter);
          const transitionAt = nodeState?.completedAt ?? graph.updatedAt;
          await options.transitionCommitter.commit({
            runtime: 'langgraph',
            runId: graph.runId,
            nodeId: node.id,
            transitionId: `langgraph:${graph.runId}:${node.id}:${nodeState?.status ?? 'unknown'}:${transitionAt}`,
            lease,
            updateRun: current => syncExecutionStateFromGraph(graph, {
              reason: `langgraph-node:${node.id}`,
              existing: current,
              workflow,
            }),
            includeCurrentLifecycle: true,
            committedArtifacts,
            eventData: {
              status: nodeState?.status,
              artifactIds: committedArtifacts.map(artifact => artifact.artifactId),
            },
            timestamp: transitionAt,
          });
        }
        return { graph };
      };
      return options.nodeLeaseExecutor
        ? options.nodeLeaseExecutor.execute(state.graph.runId, node.id, work)
        : work();
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
