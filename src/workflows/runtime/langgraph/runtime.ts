import { Command } from '@langchain/langgraph';
import { getConfig } from '../../../config/index.js';
import { getStateStore } from '../../../persistence/stateStore.js';
import { getWorkflowDefinition } from '../../storage.js';
import { WorkflowDefinition } from '../../types.js';
import {
  createMemoryCheckpointer,
  readLatestFileCheckpoint,
  recoverFileCheckpointFromExecutionState,
  writeFileCheckpoint,
} from './checkpointer.js';
import { compileWorkflowDefinition } from './compiler.js';
import { createLangGraphEventBridge } from './eventBridge.js';
import { createInitialGraphState, PipelineGraphState } from './state.js';

export interface LangGraphStartOptions {
  workflowId: string;
}

export interface LangGraphResumeDecision {
  approved: boolean;
  feedback?: string;
}

const activeRuns = new Map<string, LangGraphRuntimeHandle>();

export class LangGraphRuntime {
  async start(runId: string, options: LangGraphStartOptions): Promise<PipelineGraphState> {
    const workflow = getWorkflowDefinition(options.workflowId);
    const handle = createRuntimeHandle(runId, workflow);
    activeRuns.set(runId, handle);

    const existingState = getStateStore(runId).loadExecutionState();
    const initialGraphState = createInitialGraphState({
      runId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      nodeIds: workflow.nodes.filter((node) => node.type !== 'end').map((node) => node.id),
      permissionMode: existingState?.permissionMode ?? 'default',
      modelOverrides: existingState?.modelOverrides ?? {},
      startedAt: existingState?.startedAt,
    });

    handle.bridge.emitPipelineEvent('pipeline_started', { runId, runtime: 'langgraph' });
    const result = await handle.app.invoke(
      { graph: initialGraphState },
      langGraphRunConfig(runId)
    );
    const graphState = normalizeGraphResult(result.graph, initialGraphState);
    persistRuntimeState(handle, graphState, 'start');
    return graphState;
  }

  async resume(runId: string, decision: LangGraphResumeDecision): Promise<PipelineGraphState> {
    const handle = activeRuns.get(runId);
    if (!handle) {
      const latest = readLatestFileCheckpoint(runId) ?? recoverFileCheckpointFromExecutionState(runId);
      if (!latest) {
        throw new Error(`No active LangGraph runtime or checkpoint found for run '${runId}'.`);
      }
      throw new Error(
        `Run '${runId}' has a file checkpoint but no active in-memory LangGraph app; durable graph resume will be implemented with the production checkpointer.`
      );
    }

    handle.bridge.emitPipelineEvent('pipeline_resumed', { runId, runtime: 'langgraph' });
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
    const bridge = handle?.bridge ?? createLangGraphEventBridge(runId);
    bridge.emitPipelineEvent('pipeline_cancelled', { runId, runtime: 'langgraph' });
    bridge.syncReadModel(cancelled, 'cancel');
    writeFileCheckpoint(runId, cancelled, 'cancel');
    activeRuns.delete(runId);
  }
}

export function getLangGraphRuntime(): LangGraphRuntime {
  return new LangGraphRuntime();
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

interface LangGraphRuntimeHandle {
  app: ReturnType<typeof compileWorkflowDefinition>;
  bridge: ReturnType<typeof createLangGraphEventBridge>;
  workflow: WorkflowDefinition;
  lastState: PipelineGraphState;
}

function createRuntimeHandle(
  runId: string,
  workflow: WorkflowDefinition
): LangGraphRuntimeHandle {
  const bridge = createLangGraphEventBridge(runId, workflow);
  const app = compileWorkflowDefinition(workflow, {
    checkpointer: createMemoryCheckpointer(),
  });
  const latest = readLatestFileCheckpoint(runId)?.state;

  return {
    app,
    bridge,
    workflow,
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
  handle.bridge.syncReadModel(graphState, reason);
  writeFileCheckpoint(graphState.runId, graphState, reason);
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
