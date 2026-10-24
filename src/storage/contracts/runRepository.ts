import type { ExecutionState } from '../../persistence/executionTypes.js';
import type { Page, PageRequest, StorageContext, Versioned } from './common.js';

export interface RunListQuery extends PageRequest {
  statuses?: ExecutionState['status'][];
  includeDeleted?: boolean;
}

export interface RunRecord extends Versioned<ExecutionState> {
  runId: string;
  tenantId: string;
  deletedAt?: number;
}

export interface RunRepository {
  create(ctx: StorageContext, state: ExecutionState): Promise<RunRecord>;
  findById(ctx: StorageContext, runId: string): Promise<RunRecord | null>;
  list(ctx: StorageContext, query?: RunListQuery): Promise<Page<RunRecord>>;
  save(ctx: StorageContext, state: ExecutionState, expectedVersion: number): Promise<RunRecord>;
  softDelete(ctx: StorageContext, runId: string, expectedVersion: number): Promise<boolean>;
}
