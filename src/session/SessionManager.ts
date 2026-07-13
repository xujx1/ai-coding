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
import type { ExecutionState, NodeState, PipelineStatus } from '../persistence/executionTypes.js';
import { StateStore, getStateStore } from '../persistence/stateStore.js';
import { getEventLog, closeEventLog } from '../events/EventLog.js';
import { closePermissionManager, getPermissionManager } from '../tools/security/permissions.js';
import { PIPELINE_NODES, normalizeStageId } from '../workflows/definitions/pipelineDefinition.js';
import { getCustomStageOverrides } from '../models/registry.js';
import { BUILTIN_MRD_TO_CODE_WORKFLOW_ID } from '../workflows/builtinDefinitions.js';
import { captureWorkflowSnapshot } from '../workflows/storage.js';
import {
  cancelSessionBranch,
  createBranchRef,
  createInitialSessionWorkflowInstance,
  createStableSessionBranchId,
  resetSessionBranchFromNode,
  syncSessionWorkflowJoinFromBranches,
} from '../workflows/sessionInstance.js';
import type {
  SessionWorkflowBranchRef,
  SessionWorkflowRuntimeStatus,
} from '../workflows/sessionInstance.js';
import type { FanoutDecision } from '../workflows/fanoutDecision.js';

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
  workflowInstance?: {
    id: string;
    layout: string;
    version: number;
    legacyFallback: boolean;
    branchCount: number;
  };
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

    const workflowSnapshot = captureWorkflowSnapshot(BUILTIN_MRD_TO_CODE_WORKFLOW_ID);
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
      metadata: {
        workflowSnapshot,
      },
      workflowInstance: createInitialSessionWorkflowInstance({
        runId,
        templateSnapshot: workflowSnapshot,
      }),
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
      const workflowInstance = state.workflowInstance;

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
        workflowInstance: workflowInstance ? {
          id: workflowInstance.id,
          layout: workflowInstance.layout,
          version: workflowInstance.version,
          legacyFallback: workflowInstance.legacyFallback,
          branchCount: workflowInstance.branches.length,
        } : undefined,
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
      if (this.reconcileWorkflowInstance(state)) {
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
    this.cancelActiveBranches(state);
    store.saveExecutionState(state);

    const eventLog = getEventLog(runId);
    eventLog.logEvent('pipeline_cancelled', { runId });
    eventLog.close();

    return true;
  }

  rerunBranch(runId: string, branchId: string, fromNodeId?: string): ExecutionState | null {
    const store = getStateStore(runId);
    const state = store.loadExecutionState();
    const instance = state?.workflowInstance;
    const branch = instance?.branches.find(item => item.branchId === branchId);
    if (!state || !instance || !branch) return null;
    const explicitRerun = typeof fromNodeId === 'string' && fromNodeId.trim().length > 0;
    if (!explicitRerun && !['failed', 'waiting_fix', 'cancelled'].includes(branch.status)) return state;

    const requestedNodeId = normalizeStageId(fromNodeId || branch.currentNodeId || 'implementation-plan');
    resetSessionBranchFromNode(branch, requestedNodeId);
    const project = state.projects?.find(item => item.name === branch.projectName);
    if (project) {
      project.status = 'pending';
      project.currentNodeId = requestedNodeId;
    }
    const previousJoin = JSON.stringify(instance.joins[0] ?? null);
    syncSessionWorkflowJoinFromBranches(instance);
    instance.updatedAt = new Date().toISOString();
    state.status = state.status === 'cancelled' ? 'idle' : state.status;
    store.saveExecutionState(state);

    getEventLog(runId).logEvent('branch_rerun_scheduled', {
      runId,
      branchId,
      projectName: branch.projectName,
      fromNodeId: requestedNodeId,
      planRevisionId: instance.executionPlan?.currentRevisionId,
    }, undefined, requestedNodeId);
    if (previousJoin !== JSON.stringify(instance.joins[0] ?? null)) {
      getEventLog(runId).logEvent('join_state_updated', { join: instance.joins[0] }, undefined, 'app-join');
    }
    return state;
  }

  cancelBranch(runId: string, branchId: string): ExecutionState | null {
    const store = getStateStore(runId);
    const state = store.loadExecutionState();
    const instance = state?.workflowInstance;
    const branch = instance?.branches.find(item => item.branchId === branchId);
    if (!state || !instance || !branch) return null;
    if (!['pending', 'running', 'waiting_confirmation', 'suspended'].includes(branch.status)) return state;

    cancelSessionBranch(branch);
    const project = state.projects?.find(item => item.name === branch.projectName);
    if (project) {
      project.status = 'interrupted';
      project.currentNodeId = branch.currentNodeId;
    }
    const previousJoin = JSON.stringify(instance.joins[0] ?? null);
    syncSessionWorkflowJoinFromBranches(instance);
    instance.updatedAt = new Date().toISOString();
    store.saveExecutionState(state);

    getEventLog(runId).logEvent('branch_cancelled', {
      runId,
      branchId,
      projectName: branch.projectName,
      currentNodeId: branch.currentNodeId,
      planRevisionId: instance.executionPlan?.currentRevisionId,
    }, undefined, branch.currentNodeId);
    if (previousJoin !== JSON.stringify(instance.joins[0] ?? null)) {
      getEventLog(runId).logEvent('join_state_updated', { join: instance.joins[0] }, undefined, 'app-join');
    }
    return state;
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

  private cancelActiveBranches(state: ExecutionState): void {
    const instance = state.workflowInstance;
    if (!instance?.branches?.length) return;
    for (const branch of instance.branches) {
      if (['pending', 'running', 'waiting_confirmation', 'suspended'].includes(branch.status)) {
        cancelSessionBranch(branch);
      }
    }
    syncSessionWorkflowJoinFromBranches(instance);
    instance.updatedAt = new Date().toISOString();
  }

  private reconcileWorkflowInstance(state: ExecutionState): boolean {
    if (state.workflowInstance) return false;
    if (!state.projects?.length) return false;

    const workflowSnapshot = isWorkflowSnapshot(state.metadata?.workflowSnapshot)
      ? state.metadata.workflowSnapshot
      : captureWorkflowSnapshot(BUILTIN_MRD_TO_CODE_WORKFLOW_ID);
    state.metadata = {
      ...(state.metadata ?? {}),
      workflowSnapshot,
    };

    const instance = createInitialSessionWorkflowInstance({
      runId: state.runId,
      templateSnapshot: workflowSnapshot,
      createdAt: new Date(state.startedAt || Date.now()).toISOString(),
    });
    const decision = createBackfilledFanoutDecision(state);
    const branchRefs = decision.includedProjects.map(project => createBranchRef({
      branchId: createStableSessionBranchId(state.runId, project.name),
      projectName: project.name,
      projectRoot: project.root,
    }));
    const branchIds = branchRefs.map(branch => branch.branchId);
    instance.branches = branchRefs;
    instance.joins = [{
      joinId: 'app-join',
      waitingForBranchIds: branchIds,
      completedBranchIds: [],
      failedBranchIds: [],
      cancelledBranchIds: [],
      status: branchIds.length ? 'waiting' : 'failed',
    }];
    instance.fanoutDecision = decision;
    instance.fanoutDecisionArtifact = findIndexedArtifact(state, 'mrd-render', 'fanout-decision.json');
    instance.updatedAt = new Date(state.updatedAt || Date.now()).toISOString();
    const fanoutNode = instance.nodes.find(node => node.id === 'project-fanout');
    if (fanoutNode) {
      fanoutNode.branchIds = branchIds;
      fanoutNode.status = branchIds.length ? 'completed' : 'failed';
      if (instance.fanoutDecisionArtifact) fanoutNode.artifactHints = [instance.fanoutDecisionArtifact];
    }
    for (const branch of instance.branches) {
      backfillBranchRuntimeState(branch, state);
    }
    syncSessionWorkflowJoinFromBranches(instance);
    state.workflowInstance = instance;
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

function createBackfilledFanoutDecision(state: ExecutionState): FanoutDecision {
  const projects = state.projects ?? [];
  return {
    schemaVersion: 1,
    candidates: projects.map(project => ({
      name: project.name,
      root: project.root,
    })),
    includedProjects: projects.map(project => ({
      name: project.name,
      root: project.root,
      reason: 'Backfilled from historical execution-state project list.',
    })),
    excludedProjects: [],
    unresolvedProjects: [],
    confidence: 'low',
    evidence: ['Backfilled from historical run state; original fanout decision artifact was not available.'],
    fallbackReason: 'Historical run did not contain a session workflow instance; included all recorded projects.',
    generatedAt: new Date(state.updatedAt || Date.now()).toISOString(),
  };
}

function backfillBranchRuntimeState(branch: SessionWorkflowBranchRef, state: ExecutionState): void {
  const project = state.projects?.find(item => item.name === branch.projectName);
  if (!project) return;
  branch.status = normalizeBranchStatus(project.status);
  branch.currentNodeId = branchNodeIdForStage(project.currentNodeId || inferCurrentProjectNode(state)) ?? project.currentNodeId;
  branch.retry = project.retry;
  branch.artifactIndex = branch.artifactIndex ?? {};

  for (const branchNode of branch.nodes ?? []) {
    const sourceNodeId = stageIdForBranchNode(branchNode.id);
    const sourceNode = sourceNodeId ? state.nodes.find(node => node.id === sourceNodeId) : undefined;
    branchNode.status = sourceNode ? normalizeBranchStatus(sourceNode.status) : inferBranchNodeStatus(branchNode.id, branch.status, branch.currentNodeId);
    branchNode.failureCount = sourceNode?.failureCount;
    branchNode.error = sourceNode?.error;
    branchNode.childAgentIds = sourceNode?.childAgentIds;
    const artifacts = sourceNodeId ? artifactsForProject(state.artifactIndex?.[sourceNodeId] ?? [], branch.projectName) : [];
    if (artifacts.length) {
      branchNode.outputArtifacts = artifacts;
      branch.artifactIndex[branchNode.id] = artifacts;
    }
  }
  if (branch.status === 'completed') {
    branch.currentNodeId = branch.nodes?.at(-1)?.id ?? branch.currentNodeId;
  }
}

function inferCurrentProjectNode(state: ExecutionState): string {
  return state.currentNodeId || state.nodes[state.currentNodeIndex]?.id || 'implementation-plan';
}

function normalizeBranchStatus(status: string | undefined): SessionWorkflowRuntimeStatus {
  if (status === 'waiting_confirmation') return 'waiting_confirmation';
  if (status === 'waiting_fix') return 'waiting_fix';
  if (status === 'failed') return 'failed';
  if (status === 'completed') return 'completed';
  if (status === 'suspended') return 'suspended';
  if (status === 'interrupted') return 'interrupted';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'running') return 'running';
  if (status === 'skipped') return 'skipped';
  return 'pending';
}

function inferBranchNodeStatus(
  branchNodeId: string,
  branchStatus: SessionWorkflowRuntimeStatus,
  currentNodeId?: string
): SessionWorkflowRuntimeStatus {
  if (branchStatus === 'completed') return 'completed';
  if (branchNodeId === currentNodeId) return branchStatus;
  return 'pending';
}

function branchNodeIdForStage(nodeId?: string): string | undefined {
  if (!nodeId) return undefined;
  if (nodeId === 'archive') return undefined;
  if (nodeId === 'e2e-verify' || nodeId === 'frontend-test') return nodeId;
  return ['implementation-plan', 'spec-generate', 'java-impl', 'testcode-generate', 'backend-test', 'frontend-impl'].includes(nodeId)
    ? nodeId
    : undefined;
}

function stageIdForBranchNode(branchNodeId: string): string | undefined {
  return ['implementation-plan', 'spec-generate', 'java-impl', 'testcode-generate', 'backend-test', 'frontend-impl', 'frontend-test', 'e2e-verify'].includes(branchNodeId)
    ? branchNodeId
    : undefined;
}

function artifactsForProject(artifacts: string[], projectName: string): string[] {
  const projectPrefix = `artifacts/${projectName}/`;
  return Array.from(new Set(artifacts
    .filter(Boolean)
    .map(artifact => artifact.replace(/\\/g, '/'))
    .map(artifact => artifact.startsWith('artifacts/') ? artifact : `artifacts/${artifact}`)
    .filter(artifact => artifact.startsWith(projectPrefix) || artifact === 'artifacts/prd.md')));
}

function findIndexedArtifact(state: ExecutionState, nodeId: string, fileName: string): string | undefined {
  return state.artifactIndex?.[nodeId]?.find(artifact => artifact.replace(/\\/g, '/').endsWith(fileName));
}

function isWorkflowSnapshot(value: unknown): value is Parameters<typeof createInitialSessionWorkflowInstance>[0]['templateSnapshot'] {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  return typeof snapshot.workflowId === 'string' &&
    typeof snapshot.workflowVersion === 'number' &&
    typeof snapshot.capturedAt === 'string';
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
