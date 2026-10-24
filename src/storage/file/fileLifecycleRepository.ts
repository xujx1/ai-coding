import {
  loadLifecycleState,
  saveLifecycleState,
} from '../../lifecycle/store.js';
import type { LifecycleState } from '../../lifecycle/types.js';
import type { LifecycleRecord, LifecycleRepository } from '../contracts/lifecycleRepository.js';
import type { StorageContext } from '../contracts/common.js';
import { ConcurrentModificationError } from '../contracts/common.js';

export class FileLifecycleRepository implements LifecycleRepository {
  async create(ctx: StorageContext, state: LifecycleState): Promise<LifecycleRecord> {
    if (loadLifecycleState(state.runId)) throw new Error(`Lifecycle for run '${state.runId}' already exists.`);
    return record(ctx, saveLifecycleState(state));
  }

  async findByRunId(ctx: StorageContext, runId: string): Promise<LifecycleRecord | null> {
    const state = loadLifecycleState(runId);
    return state ? record(ctx, state) : null;
  }

  async save(ctx: StorageContext, state: LifecycleState, expectedVersion: number): Promise<LifecycleRecord> {
    const current = loadLifecycleState(state.runId);
    if (!current || current.updatedAt !== expectedVersion) {
      throw new ConcurrentModificationError('lifecycle', state.runId);
    }
    return record(ctx, saveLifecycleState(state));
  }
}

function record(ctx: StorageContext, state: LifecycleState): LifecycleRecord {
  return { tenantId: ctx.tenantId, value: state, version: state.updatedAt };
}
