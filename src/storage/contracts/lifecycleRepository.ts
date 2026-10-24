import type { LifecycleState } from '../../lifecycle/types.js';
import type { StorageContext, Versioned } from './common.js';

export interface LifecycleRecord extends Versioned<LifecycleState> {
  tenantId: string;
}

export interface LifecycleRepository {
  create(ctx: StorageContext, state: LifecycleState): Promise<LifecycleRecord>;
  findByRunId(ctx: StorageContext, runId: string): Promise<LifecycleRecord | null>;
  save(ctx: StorageContext, state: LifecycleState, expectedVersion: number): Promise<LifecycleRecord>;
}
