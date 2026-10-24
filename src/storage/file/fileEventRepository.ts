import { getEventLog } from '../../events/EventLog.js';
import type { PipelineEvent } from '../../events/types.js';
import type { EventCursor, EventRepository, StoredRunEvent } from '../contracts/eventRepository.js';
import type { IdempotencyKey, Page, StorageContext } from '../contracts/common.js';

export class FileEventRepository implements EventRepository {
  async append(ctx: StorageContext, event: PipelineEvent, _idempotency?: IdempotencyKey): Promise<StoredRunEvent> {
    const log = getEventLog(event.runId);
    log.loadFromDisk();
    const existing = log.getAllEvents().find(item => item.id === event.id);
    if (existing) return toStored(ctx, existing, log.getAllEvents().indexOf(existing) + 1);
    log.appendEvent(event);
    return toStored(ctx, event, log.getAllEvents().length);
  }

  async listByRun(ctx: StorageContext, runId: string, cursor: EventCursor = {}): Promise<Page<StoredRunEvent>> {
    const log = getEventLog(runId);
    log.loadFromDisk();
    const after = cursor.afterSequence ?? 0;
    const limit = Math.max(1, Math.min(cursor.limit ?? 250, 1000));
    const entries = log.getAllEvents().map((event, index) => toStored(ctx, event, index + 1))
      .filter(event => event.sequence > after);
    const items = entries.slice(0, limit);
    const last = items.at(-1)?.sequence;
    return { items, nextCursor: items.length === limit && last !== undefined ? String(last) : undefined };
  }
}

function toStored(ctx: StorageContext, event: PipelineEvent, sequence: number): StoredRunEvent {
  return { ...event, tenantId: ctx.tenantId, sequence };
}
