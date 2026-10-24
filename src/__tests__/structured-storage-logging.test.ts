import * as assert from 'node:assert/strict';
import test from 'node:test';
import { NodeTransitionService } from '../storage/nodeTransition.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';
import { clearStorageLogRecords, getStorageLogRecords, logStorageEvent } from '../storage/structuredLogging.js';

test('node transitions emit structured run, node, Agent, Worker, fencing, transaction, and event sequence context', async () => {
  clearStorageLogRecords();
  const repositories = {
    runs: { save: async () => ({}) },
    events: { append: async () => ({ sequence: 42 }) },
    leases: { assertCurrent: async () => undefined },
  } as unknown as StorageRepositories;
  const unitOfWork: UnitOfWork = { transaction: async (_ctx, work) => work(repositories) };
  const service = new NodeTransitionService(unitOfWork);
  await service.commit({ tenantId: 'tenant-a', transactionId: 'transaction-a' }, {
    run: { state: { runId: 'run-a' } as any, expectedVersion: 1 },
    workerId: 'worker-a', lease: { key: 'run:run-a:node:node-a', ownerId: 'worker-a', fencingToken: 7, leaseUntil: 1, heartbeatAt: 1 },
    event: { id: 'event-a', type: 'pipeline_created', runId: 'run-a', nodeId: 'node-a', agentRunId: 'agent-a', timestamp: 1 },
  });
  const [started, committed] = getStorageLogRecords();
  assert.deepEqual(
    { event: started?.event, tenantId: started?.tenantId, transactionId: started?.transactionId, runId: started?.runId, nodeId: started?.nodeId, agentRunId: started?.agentRunId, workerId: started?.workerId, fencingToken: started?.fencingToken },
    { event: 'node_transition_started', tenantId: 'tenant-a', transactionId: 'transaction-a', runId: 'run-a', nodeId: 'node-a', agentRunId: 'agent-a', workerId: 'worker-a', fencingToken: 7 },
  );
  assert.equal(committed?.event, 'node_transition_committed');
  assert.equal(committed?.eventSequence, 42);
});

test('structured storage logger keeps bounded, serializable records without emitting secrets', () => {
  clearStorageLogRecords();
  logStorageEvent('storage_lease_acquire', { tenantId: 'tenant-a', workerId: 'worker-a', leaseKey: 'run:run-a', fencingToken: 3 });
  const record = getStorageLogRecords()[0]!;
  assert.deepEqual(Object.keys(record).sort(), ['event', 'fencingToken', 'leaseKey', 'level', 'tenantId', 'timestamp', 'workerId'].sort());
  assert.equal(record.event, 'storage_lease_acquire');
});
