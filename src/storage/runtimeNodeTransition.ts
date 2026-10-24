import type { EventType } from '../events/types.js';
import type { LifecycleState } from '../lifecycle/types.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import type { ArtifactObject } from './contracts/artifactStore.js';
import type { StorageContext } from './contracts/common.js';
import type { Lease } from './contracts/leaseRepository.js';
import type { LifecycleRepository } from './contracts/lifecycleRepository.js';
import type { RunRepository } from './contracts/runRepository.js';
import {
  createNodeTransitionIdempotency,
  type NodeTransitionResult,
  type NodeTransitionService,
} from './nodeTransition.js';

export type WorkflowRuntimeKind = 'legacy' | 'langgraph' | 'testing';

export interface FencedRuntimeTransitionInput {
  runtime: WorkflowRuntimeKind;
  runId: string;
  nodeId: string;
  transitionId: string;
  lease: Lease;
  updateRun: (current: ExecutionState) => ExecutionState;
  lifecycle?: LifecycleState;
  includeCurrentLifecycle?: boolean;
  committedArtifacts?: ArtifactObject[];
  eventType?: EventType;
  eventData?: Record<string, unknown>;
  timestamp?: number;
}

/**
 * Shared product-state commit boundary for every workflow runtime.
 *
 * Runtime-specific checkpoints and workspace files remain recovery caches.
 * The externally visible run, lifecycle, artifact metadata, durable event and
 * outbox record are committed by NodeTransitionService under the current
 * fencing token.
 */
export class FencedRuntimeTransitionCommitter {
  constructor(private readonly dependencies: {
    service: NodeTransitionService;
    runs: RunRepository;
    lifecycle: LifecycleRepository;
    context: StorageContext;
    workerId: string;
  }) {}

  async loadRun(runId: string): Promise<ExecutionState | null> {
    const current = await this.dependencies.runs.findById(this.dependencies.context, runId);
    return current ? structuredClone(current.value) : null;
  }

  async commit(input: FencedRuntimeTransitionInput): Promise<NodeTransitionResult> {
    const currentRun = await this.dependencies.runs.findById(this.dependencies.context, input.runId);
    if (!currentRun) throw new Error(`Run '${input.runId}' does not exist for ${input.runtime} transition '${input.nodeId}'.`);

    const nextRun = input.updateRun(structuredClone(currentRun.value));
    if (nextRun.runId !== input.runId) throw new Error('Runtime transition cannot change the run ID.');

    let lifecycle: { state: LifecycleState; expectedVersion?: number } | undefined;
    if (input.lifecycle) {
      const current = await this.dependencies.lifecycle.findByRunId(this.dependencies.context, input.runId);
      lifecycle = { state: structuredClone(input.lifecycle), expectedVersion: current?.version };
    } else if (input.includeCurrentLifecycle) {
      const current = await this.dependencies.lifecycle.findByRunId(this.dependencies.context, input.runId);
      if (current) lifecycle = { state: structuredClone(current.value), expectedVersion: current.version };
    }

    const timestamp = input.timestamp ?? Date.now();
    const event = {
      id: input.transitionId,
      type: input.eventType ?? 'pipeline_node_end' as const,
      runId: input.runId,
      nodeId: input.nodeId,
      timestamp,
      data: {
        runtime: input.runtime,
        nodeId: input.nodeId,
        ...input.eventData,
      },
    };

    return this.dependencies.service.commit(this.dependencies.context, {
      run: { state: nextRun, expectedVersion: currentRun.version },
      lifecycle,
      committedArtifacts: uniqueArtifacts(input.committedArtifacts ?? []),
      event,
      idempotency: createNodeTransitionIdempotency(event),
      workerId: this.dependencies.workerId,
      lease: input.lease,
    });
  }
}

function uniqueArtifacts(artifacts: ArtifactObject[]): ArtifactObject[] {
  return [...new Map(artifacts.map(artifact => [artifact.artifactId, artifact])).values()];
}
