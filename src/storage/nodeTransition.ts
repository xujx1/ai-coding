import type { LifecycleState } from '../lifecycle/types.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import type { ArtifactObject } from './contracts/artifactStore.js';
import type { IdempotencyKey, StorageContext } from './contracts/common.js';
import { IdempotencyConflictError } from './contracts/common.js';
import type { EventRepository } from './contracts/eventRepository.js';
import type { UnitOfWork } from './contracts/unitOfWork.js';
import type { PipelineEvent } from '../events/types.js';
import type { Lease } from './contracts/leaseRepository.js';
import { logStorageEvent } from './structuredLogging.js';
import * as crypto from 'node:crypto';

export interface NodeTransitionInput {
  run: { state: ExecutionState; expectedVersion: number };
  lifecycle?: { state: LifecycleState; expectedVersion?: number };
  committedArtifacts?: ArtifactObject[];
  event: PipelineEvent;
  idempotency?: IdempotencyKey;
  workerId?: string;
  lease?: Lease;
}

export interface NodeTransitionResult {
  replayed: boolean;
  runVersion?: number;
  lifecycleVersion?: number;
  eventSequence?: number;
}

/**
 * Commits the product read-model side of a node transition together. In
 * PostgreSQL, EventRepository appends the durable event and its outbox row on
 * the same transaction-scoped client.
 */
export class NodeTransitionService {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async commit(ctx: StorageContext, input: NodeTransitionInput): Promise<NodeTransitionResult> {
    if (input.event.runId !== input.run.state.runId) throw new Error('Node transition event runId does not match run state.');
    for (const artifact of input.committedArtifacts ?? []) {
      if (!artifact.committed) throw new Error(`Node transition artifact '${artifact.artifactId}' is not committed.`);
      if (artifact.runId !== input.run.state.runId || artifact.tenantId !== ctx.tenantId) {
        throw new Error(`Node transition artifact '${artifact.artifactId}' does not belong to the transition context.`);
      }
    }
    const transitionCtx: StorageContext = { ...ctx, transactionId: ctx.transactionId ?? `transition-${input.event.id || Date.now()}` };
    logStorageEvent('node_transition_started', transitionContext(transitionCtx, input));
    return this.unitOfWork.transaction(transitionCtx, async repositories => {
      const scope = transitionScope(input);
      if (input.idempotency) {
        const prior = await repositories.leases.findIdempotent(transitionCtx, scope, input.idempotency.key);
        if (prior) {
          if (prior.payloadHash !== input.idempotency.payloadHash) throw new IdempotencyConflictError(scope, input.idempotency.key);
          const committed = prior.result as Omit<NodeTransitionResult, 'replayed'>;
          logStorageEvent('node_transition_replayed', { ...transitionContext(transitionCtx, input), eventSequence: committed.eventSequence });
          return {
            replayed: true,
            runVersion: committed.runVersion,
            lifecycleVersion: committed.lifecycleVersion,
            eventSequence: committed.eventSequence,
          };
        }
      }
      // Check the fencing token using the transaction-scoped repository so a
      // stale Worker cannot commit a terminal transition after lease takeover.
      if (input.lease) await repositories.leases.assertCurrent(transitionCtx, input.lease);
      const run = await repositories.runs.save(transitionCtx, input.run.state, input.run.expectedVersion);
      let lifecycleVersion: number | undefined;
      if (input.lifecycle) {
        const lifecycle = input.lifecycle.expectedVersion === undefined
          ? await repositories.lifecycle.create(transitionCtx, input.lifecycle.state)
          : await repositories.lifecycle.save(transitionCtx, input.lifecycle.state, input.lifecycle.expectedVersion);
        lifecycleVersion = lifecycle.version;
      }
      for (const artifact of input.committedArtifacts ?? []) {
        await repositories.artifacts.save(transitionCtx, artifact);
        await repositories.artifacts.markCommitted(transitionCtx, artifact.artifactId);
      }
      const event = await repositories.events.append(transitionCtx, input.event, input.idempotency);
      const committed = {
        runVersion: run.version,
        lifecycleVersion,
        eventSequence: event.sequence,
      };
      if (input.idempotency) {
        await repositories.leases.recordIdempotent(transitionCtx, {
          scope, key: input.idempotency.key, payloadHash: input.idempotency.payloadHash,
          result: committed, createdAt: Date.now(),
        });
      }
      logStorageEvent('node_transition_committed', { ...transitionContext(transitionCtx, input), eventSequence: event.sequence });
      return {
        replayed: false,
        ...committed,
      };
    });
  }
}

/** Stable command key for retrying one externally submitted node result. */
export function createNodeTransitionIdempotency(event: Pick<PipelineEvent, 'id' | 'runId' | 'nodeId' | 'type' | 'data'>): IdempotencyKey {
  const payload = JSON.stringify({ id: event.id, runId: event.runId, nodeId: event.nodeId, type: event.type, data: event.data ?? null });
  return {
    key: `node-result:${event.runId}:${event.nodeId ?? 'run'}:${event.id}`,
    payloadHash: crypto.createHash('sha256').update(payload).digest('hex'),
  };
}

function transitionScope(input: NodeTransitionInput): string {
  return `node-transition:${input.run.state.runId}:${input.event.nodeId ?? 'run'}`;
}

function transitionContext(ctx: StorageContext, input: NodeTransitionInput) {
  return {
    tenantId: ctx.tenantId, transactionId: ctx.transactionId, runId: input.run.state.runId,
    nodeId: input.event.nodeId, agentRunId: input.event.agentRunId,
    workerId: input.workerId ?? input.lease?.ownerId, leaseKey: input.lease?.key,
    fencingToken: input.lease?.fencingToken,
  };
}
