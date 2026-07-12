import * as fs from 'fs';
import * as path from 'path';
import { MemorySaver } from '@langchain/langgraph';
import { getRunPaths } from '../../../runtime/paths.js';
import type { ExecutionState, NodeState, ProjectState } from '../../../persistence/executionTypes.js';
import {
  createEmptyRetryState,
  GraphProjectState,
  PipelineGraphState,
} from './state.js';

export type LangGraphCheckpointerMode = 'memory' | 'file' | 'postgres';

export interface LangGraphCheckpointEnvelope {
  id: string;
  runId: string;
  threadId: string;
  state: PipelineGraphState;
  metadata: {
    workflowId: string;
    workflowVersion: number;
    createdAt: number;
    reason: string;
  };
}

export interface LangGraphCheckpointPaths {
  rootDir: string;
  checkpointsDir: string;
  latestPath: string;
  metadataPath: string;
}

export function createMemoryCheckpointer(): MemorySaver {
  return new MemorySaver();
}

export function getLangGraphCheckpointPaths(runId: string): LangGraphCheckpointPaths {
  const runPaths = getRunPaths(runId);
  const rootDir = path.join(runPaths.runDir, 'langgraph');
  return {
    rootDir,
    checkpointsDir: path.join(rootDir, 'checkpoints'),
    latestPath: path.join(rootDir, 'latest.json'),
    metadataPath: path.join(rootDir, 'metadata.json'),
  };
}

export function writeFileCheckpoint(
  runId: string,
  state: PipelineGraphState,
  reason: string
): LangGraphCheckpointEnvelope {
  const paths = getLangGraphCheckpointPaths(runId);
  fs.mkdirSync(paths.checkpointsDir, { recursive: true });

  const now = Date.now();
  const envelope: LangGraphCheckpointEnvelope = {
    id: `checkpoint-${now}`,
    runId,
    threadId: runId,
    state,
    metadata: {
      workflowId: state.workflowId,
      workflowVersion: state.workflowVersion,
      createdAt: now,
      reason,
    },
  };

  const checkpointPath = path.join(paths.checkpointsDir, `${envelope.id}.json`);
  atomicWriteJson(checkpointPath, envelope);
  atomicWriteJson(paths.latestPath, envelope);
  atomicWriteJson(paths.metadataPath, {
    runId,
    threadId: runId,
    latestCheckpointId: envelope.id,
    updatedAt: now,
  });

  return envelope;
}

export function readLatestFileCheckpoint(
  runId: string
): LangGraphCheckpointEnvelope | null {
  const paths = getLangGraphCheckpointPaths(runId);
  try {
    if (!fs.existsSync(paths.latestPath)) return null;
    return JSON.parse(fs.readFileSync(paths.latestPath, 'utf-8')) as LangGraphCheckpointEnvelope;
  } catch {
    return null;
  }
}

export function recoverFileCheckpointFromExecutionState(
  runId: string,
  options: {
    workflowId?: string;
    workflowVersion?: number;
    reason?: string;
    overwriteExisting?: boolean;
  } = {}
): LangGraphCheckpointEnvelope | null {
  if (!options.overwriteExisting) {
    const latest = readLatestFileCheckpoint(runId);
    if (latest) return latest;
  }

  const runPaths = getRunPaths(runId);
  try {
    if (!fs.existsSync(runPaths.executionState)) return null;
    const executionState = JSON.parse(fs.readFileSync(runPaths.executionState, 'utf-8')) as ExecutionState;
    const recovered = graphStateFromExecutionState(executionState, {
      workflowId: options.workflowId,
      workflowVersion: options.workflowVersion,
    });
    return writeFileCheckpoint(runId, recovered, options.reason ?? 'execution-state-recovery');
  } catch {
    return null;
  }
}

function atomicWriteJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

function graphStateFromExecutionState(
  state: ExecutionState,
  options: { workflowId?: string; workflowVersion?: number }
): PipelineGraphState {
  const retry = createEmptyRetryState();
  return {
    runId: state.runId,
    workflowId: options.workflowId ?? String(state.metadata?.workflowId ?? 'recovered-execution-state'),
    workflowVersion: options.workflowVersion ?? Number(state.metadata?.workflowVersion ?? 0),
    status: normalizeGraphStatus(state.status),
    currentNodeId: state.currentNodeId,
    nodes: Object.fromEntries(state.nodes.map(node => [node.id, graphNodeFromExecutionNode(node)])),
    projects: (state.projects ?? []).map(graphProjectFromExecutionProject),
    branches: {},
    branchOrder: [],
    joins: {},
    artifactIndex: state.artifactIndex ?? {},
    contextManifests: state.contextManifests ?? {},
    modelOverrides: state.modelOverrides ?? {},
    permissionMode: state.permissionMode,
    currentAgentRunId: state.currentAgentRunId,
    rollback: state.rollback
      ? {
          ...state.rollback,
          affectedBranchIds: [],
        }
      : undefined,
    retry,
    error: state.error,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    completedAt: state.completedAt,
  };
}

function graphNodeFromExecutionNode(node: NodeState): PipelineGraphState['nodes'][string] {
  return {
    id: node.id,
    status: node.status,
    startedAt: node.startedAt,
    completedAt: node.completedAt,
    outputArtifacts: node.outputArtifacts,
    childAgentIds: node.childAgentIds,
    error: node.error,
    failureCount: node.failureCount ?? 0,
  };
}

function graphProjectFromExecutionProject(project: ProjectState): GraphProjectState {
  const projectWithBranch = project as ProjectState & { branchId?: string };
  return {
    name: project.name,
    root: project.root,
    branchId: projectWithBranch.branchId,
    currentNodeId: project.currentNodeId,
    status: project.status === 'interrupted' ? 'interrupted' : project.status,
    retry: {
      ...createEmptyRetryState(),
      reviewBlockCount: project.retry.reviewBlockCount,
      testRetryCount: project.retry.testRetryCount,
      coverageRetryCount: project.retry.coverageRetryCount,
    },
  };
}

function normalizeGraphStatus(status: ExecutionState['status']): PipelineGraphState['status'] {
  if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'waiting_confirmation') {
    return status;
  }
  return 'running';
}
