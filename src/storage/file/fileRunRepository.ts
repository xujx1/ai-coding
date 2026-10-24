import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRunPaths, listRuns } from '../../runtime/paths.js';
import { StateStore } from '../../persistence/stateStore.js';
import type { ExecutionState } from '../../persistence/executionTypes.js';
import type { RunListQuery, RunRecord, RunRepository } from '../contracts/runRepository.js';
import type { Page, StorageContext } from '../contracts/common.js';
import { ConcurrentModificationError } from '../contracts/common.js';

export class FileRunRepository implements RunRepository {
  async create(ctx: StorageContext, state: ExecutionState): Promise<RunRecord> {
    const existing = new StateStore(state.runId).loadExecutionState();
    if (existing) throw new Error(`Run '${state.runId}' already exists.`);
    const store = new StateStore(state.runId);
    store.saveExecutionState(state);
    return record(ctx, state);
  }

  async findById(ctx: StorageContext, runId: string): Promise<RunRecord | null> {
    const state = new StateStore(runId).loadExecutionState();
    return state ? record(ctx, state) : null;
  }

  async list(ctx: StorageContext, query: RunListQuery = {}): Promise<Page<RunRecord>> {
    const limit = Math.max(1, Math.min(query.limit ?? 100, 500));
    const offset = Number.parseInt(query.cursor ?? '0', 10) || 0;
    const records = listRuns()
      .map(runId => new StateStore(runId).loadExecutionState())
      .filter((state): state is ExecutionState => Boolean(state))
      .filter(state => !query.statuses || query.statuses.includes(state.status))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(state => record(ctx, state));
    const items = records.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < records.length ? String(nextOffset) : undefined };
  }

  async save(ctx: StorageContext, state: ExecutionState, expectedVersion: number): Promise<RunRecord> {
    const store = new StateStore(state.runId);
    const current = store.loadExecutionState();
    if (!current || current.updatedAt !== expectedVersion) {
      throw new ConcurrentModificationError('run', state.runId);
    }
    store.saveExecutionState(state);
    return record(ctx, state);
  }

  async softDelete(_ctx: StorageContext, runId: string, expectedVersion: number): Promise<boolean> {
    const store = new StateStore(runId);
    const current = store.loadExecutionState();
    if (!current) return false;
    if (current.updatedAt !== expectedVersion) {
      throw new ConcurrentModificationError('run', runId);
    }
    const runDir = getRunPaths(runId).runDir;
    fs.rmSync(path.resolve(runDir), { recursive: true, force: true });
    return true;
  }
}

function record(ctx: StorageContext, state: ExecutionState): RunRecord {
  return { runId: state.runId, tenantId: ctx.tenantId, value: state, version: state.updatedAt };
}
