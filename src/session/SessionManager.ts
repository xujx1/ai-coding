/**
 * Session/Run management - P0 feature.
 * Supports: listSessions, getSession, resumeSession, suspendSession,
 * cancelSession, renameSession, transcript replay, state recovery after restart.
 */
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { getConfig } from '../config/index.js';
import { ensureRunDirectories, listRuns, runExists, getRunPaths } from '../runtime/paths.js';
import {
  StateStore, ExecutionState, PipelineStatus,
  getStateStore, NodeState
} from '../persistence/stateStore.js';
import { getEventLog, closeEventLog } from '../events/EventLog.js';
import { closePermissionManager, getPermissionManager } from '../tools/security/permissions.js';
import { PIPELINE_NODES, normalizeStageId } from '../pipeline/definition.js';
import { getCustomStageOverrides } from '../models/registry.js';

export interface SessionSummary {
  runId: string;
  name: string;
  status: PipelineStatus;
  currentNodeId?: string;
  currentNodeName?: string;
  progress: number; // 0-1
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export class SessionManager {
  /**
   * Create a new run/session.
   */
  createRun(name: string, description?: string): ExecutionState {
    const runId = nanoid(10);
    const paths = ensureRunDirectories(runId);
    const store = getStateStore(runId);

    // Initialize nodes from pipeline definition
    const nodes: NodeState[] = PIPELINE_NODES.map(n => ({
      id: n.id,
      name: n.name,
      status: 'pending' as const,
      failureCount: 0,
    }));

    const state: ExecutionState = {
      runId,
      name: name || `Run ${runId.slice(0, 6)}`,
      description,
      status: 'idle',
      currentNodeIndex: -1,
      nodes,
      permissionMode: 'default',
      modelOverrides: getCustomStageOverrides(),
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    store.saveExecutionState(state);
    const eventLog = getEventLog(runId);
    eventLog.logEvent('pipeline_created', { name, runId });

    return state;
  }

  /**
   * List all sessions (runs).
   */
  listSessions(): SessionSummary[] {
    const runIds = listRuns();
    const sessions: SessionSummary[] = [];

    for (const runId of runIds) {
      const store = getStateStore(runId);
      const state = store.loadExecutionState();
      if (!state) {
        continue;
      }

      const completed = state.nodes.filter(n => n.status === 'completed').length;
      const progress = state.nodes.length > 0 ? completed / state.nodes.length : 0;
      const currentNode = state.currentNodeIndex >= 0 ? state.nodes[state.currentNodeIndex] : undefined;

      sessions.push({
        runId: state.runId,
        name: state.name,
        status: state.status,
        currentNodeId: currentNode?.id,
        currentNodeName: currentNode?.name,
        progress,
        startedAt: state.startedAt,
        updatedAt: state.updatedAt,
        completedAt: state.completedAt,
      });
    }

    return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * Get session details including events and state.
   */
  getSession(runId: string): {
    state: ExecutionState | null;
    events: unknown[];
    agents: unknown[];
  } {
    if (!runExists(runId)) {
      return { state: null, events: [], agents: [] };
    }
    const store = getStateStore(runId);
    const state = store.loadExecutionState();

    if (state) {
      let changed = this.reconcilePipelineNodes(state);
      const customOverrides = getCustomStageOverrides();
      if ((!state.modelOverrides || Object.keys(state.modelOverrides).length === 0) && Object.keys(customOverrides).length > 0) {
        state.modelOverrides = customOverrides;
        changed = true;
      }
      if (changed) store.saveExecutionState(state);
    }

    const eventLog = getEventLog(runId);
    eventLog.loadFromDisk();

    return {
      state,
      events: eventLog.getAllEvents(),
      agents: store.listAgentStates(),
    };
  }

  /**
   * Resume a suspended session.
   */
  resumeSession(runId: string): ExecutionState | null {
    const store = getStateStore(runId);
    const state = store.loadExecutionState();
    if (!state) return null;
    if (state.status !== 'suspended' && state.status !== 'idle') return state;

    state.status = 'running';
    store.saveExecutionState(state);

    const eventLog = getEventLog(runId);
    eventLog.logEvent('pipeline_resumed', { runId });

    return state;
  }

  /**
   * Suspend/pause a running session.
   */
  suspendSession(runId: string): boolean {
    const store = getStateStore(runId);
    const state = store.loadExecutionState();
    if (!state) return false;
    if (state.status !== 'running' && state.status !== 'waiting_confirmation') return false;

    state.status = 'suspended';
    store.saveExecutionState(state);

    const eventLog = getEventLog(runId);
    eventLog.logEvent('session_suspended', { runId });

    return true;
  }

  /**
   * Cancel a session.
   */
  cancelSession(runId: string): boolean {
    const store = getStateStore(runId);
    const state = store.loadExecutionState();
    if (!state) return false;
    if (state.status === 'completed' || state.status === 'cancelled') return false;

    state.status = 'cancelled';
    state.completedAt = Date.now();
    store.saveExecutionState(state);

    const eventLog = getEventLog(runId);
    eventLog.logEvent('pipeline_cancelled', { runId });
    eventLog.close();

    return true;
  }

  /**
   * Rename a session.
   */
  renameSession(runId: string, newName: string): boolean {
    const store = getStateStore(runId);
    const state = store.loadExecutionState();
    if (!state) return false;
    state.name = newName;
    store.saveExecutionState(state);
    return true;
  }

  /**
   * Get transcript for replay (all events).
   */
  getTranscript(runId: string): unknown[] {
    const store = getStateStore(runId);
    return store.loadTranscript();
  }

  /**
   * Clean up resources for a run.
   */
  cleanupRun(runId: string): void {
    closeEventLog(runId);
    closePermissionManager(runId);
  }

  deleteSession(runId: string): boolean {
    if (!runExists(runId)) return false;
    this.cleanupRun(runId);

    const paths = getRunPaths(runId);
    const runsRoot = path.resolve(getConfig().runtimeDir, 'runs');
    const runDir = path.resolve(paths.runDir);
    if (!runDir.startsWith(runsRoot + path.sep)) {
      throw new Error(`Unsafe run directory: ${runDir}`);
    }

    fs.rmSync(runDir, { recursive: true, force: true });
    return true;
  }

  /**
   * On startup, fix all running sessions (process restart recovery).
   */
  recoverOnStartup(): void {
    const runs = listRuns();
    for (const runId of runs) {
      const store = getStateStore(runId);
      const state = store.loadExecutionState();
      if (state && state.status === 'running') {
        state.status = 'suspended';
        store.saveExecutionState(state);
      }
    }
  }

  private reconcilePipelineNodes(state: ExecutionState): boolean {
    const existing = new Map<string, NodeState>();
    for (const node of state.nodes) {
      existing.set(node.id, node);
      existing.set(normalizeStageId(node.id), node);
    }
    let changed = false;
    const nextNodes: NodeState[] = PIPELINE_NODES.map((definition) => {
      const current = existing.get(definition.id);
      if (current) {
        if (current.name !== definition.name) {
          changed = true;
          return { ...current, name: definition.name };
        }
        return current;
      }
      changed = true;
      return {
        id: definition.id,
        name: definition.name,
        status: 'pending' as const,
        failureCount: 0,
      };
    });

    if (changed || nextNodes.length !== state.nodes.length) {
      const currentNodeId = normalizeStageId(state.currentNodeId || state.nodes[state.currentNodeIndex]?.id || '');
      state.nodes = nextNodes;
      if (currentNodeId) {
        const nextIndex = nextNodes.findIndex(node => node.id === currentNodeId);
        state.currentNodeIndex = nextIndex >= 0 ? nextIndex : state.currentNodeIndex;
      }
      return true;
    }
    return false;
  }
}

// Singleton
let _sessionManager: SessionManager | null = null;
export function getSessionManager(): SessionManager {
  if (!_sessionManager) {
    _sessionManager = new SessionManager();
    _sessionManager.recoverOnStartup();
  }
  return _sessionManager;
}
