/**
 * State persistence for execution-state.json, agent state, and checkpoints.
 * All state is written to disk so it survives page refresh and process restart.
 */
import * as fs from 'fs';
import * as path from 'path';
import { ensureRunDirectories, type RunPaths } from '../runtime/paths.js';
import type { AgentState, PlanState } from './agentTypes.js';
import type { ExecutionState } from './executionTypes.js';

export type {
  AgentState,
  AgentStatus,
  ModelSwitchEntry,
  PlanState,
  PlanStep,
} from './agentTypes.js';
export type {
  ContextManifest,
  ExecutionState,
  NodeState,
  NodeStatus,
  PipelineStatus,
  ProjectState,
  RollbackState,
} from './executionTypes.js';
export type { SessionState } from './sessionTypes.js';

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
