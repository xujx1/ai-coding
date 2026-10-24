import * as assert from 'assert/strict';
import test from 'node:test';
import { OutboxPublisher, OutboxPublisherLoop, type OutboxEntry } from '../events/outbox.js';
import type { EventBus, EventNotification } from '../events/eventBus.js';

test('outbox publisher acknowledges successful notifications and retries failures', async () => {
  const entries: OutboxEntry[] = [
    { outboxId: 1, tenantId: 'tenant', runId: 'run', eventId: 'one', payload: { sequence: 1 }, attemptCount: 0 },
    { outboxId: 2, tenantId: 'tenant', runId: 'run', eventId: 'two', payload: { sequence: 2 }, attemptCount: 0 },
  ];
  const published: number[] = [];
  const failed: number[] = [];
  const bus: EventBus = {
    async publish(event: EventNotification) { if (event.eventId === 'two') throw new Error('notification connection unavailable'); },
    async subscribe() { return async () => undefined; }, async close() {},
  };
  const publisher = new OutboxPublisher({
    async claimDue() { return entries; },
    async markPublished(entry) { published.push(entry.outboxId); },
    async markFailed(entry) { failed.push(entry.outboxId); },
  }, bus, 'worker');
  assert.deepEqual(await publisher.publishDue(), { published: 1, failed: 1 });
  assert.deepEqual(published, [1]);
  assert.deepEqual(failed, [2]);
});

test('outbox publisher loop starts immediately, never overlaps, and stops cleanly', async () => {
  let calls = 0;
  let active = 0;
  let maximumActive = 0;
  let releaseFirst!: () => void;
  const firstCall = new Promise<void>(resolve => { releaseFirst = resolve; });
  const publisher = {
    async publishDue() {
      calls += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      if (calls === 1) await firstCall;
      active -= 1;
      return { published: 0, failed: 0 };
    },
  };
  const loop = new OutboxPublisherLoop(publisher, {
    intervalMs: 5,
  });

  loop.start();
  await waitFor(() => calls === 1);
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(calls, 1);
  releaseFirst();
  await waitFor(() => calls >= 2);
  await loop.stop();
  const callsAfterStop = calls;
  await new Promise(resolve => setTimeout(resolve, 15));

  assert.equal(maximumActive, 1);
  assert.equal(calls, callsAfterStop);
});

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for condition.');
    await new Promise(resolve => setTimeout(resolve, 2));
  }
}
