import * as assert from 'assert/strict';
import test from 'node:test';
import { WebSocket } from 'ws';
import { WebSocketHub } from '../server/ws.js';
import type { EventBus, EventNotification } from '../events/eventBus.js';
import type { EventRepository } from '../storage/contracts/eventRepository.js';

test('WebSocketHub broadcasts cross-instance notifications from durable replay', async () => {
  let handler: ((notification: EventNotification) => void | Promise<void>) | undefined;
  const bus: EventBus = {
    publish: async () => undefined,
    subscribe: async next => { handler = next; return async () => undefined; },
    close: async () => undefined,
  };
  const events = {
    listByRun: async () => ({ items: [{ id: 'event-1', runId: 'run-1', sequence: 3, tenantId: 'tenant', type: 'pipeline_created', timestamp: 1 }] }),
  } as unknown as EventRepository;
  const hub = new WebSocketHub();
  hub.configureDurableEvents({ eventBus: bus, events, context: { tenantId: 'tenant' } });
  await new Promise(resolve => setImmediate(resolve));
  const sent: string[] = [];
  const socket = { readyState: WebSocket.OPEN, send: (value: string) => sent.push(value) };
  (hub as any).clients.set('run-1', new Set([socket]));
  await handler?.({ eventId: 'event-1', runId: 'run-1', sequence: 3, tenantId: 'tenant' });
  await handler?.({ eventId: 'event-1', runId: 'run-1', sequence: 3, tenantId: 'tenant' });
  assert.deepEqual(JSON.parse(sent[0]!), { type: 'durable_event', event: { id: 'event-1', runId: 'run-1', sequence: 3, tenantId: 'tenant', type: 'pipeline_created', timestamp: 1 } });
  assert.equal(sent.length, 1, 'duplicate notifications must not duplicate WebSocket events');
});
