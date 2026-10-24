import {
  getWorkflowDefinition,
  listWorkflowDefinitions,
  saveWorkflowDefinition,
} from '../../workflows/storage.js';
import type { WorkflowDefinition } from '../../workflows/types.js';
import type { WorkflowRecord, WorkflowRepository } from '../contracts/workflowRepository.js';
import type { Page, PageRequest, StorageContext } from '../contracts/common.js';
import { ConcurrentModificationError } from '../contracts/common.js';

export class FileWorkflowRepository implements WorkflowRepository {
  async findById(ctx: StorageContext, workflowId: string): Promise<WorkflowRecord | null> {
    try {
      return record(ctx, getWorkflowDefinition(workflowId));
    } catch {
      return null;
    }
  }

  async list(ctx: StorageContext, page: PageRequest = {}): Promise<Page<WorkflowRecord>> {
    const limit = Math.max(1, Math.min(page.limit ?? 100, 500));
    const offset = Number.parseInt(page.cursor ?? '0', 10) || 0;
    const all = listWorkflowDefinitions().map(item => record(ctx, item));
    const items = all.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < all.length ? String(nextOffset) : undefined };
  }

  async save(ctx: StorageContext, workflow: WorkflowDefinition, expectedVersion?: number): Promise<WorkflowRecord> {
    const current = await this.findById(ctx, workflow.id);
    if (expectedVersion !== undefined && current && current.version !== expectedVersion) {
      throw new ConcurrentModificationError('workflow', workflow.id);
    }
    const result = saveWorkflowDefinition(workflow);
    if (!result.valid) throw new Error(result.issues.map(issue => issue.message).join('; '));
    return record(ctx, workflow);
  }
}

function record(ctx: StorageContext, workflow: WorkflowDefinition): WorkflowRecord {
  return {
    tenantId: ctx.tenantId,
    value: workflow,
    version: Date.parse(workflow.updatedAt) || 0,
  };
}
