import { nanoid } from 'nanoid';
import type { PipelineEvent } from '../../events/types.js';
import type { EventCursor, EventRepository, StoredRunEvent } from '../contracts/eventRepository.js';
import type { IdempotencyKey, Page, StorageContext } from '../contracts/common.js';
import { IdempotencyConflictError } from '../contracts/common.js';
import type { SqlExecutor } from './database.js';
import { logStorageEvent } from '../structuredLogging.js';

interface EventRow {
  event_id: string;
  run_id: string;
  sequence: string | number;
  event_type: PipelineEvent['type'];
  node_id: string | null;
  agent_run_id: string | null;
  payload: Record<string, unknown> | null;
  occurred_at: Date;
}

export class PostgresEventRepository implements EventRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async append(ctx: StorageContext, event: PipelineEvent, idempotency?: IdempotencyKey): Promise<StoredRunEvent> {
    if (idempotency) {
      const existing = await this.sql.query<{ payload_hash: string; result: StoredRunEvent }>(`
        SELECT payload_hash, result FROM idempotency_records
        WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3
      `, [ctx.tenantId, eventScope(event), idempotency.key]);
      if (existing.rows[0]) {
        if (existing.rows[0].payload_hash !== idempotency.payloadHash) {
          throw new IdempotencyConflictError(eventScope(event), idempotency.key);
        }
        const replayed = existing.rows[0].result;
        logStorageEvent('storage_event_replayed', { tenantId: ctx.tenantId, transactionId: ctx.transactionId, runId: replayed.runId, nodeId: replayed.nodeId, agentRunId: replayed.agentRunId, eventSequence: replayed.sequence });
        return replayed;
      }
    }
    const prior = await this.sql.query<EventRow>('SELECT * FROM run_events WHERE tenant_id = $1 AND event_id = $2', [ctx.tenantId, event.id]);
    if (prior.rows[0]) {
      const replayed = rowToEvent(ctx, prior.rows[0]);
      logStorageEvent('storage_event_replayed', { tenantId: ctx.tenantId, transactionId: ctx.transactionId, runId: replayed.runId, nodeId: replayed.nodeId, agentRunId: replayed.agentRunId, eventSequence: replayed.sequence });
      return replayed;
    }
    const sequence = await this.nextSequence(ctx, event.runId);
    const result = await this.sql.query<EventRow>(`
      INSERT INTO run_events (tenant_id, event_id, run_id, sequence, event_type, node_id, agent_run_id, payload, occurred_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9 / 1000.0))
      RETURNING *
    `, [ctx.tenantId, event.id || nanoid(), event.runId, sequence, event.type, event.nodeId ?? null, event.agentRunId ?? null, JSON.stringify(event.data ?? null), event.timestamp]);
    const stored = rowToEvent(ctx, result.rows[0]);
    await this.sql.query(`
      INSERT INTO outbox_events (tenant_id, run_id, event_id, payload)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (tenant_id, event_id) DO NOTHING
    `, [ctx.tenantId, event.runId, stored.id, JSON.stringify(stored)]);
    if (idempotency) {
      await this.sql.query(`
        INSERT INTO idempotency_records (tenant_id, scope, idempotency_key, payload_hash, result)
        VALUES ($1,$2,$3,$4,$5)
      `, [ctx.tenantId, eventScope(event), idempotency.key, idempotency.payloadHash, JSON.stringify(stored)]);
    }
    logStorageEvent('storage_event_appended', { tenantId: ctx.tenantId, transactionId: ctx.transactionId, runId: stored.runId, nodeId: stored.nodeId, agentRunId: stored.agentRunId, eventSequence: stored.sequence });
    return stored;
  }

  async listByRun(ctx: StorageContext, runId: string, cursor: EventCursor = {}): Promise<Page<StoredRunEvent>> {
    const after = cursor.afterSequence ?? 0;
    const limit = Math.max(1, Math.min(cursor.limit ?? 250, 1000));
    const rows = await this.sql.query<EventRow>(`
      SELECT * FROM run_events
      WHERE tenant_id = $1 AND run_id = $2 AND sequence > $3
      ORDER BY sequence ASC LIMIT $4
    `, [ctx.tenantId, runId, after, limit + 1]);
    const hasNext = rows.rows.length > limit;
    const items = rows.rows.slice(0, limit).map(row => rowToEvent(ctx, row));
    return { items, nextCursor: hasNext ? String(items.at(-1)?.sequence) : undefined };
  }

  private async nextSequence(ctx: StorageContext, runId: string): Promise<number> {
    const result = await this.sql.query<{ last_sequence: string | number }>(`
      INSERT INTO run_event_sequences (tenant_id, run_id, last_sequence)
      VALUES ($1,$2,1)
      ON CONFLICT (tenant_id, run_id) DO UPDATE SET last_sequence = run_event_sequences.last_sequence + 1
      RETURNING last_sequence
    `, [ctx.tenantId, runId]);
    return Number(result.rows[0].last_sequence);
  }
}

function eventScope(event: PipelineEvent): string { return `event:${event.runId}`; }

function rowToEvent(ctx: StorageContext, row: EventRow): StoredRunEvent {
  return {
    id: row.event_id,
    type: row.event_type,
    runId: row.run_id,
    sequence: Number(row.sequence),
    tenantId: ctx.tenantId,
    timestamp: row.occurred_at.getTime(),
    nodeId: row.node_id ?? undefined,
    agentRunId: row.agent_run_id ?? undefined,
    data: row.payload ?? undefined,
  };
}
