import type { PipelineEvent } from '../../events/types.js';
import type { IdempotencyKey, Page, PageRequest, StorageContext } from './common.js';

export interface StoredRunEvent extends PipelineEvent {
  tenantId: string;
  sequence: number;
}

export interface EventCursor extends PageRequest {
  afterSequence?: number;
}

export interface EventRepository {
  append(ctx: StorageContext, event: PipelineEvent, idempotency?: IdempotencyKey): Promise<StoredRunEvent>;
  listByRun(ctx: StorageContext, runId: string, cursor?: EventCursor): Promise<Page<StoredRunEvent>>;
}
