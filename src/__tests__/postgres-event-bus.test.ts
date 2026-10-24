import * as assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import { EventReplayService } from '../events/eventReplay.js';
import { PostgresEventBus, type EventBus, type EventNotification } from '../events/eventBus.js';
import { OutboxPublisher, PostgresOutboxRepository } from '../events/outbox.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL LISTEN/NOTIFY broadcasts across API instances and reconnects after listener loss', { skip: !databaseUrl }, async () => {
  const config = { ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false };
  const database = new PostgresDatabase(config);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const listenerName = `event-listener-${suffix}`;
  const publisher = new PostgresEventBus(config, { applicationName: `event-publisher-${suffix}`, reconnectDelayMs: 20 });
  const listener = new PostgresEventBus(config, { applicationName: listenerName, reconnectDelayMs: 20 });
  const received: string[] = [];
  const unsubscribe = await listener.subscribe(notification => { received.push(notification.eventId); });
  try {
    const first = notification('event-before-reconnect', 1);
    await publisher.publish(first);
    await waitFor(() => received.includes(first.eventId));

    const oldPid = await listenerPid(database, listenerName);
    assert.ok(oldPid);
    const terminated = await database.query<{ terminated: boolean }>('SELECT pg_terminate_backend($1) AS terminated', [oldPid]);
    assert.equal(terminated.rows[0]?.terminated, true);
    await waitFor(async () => {
      const pid = await listenerPid(database, listenerName);
      return Boolean(pid && pid !== oldPid);
    }, 5_000);

    const second = notification('event-after-reconnect', 2);
    await publisher.publish(second);
    await waitFor(() => received.includes(second.eventId));
    assert.deepEqual(received, [first.eventId, second.eventId]);
    assert.equal(await listener.health(), true);
  } finally {
    await unsubscribe();
    await Promise.all([publisher.close(), listener.close()]);
    await database.close();
  }
});

test('PostgreSQL outbox survives publisher failure/restart and replay remains gap-free', { skip: !databaseUrl }, async () => {
  const config = { ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false };
  const database = new PostgresDatabase(config);
  await runStorageMigrations(database);
  const repositories = postgresRepositories(database);
  const tenantId = `event-outbox-${Date.now()}`;
  const context = { tenantId };
  const runId = `event-outbox-run-${Date.now()}`;
  const bus = new PostgresEventBus(config, { applicationName: `event-outbox-${Date.now()}` });
  const received: EventNotification[] = [];
  const unsubscribe = await bus.subscribe(notification => { received.push(notification); });
  try {
    await repositories.runs.create(context, executionState(runId));
    const event = await repositories.events.append(context, {
      id: `${runId}-event`,
      type: 'pipeline_created',
      runId,
      timestamp: Date.now(),
      data: { source: 'postgres-notify-test' },
    });
    const failingBus: EventBus = {
      publish: async () => { throw new Error('notification connection interrupted'); },
      subscribe: async () => async () => undefined,
      close: async () => undefined,
    };
    const outbox = new PostgresOutboxRepository(database);
    const firstPublisher = new OutboxPublisher(outbox, failingBus, 'publisher-before-restart');
    assert.deepEqual(await firstPublisher.publishDue(), { published: 0, failed: 1 });
    assert.equal(await pendingCount(database, tenantId, runId), 1);

    await database.query(`UPDATE outbox_events SET next_attempt_at = now() WHERE tenant_id = $1 AND run_id = $2`, [tenantId, runId]);
    const restartedPublisher = new OutboxPublisher(outbox, bus, 'publisher-after-restart');
    assert.deepEqual(await restartedPublisher.publishDue(), { published: 1, failed: 0 });
    await waitFor(() => received.some(notification => notification.eventId === event.id));
    assert.equal(await pendingCount(database, tenantId, runId), 0);

    // A reconnecting client repairs any lost wake-up from durable sequence
    // history; notifications never own ordering or completeness.
    const replay = await new EventReplayService(repositories.events).after(context, runId, 0);
    assert.deepEqual(replay.map(item => [item.id, item.sequence]), [[event.id, 1]]);
  } finally {
    await unsubscribe();
    await bus.close();
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [tenantId, runId]);
    await database.close();
  }
});

test('PostgreSQL outbox atomically publishes due events across tenants', { skip: !databaseUrl }, async () => {
  const config = { ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false };
  const database = new PostgresDatabase(config);
  await runStorageMigrations(database);
  const repositories = postgresRepositories(database);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenants = [`outbox-tenant-a-${suffix}`, `outbox-tenant-b-${suffix}`];
  const runIds = [`outbox-run-a-${suffix}`, `outbox-run-b-${suffix}`];
  const bus = new PostgresEventBus(config, { applicationName: `multi-tenant-outbox-${suffix}` });
  const received: EventNotification[] = [];
  const unsubscribe = await bus.subscribe(notification => {
    if (tenants.includes(notification.tenantId)) received.push(notification);
  });
  try {
    for (let index = 0; index < tenants.length; index += 1) {
      const context = { tenantId: tenants[index]! };
      await repositories.runs.create(context, executionState(runIds[index]!));
      await repositories.events.append(context, {
        id: `${runIds[index]}-event`, type: 'pipeline_created', runId: runIds[index]!, timestamp: Date.now(),
      });
    }

    const publisher = new OutboxPublisher(new PostgresOutboxRepository(database), bus, 'all-tenant-publisher');
    const result = await publisher.publishDue(500);
    assert.ok(result.published >= 2);
    await waitFor(() => tenants.every(tenantId => received.some(notification => notification.tenantId === tenantId)));
    for (let index = 0; index < tenants.length; index += 1) {
      assert.equal(await pendingCount(database, tenants[index]!, runIds[index]!), 0);
    }
  } finally {
    await unsubscribe();
    await bus.close();
    for (let index = 0; index < tenants.length; index += 1) {
      await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [tenants[index], runIds[index]]);
    }
    await database.close();
  }
});

test('PostgreSQL rolls back published_at when pg_notify fails', { skip: !databaseUrl }, async () => {
  const config = { ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false };
  const database = new PostgresDatabase(config);
  await runStorageMigrations(database);
  const repositories = postgresRepositories(database);
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const tenantId = `atomic-notify-${suffix}`;
  const runId = `atomic-notify-run-${suffix}`;
  const workerId = `atomic-notify-worker-${suffix}`;
  const bus = new PostgresEventBus(config, { applicationName: `atomic-notify-${suffix}` });
  const received: EventNotification[] = [];
  const unsubscribe = await bus.subscribe(value => { received.push(value); });
  try {
    await repositories.runs.create({ tenantId }, executionState(runId));
    const event = await repositories.events.append({ tenantId }, {
      id: `${runId}-event`, type: 'pipeline_created', runId, timestamp: Date.now(),
    });
    const outbox = new PostgresOutboxRepository(database);
    const claimed = await outbox.claimDue(workerId, 10, 30_000, tenantId);
    const entry = claimed.find(value => value.eventId === event.id);
    assert.ok(entry);

    await assert.rejects(() => outbox.publishAndMark(entry, workerId, 'x'.repeat(64)), /channel name too long/);
    assert.equal(await pendingCount(database, tenantId, runId), 1, 'failed NOTIFY must roll back published_at');

    await outbox.publishAndMark(entry, workerId, bus.channelName);
    await waitFor(() => received.some(value => value.eventId === event.id));
    assert.equal(await pendingCount(database, tenantId, runId), 0);
  } finally {
    await unsubscribe();
    await bus.close();
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [tenantId, runId]);
    await database.close();
  }
});

function notification(eventId: string, sequence: number): EventNotification {
  return { eventId, runId: 'cross-api-run', sequence, tenantId: 'cross-api-tenant' };
}

async function listenerPid(database: PostgresDatabase, applicationName: string): Promise<number | undefined> {
  const result = await database.query<{ pid: number }>(`
    SELECT pid FROM pg_stat_activity
    WHERE application_name = $1 AND query LIKE 'LISTEN%'
    ORDER BY backend_start DESC LIMIT 1
  `, [applicationName]);
  return result.rows[0]?.pid;
}

async function pendingCount(database: PostgresDatabase, tenantId: string, runId: string): Promise<number> {
  const result = await database.query<{ count: string }>(`
    SELECT count(*)::text AS count FROM outbox_events
    WHERE tenant_id = $1 AND run_id = $2 AND published_at IS NULL
  `, [tenantId, runId]);
  return Number(result.rows[0]?.count ?? 0);
}

function executionState(runId: string): ExecutionState {
  const now = Date.now();
  return {
    runId,
    name: 'PostgreSQL notification run',
    status: 'idle',
    currentNodeIndex: -1,
    nodes: [],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: now,
    updatedAt: now,
  };
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!await predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for PostgreSQL notification state.');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
