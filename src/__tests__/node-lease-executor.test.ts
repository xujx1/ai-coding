import * as assert from 'node:assert/strict';
import test from 'node:test';
import { NodeLeaseExecutor, NodeLeaseUnavailableError } from '../storage/nodeLeaseExecutor.js';
import type { Lease, LeaseRepository } from '../storage/contracts/leaseRepository.js';
import { compileWorkflowDefinition } from '../workflows/runtime/langgraph/compiler.js';
import { createInitialGraphState } from '../workflows/runtime/langgraph/state.js';
import type { WorkflowDefinition } from '../workflows/types.js';
import { runBranch } from '../workflows/runtime/langgraph/branchRunner.js';
import type { BranchWorkflowDefinition } from '../workflows/types.js';

function lease(): Lease {
  return { key: 'run:r1:node:n1', ownerId: 'worker-a', fencingToken: 1, leaseUntil: Date.now() + 10_000, heartbeatAt: Date.now() };
}

test('node lease executor acquires, fences, and releases executable work', async () => {
  const calls: string[] = [];
  const current = lease();
  const leases = {
    acquire: async () => { calls.push('acquire'); return current; },
    assertCurrent: async () => { calls.push('assert'); },
    release: async () => { calls.push('release'); },
    renew: async () => current,
  } as unknown as LeaseRepository;
  const executor = new NodeLeaseExecutor({ context: { tenantId: 'tenant-a' }, leases, workerId: 'worker-a', ttlMs: 3_000 });
  assert.equal(await executor.execute('r1', 'n1', async () => { calls.push('work'); return 'done'; }), 'done');
  assert.deepEqual(calls, ['acquire', 'work', 'assert', 'release']);
});

test('node lease executor refuses work owned by another Worker', async () => {
  const leases = { acquire: async () => null } as unknown as LeaseRepository;
  const executor = new NodeLeaseExecutor({ context: { tenantId: 'tenant-a' }, leases, workerId: 'worker-a' });
  await assert.rejects(() => executor.execute('r1', 'n1', async () => 'never'), NodeLeaseUnavailableError);
});

test('node lease executor releases a lease when node work fails or is cancelled', async () => {
  let released = 0;
  const current = lease();
  const leases = {
    acquire: async () => current,
    renew: async () => current,
    assertCurrent: async () => undefined,
    release: async () => { released += 1; },
  } as unknown as LeaseRepository;
  const executor = new NodeLeaseExecutor({ context: { tenantId: 'tenant-a' }, leases, workerId: 'worker-a' });
  await assert.rejects(
    () => executor.execute('r1', 'n1', async () => { throw new Error('node cancelled'); }),
    /node cancelled/,
  );
  assert.equal(released, 1);
});

test('node lease executor heartbeats long-running node work', async () => {
  let renewals = 0;
  const current = lease();
  const leases = {
    acquire: async () => current,
    renew: async () => { renewals += 1; return current; },
    assertCurrent: async () => undefined,
    release: async () => undefined,
  } as unknown as LeaseRepository;
  const executor = new NodeLeaseExecutor({ context: { tenantId: 'tenant-a' }, leases, workerId: 'worker-a', ttlMs: 3_000 });
  await executor.execute('r1', 'n1', async () => {
    await new Promise(resolve => setTimeout(resolve, 1_050));
  });
  assert.ok(renewals >= 1);
});

test('LangGraph compiler applies the same lease boundary to executable nodes', async () => {
  let acquisitions = 0;
  const current = lease();
  const leases = {
    acquire: async () => { acquisitions += 1; return current; },
    renew: async () => current,
    assertCurrent: async () => undefined,
    release: async () => undefined,
  } as unknown as LeaseRepository;
  const workflow: WorkflowDefinition = {
    id: 'lease-graph', name: 'lease graph', version: 1, locked: false,
    globalConfig: { runtime: 'langgraph', structureEditable: true }, createdAt: '', updatedAt: '',
    nodes: [
      { id: 'work', type: 'stage', data: { label: 'work' } },
      { id: 'end', type: 'end', data: { label: 'end' } },
    ],
    edges: [{ id: 'work-end', source: 'work', target: 'end', kind: 'normal' }],
  };
  const app = compileWorkflowDefinition(workflow, {
    nodeLeaseExecutor: new NodeLeaseExecutor({ context: { tenantId: 'tenant-a' }, leases, workerId: 'worker-a' }),
    handlers: { work: async () => ({}) },
  });
  const graph = createInitialGraphState({ runId: 'r1', workflowId: workflow.id, workflowVersion: 1, nodeIds: ['work'], permissionMode: 'default' });
  await app.invoke({ graph }, { configurable: { thread_id: 'r1' } });
  assert.equal(acquisitions, 1);
});

test('branch execution applies a distinct lease per branch node', async () => {
  const acquired: string[] = [];
  const current = lease();
  const leases = {
    acquire: async (_ctx: unknown, key: string) => { acquired.push(key); return { ...current, key }; },
    renew: async (_ctx: unknown, value: Lease) => value,
    assertCurrent: async () => undefined,
    release: async () => undefined,
  } as unknown as LeaseRepository;
  const workflow: BranchWorkflowDefinition = {
    id: 'branch-flow', branchKind: 'project', name: 'branch', version: 1, locked: false,
    globalConfig: { runtime: 'langgraph', structureEditable: true }, createdAt: '', updatedAt: '',
    inputSchema: { branchId: 'string', projectName: 'string', projectRoot: 'string', requirementSlicePath: 'string', upstreamArtifacts: [] },
    nodes: [{ id: 'branch-work', type: 'stage', data: { label: 'work' } }, { id: 'end', type: 'end', data: { label: 'end' } }],
    edges: [],
  };
  const branch = await runBranch({
    graphState: createInitialGraphState({ runId: 'r1', workflowId: 'root', workflowVersion: 1, nodeIds: [], permissionMode: 'default' }),
    branch: { branchId: 'b1', workflowId: workflow.id, projectName: 'project', projectRoot: '/tmp/project', status: 'pending', nodes: {}, artifactIndex: {}, contextManifests: {}, childAgentIds: [], retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 } },
    branchWorkflow: workflow,
    nodeLeaseExecutor: new NodeLeaseExecutor({ context: { tenantId: 'tenant-a' }, leases, workerId: 'worker-a' }),
    handlers: { 'branch-work': async () => ({}) },
  });
  assert.equal(branch.status, 'completed');
  assert.deepEqual(acquired, ['run:r1:node:branch:b1:branch-work']);
});
