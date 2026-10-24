import type { AgentState, PlanState } from '../../persistence/agentTypes.js';
import type { Page, PageRequest, StorageContext, Versioned } from './common.js';

export interface AgentRunRecord extends Versioned<AgentState> {
  tenantId: string;
}

export interface AgentRepository {
  create(ctx: StorageContext, state: AgentState): Promise<AgentRunRecord>;
  findById(ctx: StorageContext, agentRunId: string): Promise<AgentRunRecord | null>;
  listByRun(ctx: StorageContext, runId: string, page?: PageRequest): Promise<Page<AgentRunRecord>>;
  save(ctx: StorageContext, state: AgentState, expectedVersion: number): Promise<AgentRunRecord>;
  savePlan(ctx: StorageContext, agentRunId: string, plan: PlanState, expectedVersion: number): Promise<AgentRunRecord>;
}
