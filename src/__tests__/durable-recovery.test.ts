import * as assert from 'node:assert/strict';
import test from 'node:test';
import { decideDurableRecovery } from '../storage/recovery.js';
import { recoverDurableRuns } from '../storage/recovery.js';

test('durable recovery waits for active leases and only resumes checkpointed runs', async () => {
  const runs: any = {
    list: async () => ({ items: [
      { runId: 'leased', value: state('leased') },
      { runId: 'checkpointed', value: state('checkpointed') },
      { runId: 'unrecoverable', value: state('unrecoverable') },
    ] }),
  };
  const leases: any = {
    find: async (_ctx: unknown, key: string) => key.includes('leased') ? { key, leaseUntil: 101 } : null,
  };
  const decisions = await decideDurableRecovery({
    context: { tenantId: 'tenant' }, runs, leases, now: () => 100,
    checkpointExists: async runId => runId === 'checkpointed',
  });
  assert.deepEqual(decisions, [
    { runId: 'leased', action: 'wait_for_active_lease', activeLeaseKeys: ['run:leased:node:node'] },
    { runId: 'checkpointed', action: 'resume_from_checkpoint' },
    { runId: 'unrecoverable', action: 'suspend_needs_operator', reason: 'No active lease or durable checkpoint was found.' },
  ]);
});

test('durable recovery resumes checkpoints and versionedly suspends only runs needing an operator', async () => {
  const states = new Map<string, any>([
    ['resume', { runId: 'resume', status: 'running', nodes: [] }],
    ['suspend', { runId: 'suspend', status: 'running', nodes: [] }],
  ]);
  const events: any[] = [];
  const runs = {
    list: async () => ({ items: [...states.values()].map(value => ({ runId: value.runId, value, version: 1 })) }),
    findById: async (_ctx: unknown, runId: string) => states.has(runId) ? { runId, value: states.get(runId), version: 1 } : null,
    save: async (_ctx: unknown, value: any) => { states.set(value.runId, value); return { runId: value.runId, value, version: 2 }; },
  } as any;
  const decisions = await recoverDurableRuns({
    context: { tenantId: 'tenant' }, runs, events: { append: async (_ctx: unknown, event: any) => { events.push(event); return event; } } as any,
    leases: { find: async () => null }, checkpointExists: async runId => runId === 'resume',
    resumeFromCheckpoint: async runId => runId === 'resume',
  });
  assert.deepEqual(decisions.map(item => item.action).sort(), ['resume_from_checkpoint', 'suspend_needs_operator']);
  assert.equal(states.get('resume').status, 'running');
  assert.equal(states.get('suspend').status, 'suspended');
  assert.deepEqual(events.map(event => event.data), [{ reason: 'No active lease or durable checkpoint was found.', recovery: 'durable' }]);
});

function state(runId: string): any {
  return { runId, status: 'running', nodes: [{ id: 'node', status: 'running' }] };
}
