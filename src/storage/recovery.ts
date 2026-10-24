import type { ExecutionState } from '../persistence/executionTypes.js';
import type { LeaseRepository } from './contracts/leaseRepository.js';
import type { StorageContext } from './contracts/common.js';
import type { RunRepository } from './contracts/runRepository.js';
import type { EventRepository } from './contracts/eventRepository.js';
import { retryOnConflict } from './conflictRetry.js';
import { nanoid } from 'nanoid';

export type DurableRecoveryDecision =
  | { runId: string; action: 'wait_for_active_lease'; activeLeaseKeys: string[] }
  | { runId: string; action: 'resume_from_checkpoint' }
  | { runId: string; action: 'suspend_needs_operator'; reason: string };

/**
 * Recovery is a decision phase. It never rewrites a running run merely
 * because one API process restarted; current leases and checkpoint existence
 * remain the durable authority.
 */
export async function decideDurableRecovery(args: {
  context: StorageContext;
  runs: RunRepository;
  leases: Pick<LeaseRepository, 'find'>;
  checkpointExists: (runId: string) => Promise<boolean>;
  now?: () => number;
}): Promise<DurableRecoveryDecision[]> {
  const now = args.now ?? Date.now;
  const records = await listRunning(args.runs, args.context);
  const decisions: DurableRecoveryDecision[] = [];
  for (const record of records) {
    const keys = record.value.nodes.filter(node => node.status === 'running')
      .map(node => `run:${record.runId}:node:${node.id}`);
    const leases = await Promise.all(keys.map(key => args.leases.find(args.context, key)));
    const activeLeaseKeys = leases.filter((lease): lease is NonNullable<typeof lease> => Boolean(lease && lease.leaseUntil > now()))
      .map(lease => lease.key);
    if (activeLeaseKeys.length) {
      decisions.push({ runId: record.runId, action: 'wait_for_active_lease', activeLeaseKeys });
    } else if (await args.checkpointExists(record.runId)) {
      decisions.push({ runId: record.runId, action: 'resume_from_checkpoint' });
    } else {
      decisions.push({ runId: record.runId, action: 'suspend_needs_operator', reason: 'No active lease or durable checkpoint was found.' });
    }
  }
  return decisions;
}

/** Executes recovery decisions without treating an API restart as a failure. */
export async function recoverDurableRuns(args: {
  context: StorageContext;
  runs: RunRepository;
  events: EventRepository;
  leases: Pick<LeaseRepository, 'find'>;
  checkpointExists: (runId: string) => Promise<boolean>;
  resumeFromCheckpoint: (runId: string) => Promise<boolean>;
}): Promise<DurableRecoveryDecision[]> {
  const decisions = await decideDurableRecovery(args);
  for (const decision of decisions) {
    if (decision.action === 'resume_from_checkpoint') {
      const resumed = await args.resumeFromCheckpoint(decision.runId);
      if (resumed) continue;
      await suspendForOperator(args, decision.runId, 'Durable checkpoint disappeared before recovery could resume the run.');
    } else if (decision.action === 'suspend_needs_operator') {
      await suspendForOperator(args, decision.runId, decision.reason);
    }
  }
  return decisions;
}

async function suspendForOperator(args: Pick<Parameters<typeof recoverDurableRuns>[0], 'context' | 'runs' | 'events'>, runId: string, reason: string): Promise<void> {
  await retryOnConflict(async () => {
    const record = await args.runs.findById(args.context, runId);
    if (!record || record.value.status !== 'running') return;
    const state = { ...record.value, status: 'suspended' as const, updatedAt: Date.now() };
    await args.runs.save(args.context, state, record.version);
    await args.events.append(args.context, {
      id: nanoid(), type: 'session_suspended', runId, timestamp: Date.now(), data: { reason, recovery: 'durable' },
    });
  });
}

async function listRunning(runs: RunRepository, context: StorageContext) {
  const records: Array<{ runId: string; value: ExecutionState }> = [];
  let cursor: string | undefined;
  do {
    const page = await runs.list(context, { statuses: ['running'], cursor, limit: 250 });
    records.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return records;
}
