import { Command } from '@langchain/langgraph';
import { getConfig } from '../../../config/index.js';
import { getStateStore } from '../../../persistence/stateStore.js';
import { getWorkflowDefinition } from '../../storage.js';
import { WorkflowDefinition } from '../../types.js';
import {
  createConfiguredCheckpointer,
  createPostgresCheckpointer,
  readLatestFileCheckpoint,
  recoverFileCheckpointFromExecutionState,
  writeFileCheckpoint,
} from './checkpointer.js';
import { compileWorkflowDefinition } from './compiler.js';
import { createLangGraphEventBridge } from './eventBridge.js';
import { createInitialGraphState, PipelineGraphState } from './state.js';
import type { NodeLeaseExecutor } from '../../../storage/nodeLeaseExecutor.js';
import type { FencedRuntimeTransitionCommitter } from '../../../storage/runtimeNodeTransition.js';
import type { PipelineArtifactWriter } from '../../../storage/pipelineArtifactWriter.js';
import { syncExecutionStateFromGraph } from './readModelSync.js';

export interface LangGraphStartOptions {
  workflowId: string;
}

export interface LangGraphResumeDecision {
  approved: boolean;
  feedback?: string;
}

const activeRuns = new Map<string, LangGraphRuntimeHandle>();
let configuredRuntimeDependencies: {
  nodeLeaseExecutor?: NodeLeaseExecutor;
  transitionCommitter?: FencedRuntimeTransitionCommitter;
  artifactWriter?: PipelineArtifactWriter;
} = {};

export class LangGraphRuntime {
  constructor(
    private readonly nodeLeaseExecutor?: NodeLeaseExecutor,
    private readonly transitionCommitter?: FencedRuntimeTransitionCommitter,
    private readonly artifactWriter?: PipelineArtifactWriter,
  ) {}

  async start(runId: string, options: LangGraphStartOptions): Promise<PipelineGraphState> {
    const workflow = getWorkflowDefinition(options.workflowId);
    const handle = await createRuntimeHandle(
      runId,
      workflow,
      undefined,
      this.nodeLeaseExecutor,
      this.transitionCommitter,
      this.artifactWriter,
    );
    activeRuns.set(runId, handle);

    const existingState = this.transitionCommitter
      ? await this.transitionCommitter.loadRun(runId)
      : getStateStore(runId).loadExecutionState();
    const initialGraphState = createInitialGraphState({
      runId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      nodeIds: workflow.nodes.filter((node) => node.type !== 'end').map((node) => node.id),
      permissionMode: existingState?.permissionMode ?? 'default',
      modelOverrides: existingState?.modelOverrides ?? {},
      startedAt: existingState?.startedAt,
    });

    if (!this.transitionCommitter) handle.bridge.emitPipelineEvent('pipeline_started', { runId, runtime: 'langgraph' });
    const result = await handle.app.invoke(
      { graph: initialGraphState },
      langGraphRunConfig(runId)
    );
    const graphState = normalizeGraphResult(result.graph, initialGraphState);
    persistRuntimeState(handle, graphState, 'start');
    return graphState;
  }

  async resume(runId: string, decision: LangGraphResumeDecision): Promise<PipelineGraphState> {
    let handle = activeRuns.get(runId);
    if (!handle) {
      const recovered = await recoverPostgresRuntimeHandle(runId);
      if (recovered) handle = recovered;
    }
    if (!handle) {
      const latest = readLatestFileCheckpoint(runId) ?? recoverFileCheckpointFromExecutionState(runId);
      if (!latest) {
        throw new Error(`No active LangGraph runtime or checkpoint found for run '${runId}'.`);
      }
      throw new Error(
        `Run '${runId}' has a file checkpoint but no active in-memory LangGraph app; durable graph resume will be implemented with the production checkpointer.`
      );
    }

    if (!this.transitionCommitter) handle.bridge.emitPipelineEvent('pipeline_resumed', { runId, runtime: 'langgraph' });
    const result = await handle.app.invoke(
      new Command({ resume: decision }),
      langGraphRunConfig(runId)
    );
    const graphState = normalizeGraphResult(result.graph, handle.lastState);
    persistRuntimeState(handle, graphState, 'resume');
    return graphState;
  }

  async cancel(runId: string): Promise<void> {
    const handle = activeRuns.get(runId);
    const latest = handle?.lastState ?? (
      readLatestFileCheckpoint(runId) ?? recoverFileCheckpointFromExecutionState(runId)
    )?.state;
    if (!latest) return;

    const cancelled: PipelineGraphState = {
      ...latest,
      status: 'cancelled',
      completedAt: Date.now(),
      updatedAt: Date.now(),
    };
    const bridge = handle?.bridge ?? createLangGraphEventBridge(runId, undefined, {
      productTransitionsAreDurable: Boolean(this.transitionCommitter),
    });
    if (this.transitionCommitter && this.nodeLeaseExecutor) {
      const nodeId = cancelled.currentNodeId ?? 'runtime-cancel';
      await this.nodeLeaseExecutor.execute(runId, nodeId, lease => this.transitionCommitter!.commit({
        runtime: 'langgraph',
        runId,
        nodeId,
        transitionId: `langgraph:${runId}:${nodeId}:cancelled:${cancelled.completedAt}`,
        lease,
        updateRun: current => syncExecutionStateFromGraph(cancelled, {
          reason: 'langgraph-cancel',
          existing: current,
          workflow: handle?.workflow,
        }),
        includeCurrentLifecycle: true,
        eventType: 'pipeline_cancelled',
        eventData: { status: 'cancelled' },
        timestamp: cancelled.completedAt,
      }));
    } else {
      bridge.emitPipelineEvent('pipeline_cancelled', { runId, runtime: 'langgraph' });
      bridge.syncReadModel(cancelled, 'cancel');
    }
    writeFileCheckpoint(runId, cancelled, 'cancel');
    activeRuns.delete(runId);
  }
}

export function getLangGraphRuntime(
  nodeLeaseExecutor?: NodeLeaseExecutor,
  transitionCommitter?: FencedRuntimeTransitionCommitter,
  artifactWriter?: PipelineArtifactWriter,
): LangGraphRuntime {
  if (nodeLeaseExecutor || transitionCommitter || artifactWriter) {
    configuredRuntimeDependencies = { nodeLeaseExecutor, transitionCommitter, artifactWriter };
  }
  return new LangGraphRuntime(nodeLeaseExecutor, transitionCommitter, artifactWriter);
}

export function shouldUseLangGraphRuntime(): boolean {
  return getConfig().workflow.runtime === 'langgraph';
}

export function langGraphRunConfig(runId: string) {
  return {
    configurable: {
      thread_id: runId,
    },
  };
}

/** Used by process-recovery orchestration after an in-memory runtime is lost. */
export async function recoverPostgresRuntimeForRun(runId: string): Promise<boolean> {
  return Boolean(await recoverPostgresRuntimeHandle(runId));
}

export async function hasPostgresCheckpointForRun(runId: string): Promise<boolean> {
  const config = getConfig();
  if (config.workflow.checkpointer !== 'postgres' || !config.storage.databaseUrl) return false;
  const checkpointer = await createPostgresCheckpointer(config.storage.databaseUrl);
  try { return Boolean(await checkpointer.getTuple(langGraphRunConfig(runId))); }
  finally { await checkpointer.end(); }
}

interface LangGraphRuntimeHandle {
  app: ReturnType<typeof compileWorkflowDefinition>;
  bridge: ReturnType<typeof createLangGraphEventBridge>;
  workflow: WorkflowDefinition;
  lastState: PipelineGraphState;
  checkpointMode: ReturnType<typeof getConfig>['workflow']['checkpointer'];
  productTransitions: boolean;
}

async function createRuntimeHandle(
  runId: string,
  workflow: WorkflowDefinition,
  checkpointer?: unknown,
  nodeLeaseExecutor?: NodeLeaseExecutor,
  transitionCommitter?: FencedRuntimeTransitionCommitter,
  artifactWriter?: PipelineArtifactWriter,
): Promise<LangGraphRuntimeHandle> {
  const bridge = createLangGraphEventBridge(runId, workflow, {
    productTransitionsAreDurable: Boolean(transitionCommitter),
  });
  const config = getConfig();
  const app = compileWorkflowDefinition(workflow, {
    checkpointer: checkpointer ?? await createConfiguredCheckpointer(config.workflow.checkpointer, config.storage.databaseUrl),
    nodeLeaseExecutor,
    transitionCommitter,
    artifactWriter,
  });
  const latest = readLatestFileCheckpoint(runId)?.state;

  return {
    app,
    bridge,
    workflow,
    checkpointMode: config.workflow.checkpointer,
    productTransitions: Boolean(transitionCommitter),
    lastState: latest ?? createInitialGraphState({
      runId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      nodeIds: workflow.nodes.filter((node) => node.type !== 'end').map((node) => node.id),
      permissionMode: 'default',
    }),
  };
}

function persistRuntimeState(
  handle: LangGraphRuntimeHandle,
  graphState: PipelineGraphState,
  reason: string
): void {
  handle.lastState = graphState;
  if (!handle.productTransitions) handle.bridge.syncReadModel(graphState, reason);
  if (handle.checkpointMode === 'file') writeFileCheckpoint(graphState.runId, graphState, reason);
}

async function recoverPostgresRuntimeHandle(runId: string): Promise<LangGraphRuntimeHandle | null> {
  const config = getConfig();
  if (config.workflow.checkpointer !== 'postgres' || !config.storage.databaseUrl) return null;
  const checkpointer = await createPostgresCheckpointer(config.storage.databaseUrl);
  const tuple = await checkpointer.getTuple(langGraphRunConfig(runId));
  const graphState = tuple?.checkpoint.channel_values.graph;
  if (!isPipelineGraphState(graphState)) {
    await checkpointer.end();
    return null;
  }
  const workflow = getWorkflowDefinition(graphState.workflowId);
  const runtime = configuredRuntimeDependencies;
  const handle = await createRuntimeHandle(
    runId,
    workflow,
    checkpointer,
    runtime.nodeLeaseExecutor,
    runtime.transitionCommitter,
    runtime.artifactWriter,
  );
  handle.lastState = graphState;
  // The checkpoint is internal runtime state; reconcile the separately owned
  // product read model only at the durable recovery boundary.
  if (!handle.productTransitions) handle.bridge.syncReadModel(graphState, 'postgres-checkpoint-recovery');
  activeRuns.set(runId, handle);
  return handle;
}

function isPipelineGraphState(value: unknown): value is PipelineGraphState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.runId === 'string' && typeof candidate.workflowId === 'string' &&
    typeof candidate.workflowVersion === 'number' && typeof candidate.nodes === 'object';
}

function normalizeGraphResult(
  graphState: PipelineGraphState | undefined,
  fallback: PipelineGraphState
): PipelineGraphState {
  return {
    ...(graphState ?? fallback),
    updatedAt: Date.now(),
  };
}
