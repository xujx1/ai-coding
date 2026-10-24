import * as assert from 'assert/strict';
import test from 'node:test';
import { RepositorySessionService } from '../session/repositorySessionService.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';

test('repository session service creates, paginates, reads, and renames without file discovery', async () => {
  const state = { runId: 'run-a', name: 'A', status: 'idle' as const, currentNodeIndex: -1, nodes: [], permissionMode: 'default' as const, modelOverrides: {}, startedAt: 1, updatedAt: 1 };
  const calls: string[] = [];
  const service = new RepositorySessionService({
    context: { tenantId: 'tenant-a' },
    createState: ({ runId, name, description }) => ({ ...state, runId, name, description, startedAt: 2, updatedAt: 2 }),
    runs: {
      create: async (_ctx, value) => { calls.push(`create:${value.runId}`); return { runId: value.runId, tenantId: 'tenant-a', value, version: 1 }; },
      findById: async (_ctx, runId) => runId === 'run-a' ? { runId, tenantId: 'tenant-a', value: state, version: 7 } : null,
      list: async () => ({ items: [{ runId: 'run-a', tenantId: 'tenant-a', value: state, version: 7 }] }),
      save: async (_ctx, value, version) => { calls.push(`save:${version}:${value.name}`); return { runId: value.runId, tenantId: 'tenant-a', value, version: version + 1 }; },
      softDelete: async () => false,
    },
    agents: { listByRun: async () => ({ items: [] }) } as any,
    events: {
      append: async (_ctx, event) => { calls.push(`event:${event.type}`); return { ...event, tenantId: 'tenant-a', sequence: 1 }; },
      listByRun: async () => ({ items: [] }),
    },
  });
  const created = await service.create('Created');
  assert.equal(created.name, 'Created');
  assert.equal((await service.list())[0]?.runId, 'run-a');
  assert.deepEqual(await service.get('missing'), { state: null, events: [], agents: [] });
  assert.equal(await service.rename('run-a', 'Renamed'), true);
  assert.deepEqual(calls.map(value => value.split(':')[0]), ['create', 'event', 'save']);
});

test('repository session creation writes its run and durable creation event in one UnitOfWork', async () => {
  const state: any = { runId: 'ignored', name: 'created', status: 'idle', currentNodeIndex: -1, nodes: [], permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1 };
  const calls: string[] = [];
  const repositories = {
    runs: { create: async () => { calls.push('run'); return { tenantId: 'tenant-transaction', value: state, version: 1 }; } },
    events: { append: async () => { calls.push('event'); throw new Error('outbox insert failed'); } },
  } as unknown as StorageRepositories;
  const unitOfWork: UnitOfWork = {
    transaction: async (_ctx, work) => {
      const committed = [...calls];
      try { return await work(repositories); }
      catch (error) { calls.splice(0, calls.length, ...committed, 'rollback'); throw error; }
    },
  };
  const service = new RepositorySessionService({
    context: { tenantId: 'tenant-transaction' }, unitOfWork, createState: args => ({ ...state, runId: args.runId, name: args.name }),
    runs: repositories.runs as any, events: repositories.events as any, agents: {} as any,
  });
  await assert.rejects(() => service.create('created'), /outbox insert failed/);
  assert.deepEqual(calls, ['rollback']);
});

test('repository session cancellation rolls back its run update when the durable event fails', async () => {
  const original: any = { runId: 'run-cancel-tx', name: 'Cancel', status: 'running', currentNodeIndex: -1, nodes: [], permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1 };
  let committed = structuredClone(original);
  const staged: any[] = [];
  const repositories = {
    runs: {
      findById: async () => ({ runId: original.runId, tenantId: 'tenant-cancel-tx', value: committed, version: 1 }),
      save: async (_ctx: unknown, value: any) => { staged.push(value); return { runId: value.runId, tenantId: 'tenant-cancel-tx', value, version: 2 }; },
    },
    events: { append: async () => { throw new Error('event failure'); } },
  } as unknown as StorageRepositories;
  const unitOfWork: UnitOfWork = {
    transaction: async (_ctx, work) => {
      try { return await work(repositories); }
      catch (error) { staged.splice(0); throw error; }
    },
  };
  const service = new RepositorySessionService({
    context: { tenantId: 'tenant-cancel-tx' }, unitOfWork, createState: () => original,
    runs: repositories.runs as any, events: repositories.events as any, agents: {} as any,
  });
  await assert.rejects(() => service.cancel(original.runId), /event failure/);
  assert.deepEqual(staged, []);
  assert.equal(committed.status, 'running');
});

test('repository session service applies versioned lifecycle transitions', async () => {
  let value: any = { runId: 'run-b', name: 'B', status: 'suspended', currentNodeIndex: -1, nodes: [], permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1 };
  const types: string[] = [];
  const service = new RepositorySessionService({
    context: { tenantId: 'tenant-b' }, createState: () => value,
    runs: {
      create: async () => ({ runId: value.runId, tenantId: 'tenant-b', value, version: 1 }),
      findById: async () => ({ runId: value.runId, tenantId: 'tenant-b', value, version: 4 }),
      list: async () => ({ items: [] }),
      save: async (_ctx, next) => { value = next; return { runId: next.runId, tenantId: 'tenant-b', value: next, version: 5 }; },
      softDelete: async () => false,
    },
    agents: { listByRun: async () => ({ items: [] }) } as any,
    events: { append: async (_ctx, event) => { types.push(event.type); return { ...event, tenantId: 'tenant-b', sequence: types.length }; }, listByRun: async () => ({ items: [] }) },
  });
  assert.equal((await service.resume('run-b'))?.status, 'running');
  assert.equal(await service.suspend('run-b'), true);
  assert.equal(await service.cancel('run-b'), true);
  assert.equal(value.status, 'cancelled');
  assert.equal(await service.cancel('run-b'), false);
  assert.deepEqual(types, ['pipeline_resumed', 'session_suspended', 'pipeline_cancelled']);
});

test('repository session update applies a patch with the loaded version', async () => {
  const value: any = { runId: 'run-update', name: 'Update', status: 'idle', currentNodeIndex: -1, nodes: [], permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1 };
  let expectedVersion: number | undefined;
  const service = new RepositorySessionService({
    context: { tenantId: 'tenant-update' }, createState: () => value,
    runs: {
      create: async () => ({ runId: value.runId, tenantId: 'tenant-update', value, version: 1 }),
      findById: async () => ({ runId: value.runId, tenantId: 'tenant-update', value, version: 12 }),
      list: async () => ({ items: [] }),
      save: async (_ctx, next, version) => { expectedVersion = version; return { runId: next.runId, tenantId: 'tenant-update', value: next, version: 13 }; },
      softDelete: async () => false,
    },
    agents: {} as any, events: {} as any,
  });
  const updated = await service.update(value.runId, state => { state.modelOverrides = { code: 'model-a' }; });
  assert.equal(expectedVersion, 12);
  assert.deepEqual(updated?.modelOverrides, { code: 'model-a' });
});

test('repository session service deletes with the stored version', async () => {
  let expectedVersion: number | undefined;
  const value: any = { runId: 'run-delete', name: 'Delete', status: 'idle', currentNodeIndex: -1, nodes: [], permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1 };
  const service = new RepositorySessionService({
    context: { tenantId: 'tenant-delete' }, createState: () => value,
    runs: {
      create: async () => ({ runId: value.runId, tenantId: 'tenant-delete', value, version: 1 }),
      findById: async () => ({ runId: value.runId, tenantId: 'tenant-delete', value, version: 42 }),
      list: async () => ({ items: [] }), save: async () => ({ runId: value.runId, tenantId: 'tenant-delete', value, version: 1 }),
      softDelete: async (_ctx, _runId, version) => { expectedVersion = version; return true; },
    },
    agents: {} as any, events: {} as any,
  });
  assert.equal(await service.delete('run-delete'), true);
  assert.equal(expectedVersion, 42);
});

test('repository session service persists branch rerun and cancellation through versioned repositories', async () => {
  let value: any = {
    runId: 'run-branch', name: 'Branch', status: 'cancelled', currentNodeIndex: -1, nodes: [], permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1,
    projects: [{ name: 'orders', root: '/repos/orders', status: 'failed', retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 } }],
    workflowInstance: {
      id: 'workflow-run-branch', layout: 'default', version: 1, legacyFallback: false, updatedAt: new Date(0).toISOString(),
      nodes: [], edges: [], joins: [{ joinId: 'app-join', waitingForBranchIds: ['orders-branch'], completedBranchIds: [], failedBranchIds: ['orders-branch'], cancelledBranchIds: [], status: 'failed' }],
      branches: [{ branchId: 'orders-branch', projectName: 'orders', projectRoot: '/repos/orders', status: 'failed', nodes: [], artifactIndex: {}, retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 } }],
    },
  };
  const events: string[] = [];
  const service = new RepositorySessionService({
    context: { tenantId: 'tenant-branch' }, createState: () => value,
    runs: {
      create: async () => ({ runId: value.runId, tenantId: 'tenant-branch', value, version: 1 }),
      findById: async () => ({ runId: value.runId, tenantId: 'tenant-branch', value, version: 1 }),
      list: async () => ({ items: [] }),
      save: async (_ctx, next) => { value = next; return { runId: next.runId, tenantId: 'tenant-branch', value: next, version: 2 }; },
      softDelete: async () => false,
    },
    agents: {} as any,
    events: { append: async (_ctx, event) => { events.push(event.type); return { ...event, tenantId: 'tenant-branch', sequence: events.length }; }, listByRun: async () => ({ items: [] }) },
  });
  assert.equal((await service.rerunBranch('run-branch', 'orders-branch', 'implementation-plan'))?.status, 'idle');
  assert.equal(value.workflowInstance.branches[0].status, 'pending');
  value.workflowInstance.branches[0].status = 'running';
  assert.equal((await service.cancelBranch('run-branch', 'orders-branch'))?.workflowInstance?.branches[0]?.status, 'cancelled');
  assert.deepEqual(events, ['branch_rerun_scheduled', 'branch_cancelled']);
});
