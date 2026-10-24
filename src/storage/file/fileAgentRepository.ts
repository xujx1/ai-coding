import { StateStore } from '../../persistence/stateStore.js';
import { listRuns } from '../../runtime/paths.js';
import type { AgentState, PlanState } from '../../persistence/agentTypes.js';
import type { AgentRepository, AgentRunRecord } from '../contracts/agentRepository.js';
import type { Page, PageRequest, StorageContext } from '../contracts/common.js';
import { ConcurrentModificationError } from '../contracts/common.js';

export class FileAgentRepository implements AgentRepository {
  async create(ctx: StorageContext, state: AgentState): Promise<AgentRunRecord> {
    const store = new StateStore(state.runId);
    if (store.loadAgentState(state.agentRunId)) throw new Error(`Agent '${state.agentRunId}' already exists.`);
    store.saveAgentState(state);
    return record(ctx, state);
  }

  async findById(ctx: StorageContext, agentRunId: string): Promise<AgentRunRecord | null> {
    for (const runId of allRunIds()) {
      const state = new StateStore(runId).loadAgentState(agentRunId);
      if (state) return record(ctx, state);
    }
    return null;
  }

  async listByRun(ctx: StorageContext, runId: string, page: PageRequest = {}): Promise<Page<AgentRunRecord>> {
    const limit = Math.max(1, Math.min(page.limit ?? 100, 500));
    const offset = Number.parseInt(page.cursor ?? '0', 10) || 0;
    const records = new StateStore(runId).listAgentStates().map(state => record(ctx, state));
    const items = records.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < records.length ? String(nextOffset) : undefined };
  }

  async save(ctx: StorageContext, state: AgentState, expectedVersion: number): Promise<AgentRunRecord> {
    const store = new StateStore(state.runId);
    const current = store.loadAgentState(state.agentRunId);
    if (!current || current.updatedAt !== expectedVersion) {
      throw new ConcurrentModificationError('agent', state.agentRunId);
    }
    store.saveAgentState(state);
    return record(ctx, state);
  }

  async savePlan(ctx: StorageContext, agentRunId: string, plan: PlanState, expectedVersion: number): Promise<AgentRunRecord> {
    const current = await this.findById(ctx, agentRunId);
    if (!current || current.version !== expectedVersion) {
      throw new ConcurrentModificationError('agent', agentRunId);
    }
    const next = { ...current.value, plan };
    new StateStore(next.runId).savePlan(agentRunId, plan);
    return this.save(ctx, next, expectedVersion);
  }
}

function record(ctx: StorageContext, state: AgentState): AgentRunRecord {
  return { tenantId: ctx.tenantId, value: state, version: state.updatedAt };
}

function allRunIds(): string[] {
  return listRuns();
}
