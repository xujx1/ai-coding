import { Client, Pool } from 'pg';
import type { StorageConfig } from '../config/types.js';

export interface EventNotification {
  eventId: string;
  runId: string;
  sequence: number;
  tenantId: string;
}

export interface EventBus {
  publish(notification: EventNotification): Promise<void>;
  subscribe(handler: (notification: EventNotification) => void | Promise<void>): Promise<() => Promise<void>>;
  close(): Promise<void>;
  health?(): Promise<boolean>;
}

/** Test/local implementation; it is deliberately not used for multi-instance mode. */
export class MemoryEventBus implements EventBus {
  private readonly handlers = new Set<(notification: EventNotification) => void | Promise<void>>();
  async publish(notification: EventNotification): Promise<void> { await Promise.all([...this.handlers].map(handler => handler(notification))); }
  async subscribe(handler: (notification: EventNotification) => void | Promise<void>): Promise<() => Promise<void>> {
    this.handlers.add(handler);
    return async () => { this.handlers.delete(handler); };
  }
  async close(): Promise<void> { this.handlers.clear(); }
  async health(): Promise<boolean> { return true; }
}

/**
 * PostgreSQL NOTIFY provides fan-out only; run_events remains the replay and
 * ordering authority. LISTEN uses a dedicated connection because pooled
 * connections cannot retain session-scoped subscriptions safely.
 */
export class PostgresEventBus implements EventBus {
  private readonly publisher: Pool;
  private readonly channel: string;
  private readonly connectionConfig: ConstructorParameters<typeof Client>[0];
  private readonly reconnectDelayMs: number;
  private readonly handlers = new Set<(notification: EventNotification) => void | Promise<void>>();
  private subscriber?: Client;
  private connecting?: Promise<void>;
  private reconnectTimer?: NodeJS.Timeout;
  private closed = false;

  constructor(
    config: Pick<StorageConfig, 'databaseUrl' | 'databaseSsl'>,
    options: { channel?: string; applicationName?: string; reconnectDelayMs?: number } = {},
  ) {
    if (!config.databaseUrl) throw new Error('PostgreSQL event notifications require DATABASE_URL.');
    this.channel = assertChannel(options.channel ?? 'ai_coding_run_events');
    this.reconnectDelayMs = Math.max(10, options.reconnectDelayMs ?? 250);
    this.connectionConfig = {
      connectionString: config.databaseUrl,
      ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
      application_name: sanitizeApplicationName(options.applicationName ?? `ai-coding-events-${process.pid}`),
    };
    this.publisher = new Pool({ ...this.connectionConfig, min: 0, max: 2 });
  }

  async publish(notification: EventNotification): Promise<void> {
    if (this.closed) throw new Error('PostgreSQL event bus is closed.');
    const payload = serializePostgresNotification(notification);
    await this.publisher.query('SELECT pg_notify($1, $2)', [this.channel, payload]);
  }

  /** Used by the PostgreSQL outbox to notify and acknowledge in one statement. */
  get channelName(): string { return this.channel; }

  async subscribe(handler: (notification: EventNotification) => void | Promise<void>): Promise<() => Promise<void>> {
    if (this.closed) throw new Error('PostgreSQL event bus is closed.');
    this.handlers.add(handler);
    try {
      await this.ensureSubscriber();
    } catch (error) {
      this.handlers.delete(handler);
      throw error;
    }
    return async () => {
      this.handlers.delete(handler);
      if (this.handlers.size === 0) await this.stopSubscriber();
    };
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.handlers.clear();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    await this.stopSubscriber();
    await this.publisher.end();
  }

  async health(): Promise<boolean> {
    try {
      await this.publisher.query('SELECT 1');
      if (this.handlers.size > 0) await this.ensureSubscriber();
      return true;
    } catch { return false; }
  }

  private async ensureSubscriber(): Promise<void> {
    if (this.closed) throw new Error('PostgreSQL event bus is closed.');
    if (this.subscriber) return;
    if (this.connecting) return this.connecting;
    const connecting = this.connectSubscriber();
    this.connecting = connecting;
    try { await connecting; }
    finally { if (this.connecting === connecting) this.connecting = undefined; }
  }

  private async connectSubscriber(): Promise<void> {
    const subscriber = new Client(this.connectionConfig);
    subscriber.on('notification', message => {
      if (message.channel !== this.channel || !message.payload) return;
      const notification = parse(message.payload);
      if (!notification) return;
      for (const handler of this.handlers) void Promise.resolve(handler(notification)).catch(() => undefined);
    });
    subscriber.on('error', () => this.handleSubscriberDisconnect(subscriber));
    subscriber.on('end', () => this.handleSubscriberDisconnect(subscriber));
    await subscriber.connect();
    await subscriber.query(`LISTEN ${quoteIdentifier(this.channel)}`);
    if (this.closed || this.handlers.size === 0) {
      await subscriber.end().catch(() => undefined);
      return;
    }
    this.subscriber = subscriber;
  }

  private handleSubscriberDisconnect(subscriber: Client): void {
    if (this.subscriber !== subscriber) return;
    this.subscriber = undefined;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.handlers.size === 0 || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.ensureSubscriber().catch(() => this.scheduleReconnect());
    }, this.reconnectDelayMs);
    this.reconnectTimer.unref?.();
  }

  private async stopSubscriber(): Promise<void> {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const subscriber = this.subscriber;
    this.subscriber = undefined;
    if (!subscriber) return;
    await subscriber.query(`UNLISTEN ${quoteIdentifier(this.channel)}`).catch(() => undefined);
    await subscriber.end().catch(() => undefined);
  }
}

function parse(payload: string): EventNotification | null {
  try {
    const value = JSON.parse(payload) as unknown;
    if (typeof value !== 'object' || value === null) return null;
    const notification = value as Record<string, unknown>;
    if (typeof notification.eventId !== 'string' || typeof notification.runId !== 'string' || typeof notification.tenantId !== 'string' || typeof notification.sequence !== 'number') return null;
    return { eventId: notification.eventId, runId: notification.runId, sequence: notification.sequence, tenantId: notification.tenantId };
  } catch { return null; }
}

export function serializePostgresNotification(notification: EventNotification): string {
  const payload = JSON.stringify(notification);
  if (Buffer.byteLength(payload, 'utf8') > 7_900) throw new Error('PostgreSQL notification payload exceeds the safe NOTIFY size.');
  return payload;
}

function assertChannel(channel: string): string {
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(channel)) throw new Error(`Invalid PostgreSQL notification channel '${channel}'.`);
  return channel;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function sanitizeApplicationName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:-]+/g, '-').slice(0, 63) || 'ai-coding-events';
}
