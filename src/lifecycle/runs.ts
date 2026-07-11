import * as fs from 'fs';
import * as path from 'path';
import { ensureRunDirectories, getRunPaths } from '../runtime/paths.js';
import type {
  LifecycleState,
  NodeRun,
  NodeRunRef,
  WorkflowRun,
  WorkflowRunRef,
} from './types.js';

export function getWorkflowRunPath(runId: string, workflowRunId: string): string {
  return path.join(getRunPaths(runId).artifactsDir, 'workflow-runs', `${workflowRunId}.json`);
}

export function getNodeRunPath(runId: string, nodeRunId: string): string {
  return path.join(getRunPaths(runId).artifactsDir, 'node-runs', `${nodeRunId}.json`);
}

export function saveWorkflowRun(run: WorkflowRun): WorkflowRun {
  const paths = ensureRunDirectories(run.runId);
  const file = path.join(paths.artifactsDir, 'workflow-runs', `${run.workflowRunId}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(run, null, 2), 'utf-8');
  return run;
}

export function loadWorkflowRun(runId: string, workflowRunId: string): WorkflowRun | null {
  const file = getWorkflowRunPath(runId, workflowRunId);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as WorkflowRun;
  } catch {
    return null;
  }
}

export function saveNodeRun(run: NodeRun): NodeRun {
  const paths = ensureRunDirectories(run.runId);
  const file = path.join(paths.artifactsDir, 'node-runs', `${run.nodeRunId}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(run, null, 2), 'utf-8');
  return run;
}

export function loadNodeRun(runId: string, nodeRunId: string): NodeRun | null {
  const file = getNodeRunPath(runId, nodeRunId);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as NodeRun;
  } catch {
    return null;
  }
}

export function upsertWorkflowRunRef(state: LifecycleState, run: WorkflowRun): WorkflowRunRef {
  const ref: WorkflowRunRef = {
    workflowRunId: run.workflowRunId,
    workflowId: run.workflowId,
    status: run.status,
  };
  state.workflowRuns = [
    ...state.workflowRuns.filter(existing => existing.workflowRunId !== ref.workflowRunId),
    ref,
  ];
  if (run.status === 'running' || run.status === 'waiting_approval') {
    state.activeWorkflowRunId = run.workflowRunId;
  } else if (state.activeWorkflowRunId === run.workflowRunId) {
    delete state.activeWorkflowRunId;
  }
  return ref;
}

export function upsertNodeRunRef(state: LifecycleState, run: NodeRun): NodeRunRef {
  const ref: NodeRunRef = {
    nodeRunId: run.nodeRunId,
    workflowRunId: run.workflowRunId,
    nodeId: run.nodeId,
    status: run.status,
  };
  state.nodeRuns = [
    ...state.nodeRuns.filter(existing => existing.nodeRunId !== ref.nodeRunId),
    ref,
  ];
  return ref;
}

export function persistWorkflowRun(state: LifecycleState, run: WorkflowRun): WorkflowRun {
  const saved = saveWorkflowRun(run);
  upsertWorkflowRunRef(state, saved);
  return saved;
}

export function persistNodeRun(state: LifecycleState, run: NodeRun): NodeRun {
  const saved = saveNodeRun(run);
  upsertNodeRunRef(state, saved);
  return saved;
}

