import { BranchWorkflowDefinition, WorkflowNode } from '../../types.js';
import type { ApplicationBranchPlan, PlannedNode } from '../../sessionPlan.js';
import { getPlanNodeContract } from '../../planNodeRegistry.js';
import type { NodeLeaseExecutor } from '../../../storage/nodeLeaseExecutor.js';
import {
  AsyncSemaphore,
  PlanResourceLimits,
  PlanResourceSemaphores,
  createPlanResourceSemaphores,
} from './concurrency.js';
import {
  BranchTrackState,
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
  nodeLeaseExecutor?: NodeLeaseExecutor;
}

export type BranchNodeHandler = (
  ctx: BranchRunnerContext,
  node: WorkflowNode
) => Promise<Partial<BranchState>> | Partial<BranchState>;

export interface PlannedBranchRunnerContext {
  graphState: PipelineGraphState;
  branch: BranchState;
  plan: ApplicationBranchPlan;
  handlers?: Record<string, PlannedNodeHandler>;
  concurrencyLimit?: number;
  resourceLimits?: Partial<PlanResourceLimits>;
  resourceSemaphores?: PlanResourceSemaphores;
  nodeLeaseExecutor?: NodeLeaseExecutor;
}

export interface PlannedNodeRunResult {
  status?: GraphNodeState['status'];
  outputArtifacts?: string[];
  childAgentIds?: string[];
  error?: string;
  branchPatch?: Partial<BranchState>;
}

export type PlannedNodeHandler = (
  ctx: PlannedBranchRunnerContext,
  node: PlannedNode
) => Promise<PlannedNodeRunResult | void> | PlannedNodeRunResult | void;

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
      const work = async () => ctx.handlers?.[node.id]?.({ ...ctx, branch }, node);
      const patch = ctx.nodeLeaseExecutor
        ? await ctx.nodeLeaseExecutor.execute(ctx.graphState.runId, branchLeaseNodeId(branch.branchId, node.id), work)
        : await work();
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

export async function runPlannedBranch(
  ctx: PlannedBranchRunnerContext
): Promise<BranchState> {
  let branch: BranchState = {
    ...ctx.branch,
    status: 'running',
    startedAt: ctx.branch.startedAt ?? Date.now(),
  };
  const semaphore = new AsyncSemaphore(ctx.concurrencyLimit ?? 2);
  const resourceSemaphores = ctx.resourceSemaphores ?? createPlanResourceSemaphores({
    branchConcurrency: ctx.concurrencyLimit ?? 2,
    ...ctx.resourceLimits,
  });
  const terminal = new Set(['completed', 'failed', 'cancelled', 'waiting_fix', 'skipped']);

  while (true) {
    const runnable = ctx.plan.nodes.filter(node => {
      const status = branch.nodes[node.id]?.status;
      if (status && terminal.has(status)) return false;
      return node.dependsOn.every(dependency => branch.nodes[dependency]?.status === 'completed');
    });
    if (!runnable.length) break;

    const beforeCompletedCount = countCompletedPlanNodes(branch, ctx.plan.nodes);
    const results = await Promise.all(runnable.map(node => semaphore.run(async () => {
      const runningAt = Date.now();
      branch = node.trackId
        ? markBranchTrackNode(branch, node.trackId, node.id, { status: 'running', startedAt: runningAt })
        : markBranchNode(branch, node.id, { status: 'running', startedAt: runningAt });
      try {
        const handler = resolvePlannedNodeHandler(ctx.handlers, node);
        const resourceWaitReason = getPlanResourceWaitReason(resourceSemaphores, node);
        if (resourceWaitReason) {
          branch = node.trackId
            ? markBranchTrackNode(branch, node.trackId, node.id, { resourceWaitReason })
            : markBranchNode(branch, node.id, { resourceWaitReason });
        }
        const work = () => runWithPlanResources(resourceSemaphores, node, () =>
          handler?.({ ...ctx, branch }, node)
        );
        const result = ctx.nodeLeaseExecutor
          ? await ctx.nodeLeaseExecutor.execute(ctx.graphState.runId, branchLeaseNodeId(branch.branchId, node.id), work)
          : await work();
        return { node, result };
      } catch (err) {
        return { node, error: err as Error };
      }
    })));

    for (const { node, result, error } of results) {
      if (error) {
        branch = failPlannedNode(branch, ctx.plan, node, error.message);
        return {
          ...branch,
          status: 'waiting_fix',
          error: error.message,
          completedAt: Date.now(),
        };
      }
      if (result?.branchPatch) {
        branch = mergeBranchPatch(branch, result.branchPatch);
      }
      const outputArtifacts = result?.outputArtifacts ?? node.artifactHints;
      const completedAt = Date.now();
      const patch: Partial<GraphNodeState> = {
        status: result?.status ?? 'completed',
        completedAt,
        outputArtifacts,
        childAgentIds: result?.childAgentIds,
        error: result?.error,
        resourceWaitReason: undefined,
      };
      branch = node.trackId
        ? markBranchTrackNode(branch, node.trackId, node.id, patch)
        : markBranchNode(branch, node.id, patch);
      if (outputArtifacts.length) {
        branch = {
          ...branch,
          artifactIndex: {
            ...branch.artifactIndex,
            [node.id]: outputArtifacts,
          },
          tracks: node.trackId && branch.tracks?.[node.trackId]
            ? {
              ...branch.tracks,
              [node.trackId]: {
                ...branch.tracks[node.trackId],
                artifactIndex: {
                  ...branch.tracks[node.trackId].artifactIndex,
                  [node.id]: outputArtifacts,
                },
              },
            }
            : branch.tracks,
        };
      }
    }

    if (countCompletedPlanNodes(branch, ctx.plan.nodes) === beforeCompletedCount) break;
  }

  const allCompleted = ctx.plan.nodes.every(node => branch.nodes[node.id]?.status === 'completed');
  return {
    ...branch,
    status: allCompleted ? 'completed' : branch.status,
    completedAt: allCompleted ? Date.now() : branch.completedAt,
  };
}

function getPlanResourceWaitReason(
  semaphores: PlanResourceSemaphores,
  node: PlannedNode
): string | undefined {
  const resources = getPlanNodeContract(node.type)?.resources ?? {};
  if (semaphores.branches.activeCount >= semaphores.branches.limitCount) return 'branch capacity exhausted';
  if (resources.modelSlots && semaphores.model.activeCount >= semaphores.model.limitCount) return 'model capacity exhausted';
  if (resources.commandSlots && semaphores.command.activeCount >= semaphores.command.limitCount) return 'command capacity exhausted';
  if (resources.browserSlots && semaphores.browser.activeCount >= semaphores.browser.limitCount) return 'browser capacity exhausted';
  for (const toolName of Object.keys(resources.toolSlots ?? {})) {
    const semaphore = semaphores.tools[toolName];
    if (semaphore && semaphore.activeCount >= semaphore.limitCount) return `${toolName} capacity exhausted`;
  }
  return undefined;
}

async function runWithPlanResources<T>(
  semaphores: PlanResourceSemaphores,
  node: PlannedNode,
  fn: () => Promise<T> | T
): Promise<T> {
  const resources = getPlanNodeContract(node.type)?.resources ?? {};
  const toolEntries = Object.entries(resources.toolSlots ?? {});
  const runToolResources = (index: number): Promise<T> | T => {
    if (index >= toolEntries.length) return fn();
    const [toolName] = toolEntries[index];
    const semaphore = semaphores.tools[toolName];
    if (!semaphore) return runToolResources(index + 1);
    return semaphore.run(() => runToolResources(index + 1));
  };
  const runBrowser = () => resources.browserSlots ? semaphores.browser.run(() => runToolResources(0)) : runToolResources(0);
  const runCommand = () => resources.commandSlots ? semaphores.command.run(runBrowser) : runBrowser();
  const runModel = () => resources.modelSlots ? semaphores.model.run(runCommand) : runCommand();
  return semaphores.branches.run(runModel);
}

export function createInitialBranchState(args: {
  branchId: string;
  workflowId: string;
  projectName: string;
  projectRoot: string;
  plan?: ApplicationBranchPlan;
}): BranchState {
  return {
    branchId: args.branchId,
    workflowId: args.workflowId,
    projectName: args.projectName,
    projectRoot: args.projectRoot,
    status: 'pending',
    nodes: args.plan
      ? Object.fromEntries(args.plan.nodes.map(node => [node.id, {
        id: node.id,
        status: 'pending' as const,
        failureCount: 0,
        outputArtifacts: node.artifactHints,
      }]))
      : {},
    tracks: args.plan ? createInitialTrackStates(args.plan) : {},
    artifactIndex: {},
    contextManifests: {},
    childAgentIds: [],
    retry: createEmptyRetryState(),
  };
}

export function markBranchTrackNode(
  branch: BranchState,
  trackId: string,
  nodeId: string,
  patch: Partial<GraphNodeState>
): BranchState {
  const nextBranch = markBranchNode(branch, nodeId, patch);
  const currentTrack = nextBranch.tracks?.[trackId];
  if (!currentTrack) return nextBranch;
  const status = patch.status === 'failed'
    ? 'failed'
    : patch.status === 'running'
      ? 'running'
      : patch.status === 'completed'
        ? allTrackNodesCompleted(nextBranch, currentTrack.nodeIds)
          ? 'completed'
          : 'running'
        : currentTrack.status;
  return {
    ...nextBranch,
    tracks: {
      ...(nextBranch.tracks ?? {}),
      [trackId]: {
        ...currentTrack,
        status,
        currentNodeId: nodeId,
        error: patch.error ?? currentTrack.error,
        startedAt: currentTrack.startedAt ?? patch.startedAt,
        completedAt: status === 'completed' ? Date.now() : currentTrack.completedAt,
      },
    },
  };
}

export function resetBranchTrackFromNode(
  branch: BranchState,
  trackId: string,
  fromNodeId: string
): BranchState {
  const track = branch.tracks?.[trackId];
  if (!track) return branch;
  const startIndex = track.nodeIds.indexOf(fromNodeId);
  if (startIndex < 0) return branch;
  const resetIds = new Set(track.nodeIds.slice(startIndex));
  const nodes = { ...branch.nodes };
  for (const nodeId of resetIds) {
    nodes[nodeId] = {
      ...nodes[nodeId],
      id: nodeId,
      status: 'pending',
      error: undefined,
      childAgentIds: [],
      outputArtifacts: [],
      failureCount: 0,
    };
  }
  const artifactIndex = { ...branch.artifactIndex };
  for (const nodeId of resetIds) delete artifactIndex[nodeId];
  return {
    ...branch,
    status: 'pending',
    currentNodeId: fromNodeId,
    nodes,
    artifactIndex,
    tracks: {
      ...(branch.tracks ?? {}),
      [trackId]: {
        ...track,
        status: 'pending',
        currentNodeId: fromNodeId,
        error: undefined,
        completedAt: undefined,
        artifactIndex: Object.fromEntries(
          Object.entries(track.artifactIndex).filter(([nodeId]) => !resetIds.has(nodeId))
        ),
      },
    },
  };
}

export function cancelBranchTrack(branch: BranchState, trackId: string): BranchState {
  const track = branch.tracks?.[trackId];
  if (!track) return branch;
  const nodes = { ...branch.nodes };
  for (const nodeId of track.nodeIds) {
    if (['pending', 'running'].includes(nodes[nodeId]?.status ?? 'pending')) {
      nodes[nodeId] = {
        ...nodes[nodeId],
        id: nodeId,
        status: 'interrupted',
        completedAt: Date.now(),
        failureCount: nodes[nodeId]?.failureCount ?? 0,
      };
    }
  }
  return {
    ...branch,
    nodes,
    tracks: {
      ...(branch.tracks ?? {}),
      [trackId]: {
        ...track,
        status: 'cancelled',
        completedAt: Date.now(),
      },
    },
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

function resolvePlannedNodeHandler(
  handlers: PlannedBranchRunnerContext['handlers'],
  node: PlannedNode
): PlannedNodeHandler | undefined {
  return handlers?.[node.id] ?? handlers?.[node.runner] ?? handlers?.[node.type];
}

function branchLeaseNodeId(branchId: string, nodeId: string): string {
  return `branch:${branchId}:${nodeId}`;
}

function failPlannedNode(
  branch: BranchState,
  plan: ApplicationBranchPlan,
  node: PlannedNode,
  message: string
): BranchState {
  let next = node.trackId
    ? markBranchTrackNode(branch, node.trackId, node.id, {
      status: 'failed',
      completedAt: Date.now(),
      error: message,
      failureCount: (branch.nodes[node.id]?.failureCount ?? 0) + 1,
    })
    : markBranchNode(branch, node.id, {
      status: 'failed',
      completedAt: Date.now(),
      error: message,
      failureCount: (branch.nodes[node.id]?.failureCount ?? 0) + 1,
    });
  return next;
}

function mergeBranchPatch(branch: BranchState, patch: Partial<BranchState>): BranchState {
  return {
    ...branch,
    ...patch,
    nodes: patch.nodes ? { ...branch.nodes, ...patch.nodes } : branch.nodes,
    tracks: patch.tracks ? { ...(branch.tracks ?? {}), ...patch.tracks } : branch.tracks,
    artifactIndex: patch.artifactIndex ? { ...branch.artifactIndex, ...patch.artifactIndex } : branch.artifactIndex,
    contextManifests: patch.contextManifests
      ? { ...branch.contextManifests, ...patch.contextManifests }
      : branch.contextManifests,
    retry: patch.retry ? { ...branch.retry, ...patch.retry } : branch.retry,
  };
}

function countCompletedPlanNodes(branch: BranchState, nodes: PlannedNode[]): number {
  return nodes.filter(node => branch.nodes[node.id]?.status === 'completed').length;
}

function createInitialTrackStates(plan: ApplicationBranchPlan): Record<string, BranchTrackState> {
  return Object.fromEntries(plan.tracks.map(track => [track.trackId, {
    trackId: track.trackId,
    kind: track.kind,
    status: 'pending' as const,
    nodeIds: track.nodes.map(node => node.id),
    artifactIndex: {},
  }]));
}

function allTrackNodesCompleted(branch: BranchState, nodeIds: string[]): boolean {
  return nodeIds.every(nodeId => branch.nodes[nodeId]?.status === 'completed');
}
