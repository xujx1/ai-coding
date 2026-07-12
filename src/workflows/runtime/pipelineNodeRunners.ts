import type { EventLog } from '../../events/EventLog.js';
import type { PipelineEvent as LoggedPipelineEvent } from '../../events/types.js';
import type { ContextManifest, ExecutionState, NodeState } from '../../persistence/executionTypes.js';
import type { StateStore } from '../../persistence/stateStore.js';
import type { RunPaths } from '../../runtime/paths.js';
import type { PipelineEvent } from '../engine/pipelineEngine.js';
import type { PipelineNode } from '../definitions/pipelineDefinition.js';

export interface StageRunnerContext {
  runId: string;
  workflowId: string;
  nodeId: string;
  stageId: string;
  node: PipelineNode;
  paths: RunPaths;
  executionState: ExecutionState;
  nodeState: NodeState;
  eventLog: EventLog;
  store: StateStore;
  emit: (event: PipelineEvent) => void;
  writeArtifact: (
    relativePath: string,
    content: string,
    description: string
  ) => void;
  logEvent: (
    type: LoggedPipelineEvent['type'],
    data?: Record<string, unknown>,
    agentRunId?: string,
    nodeId?: string
  ) => LoggedPipelineEvent;
  legacyDelegates?: LegacyStageRunnerDelegates;
}

export interface StageRunnerResult {
  output?: unknown;
  outputArtifacts: string[];
  contextManifest?: ContextManifest;
  childAgentIds?: string[];
}

export type StageRunner = (
  ctx: StageRunnerContext
) => Promise<StageRunnerResult> | StageRunnerResult;

export type StageRunnerRegistry = Partial<Record<string, StageRunner>>;

export interface LegacyStageRunnerDelegates {
  mrdRender: (ctx: StageRunnerContext) => Promise<unknown>;
  implementationPlan: (ctx: StageRunnerContext) => Promise<unknown>;
  specGenerate: (ctx: StageRunnerContext) => Promise<unknown>;
  javaImpl: (ctx: StageRunnerContext) => Promise<unknown>;
  testcodeGenerate: (ctx: StageRunnerContext) => Promise<unknown>;
  archive: (ctx: StageRunnerContext) => Promise<unknown>;
}

export function createStageRunnerResult(
  output: unknown,
  outputArtifacts: string[] = [],
  extra: Partial<Omit<StageRunnerResult, 'output' | 'outputArtifacts'>> = {}
): StageRunnerResult {
  return {
    output,
    outputArtifacts,
    ...extra,
  };
}
