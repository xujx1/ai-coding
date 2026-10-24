import type { EventRepository, StoredRunEvent } from '../storage/contracts/eventRepository.js';
import type { StorageContext } from '../storage/contracts/common.js';

/** Replays durable, per-run ordered events after a client cursor. */
export class EventReplayService {
  constructor(private readonly events: EventRepository) {}

  async after(ctx: StorageContext, runId: string, afterSequence = 0, pageSize = 250): Promise<StoredRunEvent[]> {
    const replay: StoredRunEvent[] = [];
    let cursor = afterSequence;
    while (true) {
      const page = await this.events.listByRun(ctx, runId, { afterSequence: cursor, limit: pageSize });
      replay.push(...page.items);
      const next = page.nextCursor ? Number(page.nextCursor) : undefined;
      if (!next || !Number.isFinite(next) || next <= cursor) return replay;
      cursor = next;
    }
  }
}
