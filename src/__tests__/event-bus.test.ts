import * as assert from 'assert/strict';
import test from 'node:test';
import { MemoryEventBus } from '../events/eventBus.js';

test('memory event bus delivers notifications and unsubscribes cleanly', async () => {
  const bus = new MemoryEventBus();
  const received: string[] = [];
  const unsubscribe = await bus.subscribe(event => { received.push(`${event.runId}:${event.sequence}`); });
  await bus.publish({ eventId: 'event-1', runId: 'run-1', sequence: 1, tenantId: 'tenant' });
  await unsubscribe();
  await bus.publish({ eventId: 'event-2', runId: 'run-1', sequence: 2, tenantId: 'tenant' });
  assert.deepEqual(received, ['run-1:1']);
  await bus.close();
});
