/**
 * State persistence for execution-state.json, agent state, and checkpoints.
 * All state is written to disk so it survives page refresh and process restart.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getRunPaths, ensureRunDirectories, RunPaths } from '../runtime/paths.js';
import type { SessionWorkflowInstance } from '../workflows/sessionInstance.js';

// ── Pipeline node status ───────────────────────────────────────────────────

export type NodeStatus = 'pending' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'waiting_fix' | 'suspended' | 'interrupted' | 'skipped';

export interface NodeState {
  id: string;
  name: string;
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
  agentRunId?: string;
  output?: unknown;
  outputArtifacts?: string[];
  childAgentIds?: string[];
  error?: string;
  confirmation?: {
    waiting: boolean;
    content?: string;
    approved?: boolean;
    feedback?: string;
    resumeApproved?: boolean;
  };
  failureCount: number;
}

// ── Agent state ────────────────────────────────────────────────────────────

export type AgentStatus =
  | 'created'
  | 'waking'
  | 'running'
  | 'waiting_tool'
  | 'waiting_confirmation'
  | 'compacting'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'waiting_fix'
  | 'interrupted';

export interface ModelSwitchEntry {
  fromModel: string;
  toModel: string;
  timestamp: number;
  reason: string;
}

export interface AgentState {
  agentRunId: string;
  runId: string;
  nodeId: string;
  projectName?: string;
  projectRoot?: string;
  taskDescription?: string;
  status: AgentStatus;
  systemPrompt?: string;
  currentModelId: string;
  currentProviderId: string;
  intelligenceLevel: number;
  modelSwitchHistory: ModelSwitchEntry[];
  turnCount: number;
  tokenUsage: { input: number; output: number };
  compactCount: number;
  toolCallCount: number;
  inputArtifacts?: string[];
  outputArtifacts?: string[];
  transcriptPath?: string;
  planPath?: string;
  lastEventOffset?: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  plan?: PlanState;
}

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  risk?: 'low' | 'medium' | 'high';
}

export interface PlanState {
  title: string;
  steps: PlanStep[];
  risks: string[];
  confirmed?: boolean;
  feedback?: string;
  createdAt: number;
  confirmedAt?: number;
}

// ── Execution state (full run state) ──────────────────────────────────────

export type PipelineStatus = 'idle' | 'running' | 'waiting_confirmation' | 'suspended' | 'completed' | 'failed' | 'cancelled';

export interface ProjectState {
  name: string;
  root: string;
  currentNodeId?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'waiting_fix' | 'suspended' | 'interrupted';
  retry: {
    reviewBlockCount: number;
    testRetryCount: number;
    coverageRetryCount: number;
  };
}

export interface RollbackState {
  active: boolean;
  sourceNodeId: string;
  targetNodeId: string;
  affectedProjects: string[];
  reason: string;
  category?: string;
  startedAt: number;
  attempt: number;
}

export interface ContextManifest {
  nodeId: string;
  projectName?: string;
  outputArtifacts: Array<{
    path: string;
    summary: string;
    size: number;
  }>;
  importantDecisions: string[];
  riskNotes: string[];
  confirmation?: {
    approved: boolean;
    feedback?: string;
  };
  nextNodeInputs: string[];
}

export interface ExecutionState {
  runId: string;
  name: string;
  description?: string;
  status: PipelineStatus;
  currentNodeIndex: number;
  currentNodeId?: string;
  nodes: NodeState[];
  currentAgentRunId?: string;
  permissionMode: string;
  modelOverrides: Record<string, string>;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  artifactIndex?: Record<string, string[]>;
  projects?: ProjectState[];
  rollback?: RollbackState;
  contextManifests?: Record<string, ContextManifest>;
  workflowInstance?: SessionWorkflowInstance;
}

// ── Session state ──────────────────────────────────────────────────────────

export interface SessionState {
  runId: string;
  createdAt: number;
  lastAccessedAt: number;
  suspendedAt?: number;
  resumedAt?: number;
}

// ── StateStore class ───────────────────────────────────────────────────────

export class StateStore {
  private paths: RunPaths;

  constructor(runId: string) {
    this.paths = ensureRunDirectories(runId);
  }

  // ── Execution State ───────────────────────────────────────────────────

  loadExecutionState(): ExecutionState | null {
    try {
      if (fs.existsSync(this.paths.executionState)) {
        return JSON.parse(fs.readFileSync(this.paths.executionState, 'utf-8'));
      }
    } catch {
      // corrupted, start fresh
    }
    return null;
  }

  saveExecutionState(state: ExecutionState): void {
    state.updatedAt = Date.now();
    fs.writeFileSync(
      this.paths.executionState,
      JSON.stringify(state, null, 2),
      'utf-8'
    );
  }

  // ── Agent State ───────────────────────────────────────────────────────

  loadAgentState(agentRunId: string): AgentState | null {
    const agentFile = path.join(this.paths.agentsDir, `${agentRunId}.json`);
    try {
      if (fs.existsSync(agentFile)) {
        return JSON.parse(fs.readFileSync(agentFile, 'utf-8'));
      }
    } catch {
      // ignore
    }
    return null;
  }

  saveAgentState(state: AgentState): void {
    state.updatedAt = Date.now();
    const agentFile = path.join(this.paths.agentsDir, `${state.agentRunId}.json`);
    fs.writeFileSync(agentFile, JSON.stringify(state, null, 2), 'utf-8');
  }

  listAgentStates(): AgentState[] {
    const result: AgentState[] = [];
    if (!fs.existsSync(this.paths.agentsDir)) return result;
    for (const file of fs.readdirSync(this.paths.agentsDir)) {
      if (file.endsWith('.json') && !file.endsWith('.plan.json')) {
        try {
          result.push(JSON.parse(fs.readFileSync(path.join(this.paths.agentsDir, file), 'utf-8')));
        } catch { /* skip */ }
      }
    }
    return result.sort((a, b) => b.startedAt - a.startedAt);
  }

  // ── Plan State ────────────────────────────────────────────────────────

  loadPlan(agentRunId: string): PlanState | null {
    const planFile = path.join(this.paths.agentsDir, `${agentRunId}.plan.json`);
    try {
      if (fs.existsSync(planFile)) {
        return JSON.parse(fs.readFileSync(planFile, 'utf-8'));
      }
    } catch { /* ignore */ }
    return null;
  }

  savePlan(agentRunId: string, plan: PlanState): void {
    const planFile = path.join(this.paths.agentsDir, `${agentRunId}.plan.json`);
    fs.writeFileSync(planFile, JSON.stringify(plan, null, 2), 'utf-8');
  }

  // ── Checkpoints ──────────────────────────────────────────────────────

  saveCheckpoint(name: string, data: unknown): void {
    const ckptFile = path.join(this.paths.checkpointsDir, `${name}-${Date.now()}.json`);
    fs.writeFileSync(ckptFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  listCheckpoints(): string[] {
    if (!fs.existsSync(this.paths.checkpointsDir)) return [];
    return fs.readdirSync(this.paths.checkpointsDir)
      .filter(f => f.endsWith('.json'))
      .sort();
  }

  // ── Transcript (events replay) ───────────────────────────────────────

  loadTranscript(): unknown[] {
    if (!fs.existsSync(this.paths.eventsLog)) return [];
    const content = fs.readFileSync(this.paths.eventsLog, 'utf-8');
    return content.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  }
}

// ── Global store registry ──────────────────────────────────────────────────

const stores = new Map<string, StateStore>();

export function getStateStore(runId: string): StateStore {
  let store = stores.get(runId);
  if (!store) {
    store = new StateStore(runId);
    stores.set(runId, store);
  }
  return store;
}
