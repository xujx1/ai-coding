import { PostgresEventBus, serializePostgresNotification, type EventBus, type EventNotification } from './eventBus.js';
import type { SqlExecutor } from '../storage/postgres/database.js';
import { getStorageMetrics, observeStorageOperation } from '../storage/metrics.js';

export interface OutboxEntry {
  outboxId: number;
  tenantId: string;
  runId: string;
  eventId: string;
  payload: unknown;
  attemptCount: number;
}

interface OutboxRow {
  outbox_id: string | number;
  tenant_id: string;
  run_id: string;
  event_id: string;
  payload: unknown;
  attempt_count: string | number;
}

export class PostgresOutboxRepository {
  constructor(private readonly sql: SqlExecutor) {}

  async claimDue(workerId: string, limit = 100, claimMs = 30_000, tenantScope?: string): Promise<OutboxEntry[]> {
    const rows = await this.sql.query<OutboxRow>(`
      WITH due AS (
        SELECT outbox_id FROM outbox_events
        WHERE published_at IS NULL AND terminal_failed_at IS NULL
          AND ($4::text IS NULL OR tenant_id = $4)
          AND next_attempt_at <= now() AND (claimed_until IS NULL OR claimed_until <= now())
        ORDER BY outbox_id ASC FOR UPDATE SKIP LOCKED LIMIT $1
      )
      UPDATE outbox_events AS event SET claimed_by = $2, claimed_until = now() + ($3 * interval '1 millisecond')
      FROM due WHERE event.outbox_id = due.outbox_id
      RETURNING event.outbox_id, event.tenant_id, event.run_id, event.event_id, event.payload, event.attempt_count
    `, [bounded(limit, 1, 500), workerId, bounded(claimMs, 1, 300_000), tenantScope ?? null]);
    return rows.rows.map(toEntry);
  }

  async markPublished(entry: OutboxEntry, workerId: string): Promise<void> {
    await this.sql.query(`
      UPDATE outbox_events SET published_at = now(), claimed_by = NULL, claimed_until = NULL, last_error = NULL
      WHERE tenant_id = $1 AND outbox_id = $2 AND claimed_by = $3 AND published_at IS NULL
    `, [entry.tenantId, entry.outboxId, workerId]);
  }

  /**
   * PostgreSQL delivers NOTIFY only when this statement commits. Updating the
   * outbox row and invoking pg_notify in RETURNING therefore has one outcome:
   * both become visible, or neither does.
   */
  async publishAndMark(entry: OutboxEntry, workerId: string, channel: string): Promise<void> {
    const result = await this.sql.query(`
      UPDATE outbox_events SET published_at = now(), claimed_by = NULL, claimed_until = NULL, last_error = NULL
      WHERE tenant_id = $1 AND outbox_id = $2 AND claimed_by = $3 AND published_at IS NULL
      RETURNING pg_notify($4, $5) AS notified
    `, [entry.tenantId, entry.outboxId, workerId, channel, serializePostgresNotification(notification(entry))]);
    if (result.rowCount !== 1) throw new Error(`Outbox claim ${entry.outboxId} is no longer owned by ${workerId}.`);
  }

  async markFailed(entry: OutboxEntry, workerId: string, error: unknown, maxAttempts = 10): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const result = await this.sql.query<{ attempt_count: string | number }>(`
      UPDATE outbox_events SET attempt_count = attempt_count + 1, claimed_by = NULL, claimed_until = NULL,
        last_error = $4,
        next_attempt_at = now() + (LEAST(3600000, 1000 * power(2, attempt_count)) * interval '1 millisecond')
      WHERE tenant_id = $1 AND outbox_id = $2 AND claimed_by = $3 AND published_at IS NULL
      RETURNING attempt_count
    `, [entry.tenantId, entry.outboxId, workerId, message.slice(0, 4000)]);
    const attempts = Number(result.rows[0]?.attempt_count);
    if (Number.isFinite(attempts) && attempts >= maxAttempts) {
      await this.sql.query(`
        UPDATE outbox_events SET terminal_failed_at = now(), claimed_by = NULL, claimed_until = NULL
        WHERE tenant_id = $1 AND outbox_id = $2 AND published_at IS NULL AND attempt_count >= $3
      `, [entry.tenantId, entry.outboxId, maxAttempts]);
    }
  }
}

interface OutboxStore {
  claimDue(workerId: string, limit?: number): Promise<OutboxEntry[]>;
  markPublished(entry: OutboxEntry, workerId: string): Promise<void>;
  publishAndMark?(entry: OutboxEntry, workerId: string, channel: string): Promise<void>;
  markFailed(entry: OutboxEntry, workerId: string, error: unknown): Promise<void>;
}

export class OutboxPublisher {
  constructor(
    private readonly outbox: OutboxStore,
    private readonly eventBus: EventBus,
    private readonly workerId: string,
  ) {}

  async publishDue(limit = 100): Promise<{ published: number; failed: number }> {
    return observeStorageOperation('outbox', 'publish_due', async () => {
      let published = 0;
      let failed = 0;
      for (const entry of await this.outbox.claimDue(this.workerId, limit)) {
        try {
          if (this.eventBus instanceof PostgresEventBus && this.outbox.publishAndMark) {
            await this.outbox.publishAndMark(entry, this.workerId, this.eventBus.channelName);
          } else {
            await this.eventBus.publish(notification(entry));
            await this.outbox.markPublished(entry, this.workerId);
          }
          published += 1;
          getStorageMetrics().increment('storage_outbox_published_total');
        } catch (error) {
          await this.outbox.markFailed(entry, this.workerId, error);
          failed += 1;
          getStorageMetrics().increment('storage_outbox_failures_total');
        }
      }
      getStorageMetrics().increment('storage_outbox_publish_runs_total');
      return { published, failed };
    });
  }
}

export interface OutboxPublisherLoopOptions {
  intervalMs?: number;
  batchSize?: number;
  onError?: (error: unknown) => void;
}

/**
 * Runs the transactional outbox publisher for the lifetime of one process.
 * A one-shot timer is scheduled only after the previous publish completes, so
 * a slow notification or PostgreSQL call cannot create overlapping claim loops.
 */
export class OutboxPublisherLoop {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;
  private running = false;

  constructor(
    private readonly publisher: Pick<OutboxPublisher, 'publishDue'>,
    private readonly options: OutboxPublisherLoopOptions,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.inFlight;
  }

  private schedule(delayMs: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      const current = this.publishOnce();
      this.inFlight = current;
      void current.finally(() => {
        if (this.inFlight === current) this.inFlight = undefined;
        this.schedule(this.options.intervalMs ?? 1_000);
      });
    }, Math.max(0, delayMs));
    this.timer.unref?.();
  }

  private async publishOnce(): Promise<void> {
    try {
      await this.publisher.publishDue(this.options.batchSize ?? 100);
    } catch (error) {
      this.options.onError?.(error);
    }
  }
}

function notification(entry: OutboxEntry): EventNotification {
  const payload = typeof entry.payload === 'object' && entry.payload !== null ? entry.payload as Record<string, unknown> : {};
  const sequence = typeof payload.sequence === 'number' ? payload.sequence : 0;
  return { eventId: entry.eventId, runId: entry.runId, sequence, tenantId: entry.tenantId };
}

function toEntry(row: OutboxRow): OutboxEntry {
  return { outboxId: Number(row.outbox_id), tenantId: row.tenant_id, runId: row.run_id, eventId: row.event_id, payload: row.payload, attemptCount: Number(row.attempt_count) };
}

function bounded(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.floor(value))); }
