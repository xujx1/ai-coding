import type { AgentState, PlanState } from '../../persistence/agentTypes.js';
import type { AgentRepository, AgentRunRecord } from '../contracts/agentRepository.js';
import type { Page, PageRequest, StorageContext } from '../contracts/common.js';
import { ConcurrentModificationError } from '../contracts/common.js';
import type { SqlExecutor } from './database.js';

interface AgentRow {
  payload: AgentState;
  version: string | number;
}

export class PostgresAgentRepository implements AgentRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async create(ctx: StorageContext, state: AgentState): Promise<AgentRunRecord> {
    if (!ctx.preserveTimestamps) state.updatedAt = Date.now();
    const result = await this.sql.query<AgentRow>(`
      INSERT INTO agent_runs (
        tenant_id, agent_run_id, run_id, node_id, status, current_model_id, current_provider_id, plan,
        payload, version, started_at, updated_at, completed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,to_timestamp($10 / 1000.0),to_timestamp($11 / 1000.0),to_timestamp($12 / 1000.0))
      RETURNING payload, version
    `, [
      ctx.tenantId, state.agentRunId, state.runId, state.nodeId, state.status, state.currentModelId,
      state.currentProviderId, json(state.plan ?? null), json(state), state.startedAt, state.updatedAt, state.completedAt ?? null,
    ]);
    return record(ctx, result.rows[0]);
  }

  async findById(ctx: StorageContext, agentRunId: string): Promise<AgentRunRecord | null> {
    const result = await this.sql.query<AgentRow>('SELECT payload, version FROM agent_runs WHERE tenant_id = $1 AND agent_run_id = $2', [ctx.tenantId, agentRunId]);
    return result.rows[0] ? record(ctx, result.rows[0]) : null;
  }

  async listByRun(ctx: StorageContext, runId: string, page: PageRequest = {}): Promise<Page<AgentRunRecord>> {
    const limit = Math.max(1, Math.min(page.limit ?? 100, 500));
    const offset = Number.parseInt(page.cursor ?? '0', 10) || 0;
    const result = await this.sql.query<AgentRow & { total_count: string | number }>(`
      SELECT payload, version, count(*) OVER() AS total_count
      FROM agent_runs WHERE tenant_id = $1 AND run_id = $2
      ORDER BY started_at DESC, agent_run_id DESC LIMIT $3 OFFSET $4
    `, [ctx.tenantId, runId, limit, offset]);
    const items = result.rows.map(row => record(ctx, row));
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < Number(result.rows[0]?.total_count ?? 0) ? String(nextOffset) : undefined };
  }

  async save(ctx: StorageContext, state: AgentState, expectedVersion: number): Promise<AgentRunRecord> {
    if (!ctx.preserveTimestamps) state.updatedAt = Date.now();
    const result = await this.sql.query<AgentRow>(`
      UPDATE agent_runs SET node_id = $3, status = $4, current_model_id = $5, current_provider_id = $6,
        plan = $7, payload = $8, updated_at = to_timestamp($9 / 1000.0), completed_at = to_timestamp($10 / 1000.0),
        version = version + 1
      WHERE tenant_id = $1 AND agent_run_id = $2 AND version = $11
      RETURNING payload, version
    `, [ctx.tenantId, state.agentRunId, state.nodeId, state.status, state.currentModelId, state.currentProviderId,
      json(state.plan ?? null), json(state), state.updatedAt, state.completedAt ?? null, expectedVersion]);
    if (!result.rows[0]) throw new ConcurrentModificationError('agent', state.agentRunId);
    return record(ctx, result.rows[0]);
  }

  async savePlan(ctx: StorageContext, agentRunId: string, plan: PlanState, expectedVersion: number): Promise<AgentRunRecord> {
    const current = await this.findById(ctx, agentRunId);
    if (!current || current.version !== expectedVersion) throw new ConcurrentModificationError('agent', agentRunId);
    return this.save(ctx, { ...current.value, plan }, expectedVersion);
  }
}

function record(ctx: StorageContext, row: AgentRow): AgentRunRecord {
  return { tenantId: ctx.tenantId, value: row.payload, version: Number(row.version) };
}

function json(value: unknown): string { return JSON.stringify(value); }
