import type { ExecutionState, NodeState, ProjectState } from '../../persistence/executionTypes.js';
import type { RunListQuery, RunRecord, RunRepository } from '../contracts/runRepository.js';
import type { Page, StorageContext } from '../contracts/common.js';
import { ConcurrentModificationError } from '../contracts/common.js';
import type { SqlExecutor } from './database.js';

interface RunRow {
  payload: ExecutionState;
  version: string | number;
  deleted_at: Date | null;
}

export class PostgresRunRepository implements RunRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async create(ctx: StorageContext, state: ExecutionState): Promise<RunRecord> {
    const now = ctx.preserveTimestamps ? state.updatedAt : Date.now();
    if (!ctx.preserveTimestamps) state.updatedAt = now;
    const result = await this.sql.query<RunRow>(`
      INSERT INTO runs (
        tenant_id, run_id, requirement_id, name, description, status, current_node_id, current_node_index,
        permission_mode, model_overrides, workflow_instance, metadata, payload, version, started_at, updated_at, completed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1,to_timestamp($14 / 1000.0),to_timestamp($15 / 1000.0),to_timestamp($16 / 1000.0))
      RETURNING payload, version, deleted_at
    `, [
      ctx.tenantId, state.runId, requirementId(state), state.name, state.description ?? null, state.status,
      state.currentNodeId ?? null, state.currentNodeIndex, state.permissionMode, json(state.modelOverrides),
      json(state.workflowInstance ?? null), json(state.metadata ?? {}), json(state), state.startedAt, now,
      state.completedAt ?? null,
    ]);
    await this.syncChildren(ctx, state);
    return rowToRecord(ctx, state.runId, result.rows[0]);
  }

  async findById(ctx: StorageContext, runId: string): Promise<RunRecord | null> {
    const result = await this.sql.query<RunRow>(`
      SELECT payload, version, deleted_at FROM runs
      WHERE tenant_id = $1 AND run_id = $2 AND deleted_at IS NULL
    `, [ctx.tenantId, runId]);
    return result.rows[0] ? rowToRecord(ctx, runId, result.rows[0]) : null;
  }

  async list(ctx: StorageContext, query: RunListQuery = {}): Promise<Page<RunRecord>> {
    const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;
    const values: unknown[] = [ctx.tenantId];
    const clauses = ['tenant_id = $1'];
    if (!query.includeDeleted) clauses.push('deleted_at IS NULL');
    if (query.statuses?.length) {
      values.push(query.statuses);
      clauses.push(`status = ANY($${values.length}::text[])`);
    }
    values.push(limit, offset);
    const result = await this.sql.query<RunRow & { run_id: string; total_count: string | number }>(`
      SELECT payload, version, deleted_at, run_id, count(*) OVER() AS total_count
      FROM runs WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at DESC, run_id DESC
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `, values);
    const total = Number(result.rows[0]?.total_count ?? 0);
    const items = result.rows.map(row => rowToRecord(ctx, row.run_id, row));
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < total ? String(nextOffset) : undefined };
  }

  async save(ctx: StorageContext, state: ExecutionState, expectedVersion: number): Promise<RunRecord> {
    const now = ctx.preserveTimestamps ? state.updatedAt : Date.now();
    if (!ctx.preserveTimestamps) state.updatedAt = now;
    const result = await this.sql.query<RunRow>(`
      UPDATE runs SET
        requirement_id = $3, name = $4, description = $5, status = $6, current_node_id = $7,
        current_node_index = $8, permission_mode = $9, model_overrides = $10, workflow_instance = $11,
        metadata = $12, payload = $13, completed_at = to_timestamp($14 / 1000.0),
        updated_at = to_timestamp($15 / 1000.0), version = version + 1
      WHERE tenant_id = $1 AND run_id = $2 AND version = $16 AND deleted_at IS NULL
      RETURNING payload, version, deleted_at
    `, [
      ctx.tenantId, state.runId, requirementId(state), state.name, state.description ?? null, state.status,
      state.currentNodeId ?? null, state.currentNodeIndex, state.permissionMode, json(state.modelOverrides),
      json(state.workflowInstance ?? null), json(state.metadata ?? {}), json(state), state.completedAt ?? null,
      now, expectedVersion,
    ]);
    if (!result.rows[0]) throw new ConcurrentModificationError('run', state.runId);
    await this.syncChildren(ctx, state);
    return rowToRecord(ctx, state.runId, result.rows[0]);
  }

  async softDelete(ctx: StorageContext, runId: string, expectedVersion: number): Promise<boolean> {
    const result = await this.sql.query(`
      UPDATE runs SET deleted_at = now(), updated_at = now(), version = version + 1
      WHERE tenant_id = $1 AND run_id = $2 AND version = $3 AND deleted_at IS NULL
    `, [ctx.tenantId, runId, expectedVersion]);
    if (result.rowCount === 0) {
      const exists = await this.sql.query('SELECT 1 FROM runs WHERE tenant_id = $1 AND run_id = $2', [ctx.tenantId, runId]);
      if (exists.rowCount) throw new ConcurrentModificationError('run', runId);
      return false;
    }
    return true;
  }

  private async syncChildren(ctx: StorageContext, state: ExecutionState): Promise<void> {
    const nodeIds = state.nodes.map(node => node.id);
    if (nodeIds.length) {
      await this.sql.query('DELETE FROM run_nodes WHERE tenant_id = $1 AND run_id = $2 AND NOT (node_id = ANY($3::text[]))', [ctx.tenantId, state.runId, nodeIds]);
    } else {
      await this.sql.query('DELETE FROM run_nodes WHERE tenant_id = $1 AND run_id = $2', [ctx.tenantId, state.runId]);
    }
    for (const node of state.nodes) await this.upsertNode(ctx, state.runId, node);

    const projects = state.projects ?? [];
    const projectNames = projects.map(project => project.name);
    if (projectNames.length) {
      await this.sql.query('DELETE FROM run_projects WHERE tenant_id = $1 AND run_id = $2 AND NOT (project_name = ANY($3::text[]))', [ctx.tenantId, state.runId, projectNames]);
    } else {
      await this.sql.query('DELETE FROM run_projects WHERE tenant_id = $1 AND run_id = $2', [ctx.tenantId, state.runId]);
    }
    for (const project of projects) await this.upsertProject(ctx, state.runId, project);
  }

  private async upsertNode(ctx: StorageContext, runId: string, node: NodeState): Promise<void> {
    await this.sql.query(`
      INSERT INTO run_nodes (tenant_id, run_id, node_id, status, payload, version, updated_at)
      VALUES ($1,$2,$3,$4,$5,1,now())
      ON CONFLICT (tenant_id, run_id, node_id) DO UPDATE SET
        status = EXCLUDED.status, payload = EXCLUDED.payload, version = run_nodes.version + 1, updated_at = now()
    `, [ctx.tenantId, runId, node.id, node.status, json(node)]);
  }

  private async upsertProject(ctx: StorageContext, runId: string, project: ProjectState): Promise<void> {
    await this.sql.query(`
      INSERT INTO run_projects (tenant_id, run_id, project_name, status, branch_id, current_node_id, payload, version, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,1,now())
      ON CONFLICT (tenant_id, run_id, project_name) DO UPDATE SET
        status = EXCLUDED.status, branch_id = EXCLUDED.branch_id, current_node_id = EXCLUDED.current_node_id,
        payload = EXCLUDED.payload, version = run_projects.version + 1, updated_at = now()
    `, [ctx.tenantId, runId, project.name, project.status, project.branchId ?? null, project.currentNodeId ?? null, json(project)]);
  }
}

function rowToRecord(ctx: StorageContext, runId: string, row: RunRow): RunRecord {
  return {
    runId,
    tenantId: ctx.tenantId,
    value: row.payload,
    version: Number(row.version),
    deletedAt: row.deleted_at ? row.deleted_at.getTime() : undefined,
  };
}

function requirementId(state: ExecutionState): string | null {
  const value = state.metadata?.requirementId;
  return typeof value === 'string' ? value : null;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}
