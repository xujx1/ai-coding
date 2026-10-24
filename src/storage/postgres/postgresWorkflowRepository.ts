import type { WorkflowDefinition } from '../../workflows/types.js';
import type { WorkflowRecord, WorkflowRepository } from '../contracts/workflowRepository.js';
import type { Page, PageRequest, StorageContext } from '../contracts/common.js';
import { ConcurrentModificationError } from '../contracts/common.js';
import type { SqlExecutor } from './database.js';

interface WorkflowRow { payload: WorkflowDefinition; version: string | number; }

export class PostgresWorkflowRepository implements WorkflowRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async findById(ctx: StorageContext, workflowId: string): Promise<WorkflowRecord | null> {
    const result = await this.sql.query<WorkflowRow>('SELECT payload, version FROM workflow_definitions WHERE tenant_id = $1 AND workflow_id = $2', [ctx.tenantId, workflowId]);
    return result.rows[0] ? record(ctx, result.rows[0]) : null;
  }

  async list(ctx: StorageContext, page: PageRequest = {}): Promise<Page<WorkflowRecord>> {
    const limit = Math.max(1, Math.min(page.limit ?? 100, 500));
    const offset = Number.parseInt(page.cursor ?? '0', 10) || 0;
    const result = await this.sql.query<WorkflowRow & { total_count: string | number }>(`
      SELECT payload, version, count(*) OVER() AS total_count
      FROM workflow_definitions WHERE tenant_id = $1
      ORDER BY updated_at DESC, workflow_id ASC LIMIT $2 OFFSET $3
    `, [ctx.tenantId, limit, offset]);
    const items = result.rows.map(row => record(ctx, row));
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < Number(result.rows[0]?.total_count ?? 0) ? String(nextOffset) : undefined };
  }

  async save(ctx: StorageContext, workflow: WorkflowDefinition, expectedVersion?: number): Promise<WorkflowRecord> {
    if (expectedVersion === undefined) {
      const result = await this.sql.query<WorkflowRow>(`
        INSERT INTO workflow_definitions (tenant_id, workflow_id, payload, version, created_at, updated_at)
        VALUES ($1,$2,$3,1,to_timestamp($4 / 1000.0),to_timestamp($5 / 1000.0))
        ON CONFLICT (tenant_id, workflow_id) DO NOTHING
        RETURNING payload, version
      `, [ctx.tenantId, workflow.id, JSON.stringify(workflow), date(workflow.createdAt), date(workflow.updatedAt)]);
      if (result.rows[0]) return record(ctx, result.rows[0]);
      const current = await this.findById(ctx, workflow.id);
      if (!current) throw new Error(`Workflow '${workflow.id}' could not be created.`);
      return current;
    }
    const result = await this.sql.query<WorkflowRow>(`
      UPDATE workflow_definitions SET payload = $3, updated_at = to_timestamp($4 / 1000.0), version = version + 1
      WHERE tenant_id = $1 AND workflow_id = $2 AND version = $5
      RETURNING payload, version
    `, [ctx.tenantId, workflow.id, JSON.stringify(workflow), date(workflow.updatedAt), expectedVersion]);
    if (!result.rows[0]) throw new ConcurrentModificationError('workflow', workflow.id);
    return record(ctx, result.rows[0]);
  }
}

function record(ctx: StorageContext, row: WorkflowRow): WorkflowRecord {
  return { tenantId: ctx.tenantId, value: row.payload, version: Number(row.version) };
}

function date(value: string): number { return Date.parse(value) || Date.now(); }
