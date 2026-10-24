import type { WorkflowDefinition } from '../../workflows/types.js';
import type { Page, PageRequest, StorageContext, Versioned } from './common.js';

export interface WorkflowRecord extends Versioned<WorkflowDefinition> {
  tenantId: string;
}

export interface WorkflowRepository {
  findById(ctx: StorageContext, workflowId: string): Promise<WorkflowRecord | null>;
  list(ctx: StorageContext, page?: PageRequest): Promise<Page<WorkflowRecord>>;
  save(ctx: StorageContext, workflow: WorkflowDefinition, expectedVersion?: number): Promise<WorkflowRecord>;
}
