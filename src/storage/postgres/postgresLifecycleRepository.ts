import type { LifecycleState } from '../../lifecycle/types.js';
import type { LifecycleRecord, LifecycleRepository } from '../contracts/lifecycleRepository.js';
import type { StorageContext } from '../contracts/common.js';
import { ConcurrentModificationError } from '../contracts/common.js';
import type { SqlExecutor } from './database.js';

interface LifecycleRow { payload: LifecycleState; version: string | number; }

export class PostgresLifecycleRepository implements LifecycleRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async create(ctx: StorageContext, state: LifecycleState): Promise<LifecycleRecord> {
    if (!ctx.preserveTimestamps) state.updatedAt = Date.now();
    const result = await this.sql.query<LifecycleRow>(`
      INSERT INTO lifecycle_states (tenant_id, run_id, requirement_id, phase, status, payload, version, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,1,to_timestamp($7 / 1000.0),to_timestamp($8 / 1000.0))
      RETURNING payload, version
    `, [ctx.tenantId, state.runId, state.requirementId, state.phase, state.status, JSON.stringify(state), state.createdAt, state.updatedAt]);
    return record(ctx, result.rows[0]);
  }

  async findByRunId(ctx: StorageContext, runId: string): Promise<LifecycleRecord | null> {
    const result = await this.sql.query<LifecycleRow>('SELECT payload, version FROM lifecycle_states WHERE tenant_id = $1 AND run_id = $2', [ctx.tenantId, runId]);
    return result.rows[0] ? record(ctx, result.rows[0]) : null;
  }

  async save(ctx: StorageContext, state: LifecycleState, expectedVersion: number): Promise<LifecycleRecord> {
    if (!ctx.preserveTimestamps) state.updatedAt = Date.now();
    const result = await this.sql.query<LifecycleRow>(`
      UPDATE lifecycle_states SET requirement_id = $3, phase = $4, status = $5, payload = $6,
        updated_at = to_timestamp($7 / 1000.0), version = version + 1
      WHERE tenant_id = $1 AND run_id = $2 AND version = $8
      RETURNING payload, version
    `, [ctx.tenantId, state.runId, state.requirementId, state.phase, state.status, JSON.stringify(state), state.updatedAt, expectedVersion]);
    if (!result.rows[0]) throw new ConcurrentModificationError('lifecycle', state.runId);
    return record(ctx, result.rows[0]);
  }
}

function record(ctx: StorageContext, row: LifecycleRow): LifecycleRecord {
  return { tenantId: ctx.tenantId, value: row.payload, version: Number(row.version) };
}
