import * as assert from 'assert/strict';
import test from 'node:test';
import { EventReplayService } from '../events/eventReplay.js';
import type { EventRepository, StoredRunEvent } from '../storage/contracts/eventRepository.js';

test('event replay retrieves all events after a cursor across durable pages', async () => {
  const events: StoredRunEvent[] = [1, 2, 3].map(sequence => ({ id: `event-${sequence}`, type: 'pipeline_started', runId: 'run', timestamp: sequence, tenantId: 'tenant', sequence }));
  const repository: EventRepository = {
    async append() { throw new Error('not used'); },
    async listByRun(_ctx, _runId, cursor = {}) {
      const items = events.filter(event => event.sequence > (cursor.afterSequence ?? 0)).slice(0, cursor.limit ?? 1);
      const last = items.at(-1)?.sequence;
      return { items, nextCursor: last && last < 3 ? String(last) : undefined };
    },
  };
  assert.deepEqual((await new EventReplayService(repository).after({ tenantId: 'tenant' }, 'run', 1, 1)).map(event => event.sequence), [2, 3]);
});
