import * as assert from 'node:assert/strict';
import test from 'node:test';
import { RepositoryLifecycleStatePersistence } from '../storage/lifecycleStatePersistence.js';
import { createEmptyLifecycleState, loadLifecycleState } from '../lifecycle/store.js';
import type { LifecycleRepository } from '../storage/contracts/lifecycleRepository.js';
import type { UnitOfWork } from '../storage/contracts/unitOfWork.js';
import { ConcurrentModificationError } from '../storage/contracts/common.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import {
  ensurePipelineLifecycleForExecution,
  recordPipelineLifecycleNodeStarted,
} from '../workflows/runtime/pipelineLifecycleBridge.js';

test('repository lifecycle persistence creates then versionedly saves snapshots', async () => {
  let version = 0;
  const calls: string[] = [];
  const repository = {
    findByRunId: async () => null,
    create: async (_ctx: unknown, state: any) => { calls.push(`create:${state.status}`); version = 1; return { tenantId: 'tenant-a', value: state, version }; },
    save: async (_ctx: unknown, state: any, expectedVersion: number) => {
      calls.push(`save:${expectedVersion}:${state.status}`); assert.equal(expectedVersion, version); version += 1;
      return { tenantId: 'tenant-a', value: state, version };
    },
  } as unknown as LifecycleRepository;
  const persistence = new RepositoryLifecycleStatePersistence(repository, { tenantId: 'tenant-a' });
  const state = createEmptyLifecycleState({ runId: 'run-lifecycle', requirementId: 'req' });
  await persistence.save(state);
  state.status = 'completed';
  await persistence.save(state);
  assert.deepEqual(calls, ['create:active', 'save:1:completed']);
});

test('repository lifecycle persistence loads its durable snapshot with version tracking', async () => {
  const state = createEmptyLifecycleState({ runId: 'durable-lifecycle', requirementId: 'req' });
  const repository = {
    findByRunId: async () => ({ tenantId: 'tenant-a', value: state, version: 4 }),
    create: async () => { throw new Error('must not create'); },
    save: async (_ctx: unknown, value: any, version: number) => {
      assert.equal(version, 4);
      return { tenantId: 'tenant-a', value, version: 5 };
    },
  } as unknown as LifecycleRepository;
  const persistence = new RepositoryLifecycleStatePersistence(repository, { tenantId: 'tenant-a' });
  assert.deepEqual(await persistence.load('durable-lifecycle'), state);
  await persistence.save({ ...state, status: 'completed' });
});

test('repository lifecycle persistence rejects a stale snapshot instead of overwriting it', async () => {
  const state = createEmptyLifecycleState({ runId: 'stale-lifecycle', requirementId: 'req' });
  const repository = {
    findByRunId: async () => ({ tenantId: 'tenant-a', value: state, version: 1 }),
    create: async () => { throw new Error('must not create'); },
    save: async () => { throw new ConcurrentModificationError('lifecycle', state.runId); },
  } as unknown as LifecycleRepository;
  const persistence = new RepositoryLifecycleStatePersistence(repository, { tenantId: 'tenant-a' });
  await assert.rejects(() => persistence.save({ ...state, status: 'completed' }), ConcurrentModificationError);
});

test('repository lifecycle persistence keeps each loaded snapshot version and writes through UnitOfWork', async () => {
  const initial = createEmptyLifecycleState({ runId: 'concurrent-lifecycle', requirementId: 'req' });
  let stored = structuredClone(initial);
  let version = 1;
  const repository = {
    findByRunId: async () => ({ tenantId: 'tenant-a', value: structuredClone(stored), version }),
    create: async () => { throw new Error('must not create'); },
    save: async (_ctx: unknown, value: typeof initial, expectedVersion: number) => {
      if (expectedVersion !== version) throw new ConcurrentModificationError('lifecycle', initial.runId);
      stored = structuredClone(value);
      version += 1;
      return { tenantId: 'tenant-a', value: structuredClone(stored), version };
    },
  } as unknown as LifecycleRepository;
  let transactions = 0;
  const unitOfWork = {
    async transaction(_ctx, work) {
      transactions += 1;
      return work({ lifecycle: repository } as any);
    },
  } satisfies UnitOfWork;
  const persistence = new RepositoryLifecycleStatePersistence(repository, { tenantId: 'tenant-a' }, unitOfWork);

  const first = (await persistence.load(initial.runId))!;
  const stale = (await persistence.load(initial.runId))!;
  first.status = 'completed';
  await persistence.save(first);
  stale.status = 'failed';
  await assert.rejects(() => persistence.save(stale), ConcurrentModificationError);
  assert.equal(stored.status, 'completed');
  assert.equal(transactions, 2);
});

test('pipeline lifecycle bridge uses injected persistence without lifecycle JSON fallback', async () => {
  const runId = `bridge-repository-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const execution: ExecutionState = {
    runId, name: 'repository bridge', status: 'idle', currentNodeIndex: 0, currentNodeId: 'upload-init',
    nodes: [{ id: 'upload-init', name: 'Upload', status: 'pending', failureCount: 0 }],
    permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1,
  };
  let stored: ReturnType<typeof createEmptyLifecycleState> | undefined;
  const persistence = {
    load: async () => stored ? structuredClone(stored) : null,
    save: async (state: ReturnType<typeof createEmptyLifecycleState>) => { stored = structuredClone(state); },
  };
  await ensurePipelineLifecycleForExecution(execution, { persistence });
  await recordPipelineLifecycleNodeStarted({
    execution,
    node: { id: 'upload-init', name: 'Upload' } as any,
    nodeState: execution.nodes[0],
    persistence,
  });
  assert.equal(stored?.nodeRuns[0]?.status, 'running');
  assert.equal(loadLifecycleState(runId), null);
});
