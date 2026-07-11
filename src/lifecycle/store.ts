import * as fs from 'fs';
import * as path from 'path';
import { getRunPaths, ensureRunDirectories } from '../runtime/paths.js';
import type { ExecutionState } from '../persistence/stateStore.js';
import type {
  AppDeliveryState,
  LifecyclePhase,
  LifecycleState,
  LifecycleStatus,
  NodeRunRef,
  WorkflowRunRef,
} from './types.js';

export const LIFECYCLE_STATE_ARTIFACT_PATH = 'artifacts/lifecycle-state.json';

export interface CreateLifecycleStateInput {
  requirementId: string;
  runId: string;
  phase?: LifecyclePhase;
  status?: LifecycleStatus;
  apps?: AppDeliveryState[];
  workflowRuns?: WorkflowRunRef[];
  nodeRuns?: NodeRunRef[];
  metadata?: Record<string, unknown>;
  now?: number;
}

export function getLifecycleStatePath(runId: string): string {
  return path.join(getRunPaths(runId).runDir, LIFECYCLE_STATE_ARTIFACT_PATH);
}

export function createEmptyLifecycleState(input: CreateLifecycleStateInput): LifecycleState {
  const now = input.now ?? Date.now();
  return {
    schemaVersion: 1,
    requirementId: input.requirementId,
    runId: input.runId,
    phase: input.phase ?? 'created',
    status: input.status ?? 'active',
    apps: input.apps ?? [],
    artifacts: [],
    approvals: [],
    workflowRuns: input.workflowRuns ?? [],
    nodeRuns: input.nodeRuns ?? [],
    ciRuns: [],
    environments: [],
    deploymentSets: [],
    testRuns: [],
    diagnoses: [],
    fixCycles: [],
    traces: [],
    events: [],
    createdAt: now,
    updatedAt: now,
    metadata: input.metadata,
  };
}

export function loadLifecycleState(runId: string): LifecycleState | null {
  const file = getLifecycleStatePath(runId);
  try {
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as LifecycleState;
  } catch {
    return null;
  }
}

export function saveLifecycleState(state: LifecycleState): LifecycleState {
  state.updatedAt = Date.now();
  const paths = ensureRunDirectories(state.runId);
  const file = path.join(paths.runDir, LIFECYCLE_STATE_ARTIFACT_PATH);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8');
  return state;
}

export function updateLifecycleState(
  runId: string,
  updater: (state: LifecycleState) => LifecycleState | void,
  fallback?: CreateLifecycleStateInput,
): LifecycleState {
  const existing = loadLifecycleState(runId);
  if (!existing && !fallback) {
    throw new Error(`Lifecycle state does not exist for run ${runId}`);
  }
  const state = existing ?? createEmptyLifecycleState(fallback!);
  const next = updater(state) ?? state;
  return saveLifecycleState(next);
}

export function lifecycleReferenceForRun(runId: string): {
  statePath: string;
  schemaVersion: 1;
} {
  return {
    statePath: LIFECYCLE_STATE_ARTIFACT_PATH,
    schemaVersion: 1,
  };
}

export function attachLifecycleReference(state: ExecutionState): ExecutionState {
  return {
    ...state,
    metadata: {
      ...state.metadata,
      lifecycle: lifecycleReferenceForRun(state.runId),
    },
  };
}

