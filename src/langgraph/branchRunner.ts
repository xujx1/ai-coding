import { BranchWorkflowDefinition, WorkflowNode } from '../workflows/types.js';
import { AsyncSemaphore } from './concurrency.js';
import {
  BranchState,
  GraphNodeState,
  PipelineGraphState,
  createEmptyRetryState,
} from './state.js';

export interface BranchRunnerContext {
  graphState: PipelineGraphState;
  branch: BranchState;
  branchWorkflow: BranchWorkflowDefinition;
  handlers?: Record<string, BranchNodeHandler>;
}

export type BranchNodeHandler = (
  ctx: BranchRunnerContext,
  node: WorkflowNode
) => Promise<Partial<BranchState>> | Partial<BranchState>;

export async function runBranch(
  ctx: BranchRunnerContext
): Promise<BranchState> {
  let branch: BranchState = {
    ...ctx.branch,
    status: 'running',
    startedAt: ctx.branch.startedAt ?? Date.now(),
  };

  for (const node of ctx.branchWorkflow.nodes) {
    if (node.type === 'end') continue;
    branch = markBranchNode(branch, node.id, {
      status: 'running',
      startedAt: Date.now(),
    });

    try {
      const patch = await ctx.handlers?.[node.id]?.({ ...ctx, branch }, node);
      branch = {
        ...branch,
        ...patch,
        nodes: {
          ...branch.nodes,
          ...patch?.nodes,
        },
        artifactIndex: {
          ...branch.artifactIndex,
          ...patch?.artifactIndex,
        },
        contextManifests: {
          ...branch.contextManifests,
          ...patch?.contextManifests,
        },
      };
      branch = markBranchNode(branch, node.id, {
        status: patch?.nodes?.[node.id]?.status ?? 'completed',
        completedAt: Date.now(),
      });
    } catch (err) {
      branch = markBranchNode(branch, node.id, {
        status: 'failed',
        completedAt: Date.now(),
        error: (err as Error).message,
        failureCount: (branch.nodes[node.id]?.failureCount ?? 0) + 1,
      });
      return {
        ...branch,
        status: 'failed',
        error: (err as Error).message,
        completedAt: Date.now(),
      };
    }
  }

  return {
    ...branch,
    status: 'completed',
    completedAt: Date.now(),
  };
}

export async function runBranchesWithLimit(
  branches: BranchState[],
  limit: number,
  runOne: (branch: BranchState) => Promise<BranchState>
): Promise<BranchState[]> {
  const semaphore = new AsyncSemaphore(limit);
  return Promise.all(branches.map(branch => semaphore.run(() => runOne(branch))));
}

export function createInitialBranchState(args: {
  branchId: string;
  workflowId: string;
  projectName: string;
  projectRoot: string;
}): BranchState {
  return {
    branchId: args.branchId,
    workflowId: args.workflowId,
    projectName: args.projectName,
    projectRoot: args.projectRoot,
    status: 'pending',
    nodes: {},
    artifactIndex: {},
    contextManifests: {},
    childAgentIds: [],
    retry: createEmptyRetryState(),
  };
}

function markBranchNode(
  branch: BranchState,
  nodeId: string,
  patch: Partial<GraphNodeState>
): BranchState {
  const current = branch.nodes[nodeId] ?? {
    id: nodeId,
    status: 'pending' as const,
    failureCount: 0,
  };
  return {
    ...branch,
    currentNodeId: nodeId,
    nodes: {
      ...branch.nodes,
      [nodeId]: {
        ...current,
        ...patch,
        id: nodeId,
        failureCount: patch.failureCount ?? current.failureCount,
      },
    },
  };
}
