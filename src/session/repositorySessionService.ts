import { nanoid } from 'nanoid';
import type { ExecutionState } from '../persistence/executionTypes.js';
import type { AgentRepository } from '../storage/contracts/agentRepository.js';
import type { StorageContext } from '../storage/contracts/common.js';
import type { EventRepository } from '../storage/contracts/eventRepository.js';
import type { RunRepository } from '../storage/contracts/runRepository.js';
import type { UnitOfWork } from '../storage/contracts/unitOfWork.js';
import { retryOnConflict } from '../storage/conflictRetry.js';
import type { SessionSummary } from './SessionManager.js';
import { normalizeStageId } from '../workflows/definitions/pipelineDefinition.js';
import { cancelSessionBranch, resetSessionBranchFromNode, syncSessionWorkflowJoinFromBranches } from '../workflows/sessionInstance.js';

/** Async repository-backed session operations. Composition supplies workflow state. */
export class RepositorySessionService {
  constructor(private readonly dependencies: {
    runs: RunRepository;
    agents: AgentRepository;
    events: EventRepository;
    unitOfWork?: UnitOfWork;
    context: StorageContext;
    createState: (args: { runId: string; name: string; description?: string }) => ExecutionState;
  }) {}

  async create(name: string, description?: string): Promise<ExecutionState> {
    const runId = nanoid(10);
    const state = this.dependencies.createState({ runId, name: name || `Run ${runId.slice(0, 6)}`, description });
    await this.transaction(async repositories => {
      await repositories.runs.create(this.dependencies.context, state);
      await repositories.events.append(this.dependencies.context, {
        id: nanoid(), type: 'pipeline_created', runId, timestamp: Date.now(), data: { name: state.name, runId },
      });
    });
    return state;
  }

  private async transaction<T>(work: (repositories: Pick<StorageRepositoriesForSession, 'runs' | 'events'>) => Promise<T>): Promise<T> {
    if (!this.dependencies.unitOfWork) return work(this.dependencies);
    return this.dependencies.unitOfWork.transaction(this.dependencies.context, repositories => work(repositories));
  }

  async list(): Promise<SessionSummary[]> {
    const records = await allPages(cursor => this.dependencies.runs.list(this.dependencies.context, { cursor, limit: 250 }));
    return records.map(record => summary(record.value)).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(runId: string): Promise<{ state: ExecutionState | null; events: unknown[]; agents: unknown[] }> {
    const record = await this.dependencies.runs.findById(this.dependencies.context, runId);
    if (!record) return { state: null, events: [], agents: [] };
    const [events, agents] = await Promise.all([
      allPages(cursor => this.dependencies.events.listByRun(this.dependencies.context, runId, { cursor, limit: 500 })),
      allPages(cursor => this.dependencies.agents.listByRun(this.dependencies.context, runId, { cursor, limit: 500 })),
    ]);
    return { state: record.value, events, agents: agents.map(agent => agent.value) };
  }

  async rename(runId: string, name: string): Promise<boolean> {
    return retryOnConflict(async () => {
      return this.transaction(async repositories => {
        const record = await repositories.runs.findById(this.dependencies.context, runId);
        if (!record) return false;
        await repositories.runs.save(this.dependencies.context, { ...record.value, name }, record.version);
        return true;
      });
    });
  }

  /** Applies a small session patch through the same versioned Run authority. */
  async update(runId: string, updater: (state: ExecutionState) => void): Promise<ExecutionState | null> {
    return retryOnConflict(async () => {
      const record = await this.dependencies.runs.findById(this.dependencies.context, runId);
      if (!record) return null;
      const state = cloneState(record.value);
      updater(state);
      const saved = await this.dependencies.runs.save(this.dependencies.context, state, record.version);
      return saved.value;
    });
  }

  async resume(runId: string): Promise<ExecutionState | null> {
    return this.transition(runId, ['suspended', 'idle'], 'running', 'pipeline_resumed');
  }

  async suspend(runId: string): Promise<boolean> {
    const value = await this.transition(runId, ['running', 'waiting_confirmation'], 'suspended', 'session_suspended');
    return Boolean(value);
  }

  async cancel(runId: string): Promise<boolean> {
    return retryOnConflict(async () => {
      return this.transaction(async repositories => {
        const record = await repositories.runs.findById(this.dependencies.context, runId);
        if (!record || record.value.status === 'completed' || record.value.status === 'cancelled') return false;
        const state = cloneState(record.value);
        state.status = 'cancelled';
        state.completedAt = Date.now();
        cancelActiveBranches(state);
        await repositories.runs.save(this.dependencies.context, state, record.version);
        await this.appendTo(repositories.events, runId, 'pipeline_cancelled');
        return true;
      });
    });
  }

  async delete(runId: string): Promise<boolean> {
    return retryOnConflict(async () => {
      return this.transaction(async repositories => {
        const record = await repositories.runs.findById(this.dependencies.context, runId);
        if (!record) return false;
        return repositories.runs.softDelete(this.dependencies.context, runId, record.version);
      });
    });
  }

  async rerunBranch(runId: string, branchId: string, fromNodeId?: string): Promise<ExecutionState | null> {
    return retryOnConflict(async () => {
      return this.transaction(async repositories => {
        const record = await repositories.runs.findById(this.dependencies.context, runId);
        if (!record) return null;
        const state = cloneState(record.value);
        const instance = state.workflowInstance;
        const branch = instance?.branches.find(item => item.branchId === branchId);
        if (!instance || !branch) return null;
        const explicitRerun = Boolean(fromNodeId?.trim());
        if (!explicitRerun && !['failed', 'waiting_fix', 'cancelled'].includes(branch.status)) return state;
        const nodeId = normalizeStageId(fromNodeId || branch.currentNodeId || 'implementation-plan');
        resetSessionBranchFromNode(branch, nodeId);
        const project = state.projects?.find(item => item.name === branch.projectName);
        if (project) { project.status = 'pending'; project.currentNodeId = nodeId; }
        syncSessionWorkflowJoinFromBranches(instance);
        instance.updatedAt = new Date().toISOString();
        if (state.status === 'cancelled') state.status = 'idle';
        await repositories.runs.save(this.dependencies.context, state, record.version);
        await this.appendTo(repositories.events, runId, 'branch_rerun_scheduled', { branchId, projectName: branch.projectName, fromNodeId: nodeId });
        return state;
      });
    });
  }

  async cancelBranch(runId: string, branchId: string): Promise<ExecutionState | null> {
    return retryOnConflict(async () => {
      return this.transaction(async repositories => {
        const record = await repositories.runs.findById(this.dependencies.context, runId);
        if (!record) return null;
        const state = cloneState(record.value);
        const instance = state.workflowInstance;
        const branch = instance?.branches.find(item => item.branchId === branchId);
        if (!instance || !branch) return null;
        if (!['pending', 'running', 'waiting_confirmation', 'suspended'].includes(branch.status)) return state;
        cancelSessionBranch(branch);
        const project = state.projects?.find(item => item.name === branch.projectName);
        if (project) { project.status = 'interrupted'; project.currentNodeId = branch.currentNodeId; }
        syncSessionWorkflowJoinFromBranches(instance);
        instance.updatedAt = new Date().toISOString();
        await repositories.runs.save(this.dependencies.context, state, record.version);
        await this.appendTo(repositories.events, runId, 'branch_cancelled', { branchId, projectName: branch.projectName, currentNodeId: branch.currentNodeId });
        return state;
      });
    });
  }

  private async transition(runId: string, allowed: ExecutionState['status'][], status: ExecutionState['status'], eventType: 'pipeline_resumed' | 'session_suspended'): Promise<ExecutionState | null> {
    return retryOnConflict(async () => {
      return this.transaction(async repositories => {
        const record = await repositories.runs.findById(this.dependencies.context, runId);
        if (!record) return null;
        if (!allowed.includes(record.value.status)) return record.value;
        const state = { ...record.value, status };
        await repositories.runs.save(this.dependencies.context, state, record.version);
        await this.appendTo(repositories.events, runId, eventType);
        return state;
      });
    });
  }

  private async appendTo(
    events: EventRepository,
    runId: string,
    type: 'pipeline_resumed' | 'session_suspended' | 'pipeline_cancelled' | 'branch_rerun_scheduled' | 'branch_cancelled',
    data?: Record<string, unknown>,
  ): Promise<void> {
    await events.append(this.dependencies.context, { id: nanoid(), type, runId, timestamp: Date.now(), data });
  }
}

type StorageRepositoriesForSession = { runs: RunRepository; events: EventRepository };

function cloneState(state: ExecutionState): ExecutionState {
  return structuredClone(state);
}

function cancelActiveBranches(state: ExecutionState): void {
  const instance = state.workflowInstance;
  if (!instance) return;
  for (const branch of instance.branches) {
    if (['pending', 'running', 'waiting_confirmation', 'suspended'].includes(branch.status)) cancelSessionBranch(branch);
  }
  syncSessionWorkflowJoinFromBranches(instance);
  instance.updatedAt = new Date().toISOString();
}

function summary(state: ExecutionState): SessionSummary {
  const completed = state.nodes.filter(node => node.status === 'completed').length;
  const currentNode = state.currentNodeIndex >= 0 ? state.nodes[state.currentNodeIndex] : undefined;
  return {
    runId: state.runId, name: state.name, status: state.status,
    currentNodeId: currentNode?.id, currentNodeName: currentNode?.name,
    progress: state.nodes.length ? completed / state.nodes.length : 0,
    startedAt: state.startedAt, updatedAt: state.updatedAt, completedAt: state.completedAt,
    workflowInstance: state.workflowInstance ? {
      id: state.workflowInstance.id, layout: state.workflowInstance.layout, version: state.workflowInstance.version,
      legacyFallback: state.workflowInstance.legacyFallback, branchCount: state.workflowInstance.branches.length,
    } : undefined,
  };
}

async function allPages<T>(read: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>): Promise<T[]> {
  const result: T[] = [];
  let cursor: string | undefined;
  do { const page = await read(cursor); result.push(...page.items); cursor = page.nextCursor; } while (cursor);
  return result;
}
