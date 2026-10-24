import * as assert from 'node:assert/strict';
import test from 'node:test';
import { RepositoryAgentStatePersistence } from '../storage/agentStatePersistence.js';
import { RepositoryRunStatePersistence } from '../storage/runStatePersistence.js';
import type { AgentState } from '../persistence/agentTypes.js';
import type { AgentRepository } from '../storage/contracts/agentRepository.js';
import type { RunRepository } from '../storage/contracts/runRepository.js';
import { ConcurrentModificationError } from '../storage/contracts/common.js';
import { AgentEngine } from '../agents/core/AgentEngine.js';
import { PipelineEngine } from '../workflows/engine/pipelineEngine.js';
import { PIPELINE_NODES } from '../workflows/definitions/pipelineDefinition.js';
import { createEmptyLifecycleState } from '../lifecycle/store.js';
import { ToolRegistry } from '../tools/base.js';
import type { LLMProvider } from '../models/providers.js';
import type { RegisteredModel } from '../models/registry.js';
import { NodeLeaseExecutor } from '../storage/nodeLeaseExecutor.js';
import type { LeaseRepository } from '../storage/contracts/leaseRepository.js';

function state(status = 'created'): AgentState {
  return {
    agentRunId: 'agent-a', runId: 'run-a', nodeId: 'node-a', status: status as AgentState['status'],
    currentModelId: 'model', currentProviderId: 'provider', intelligenceLevel: 1,
    modelSwitchHistory: [], turnCount: 0, tokenUsage: { input: 0, output: 0 }, compactCount: 0,
    toolCallCount: 0, inputArtifacts: [], outputArtifacts: [], transcriptPath: 'logs/events.ndjson',
    startedAt: 1, updatedAt: 1,
  };
}

test('repository Run persistence creates, loads, and versionedly updates copied state', async () => {
  const execution = {
    runId: 'run-state-a', name: 'run', status: 'idle', currentNodeIndex: -1, nodes: [],
    permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1,
  } as any;
  let stored: any;
  let version = 0;
  const repository = {
    findById: async () => stored ? { runId: stored.runId, tenantId: 'tenant-a', value: stored, version } : null,
    create: async (_ctx: unknown, value: any) => {
      stored = structuredClone(value); version = 1;
      return { runId: value.runId, tenantId: 'tenant-a', value: stored, version };
    },
    save: async (_ctx: unknown, value: any, expectedVersion: number) => {
      assert.equal(expectedVersion, version);
      stored = structuredClone(value); version += 1;
      return { runId: value.runId, tenantId: 'tenant-a', value: stored, version };
    },
  } as unknown as RunRepository;
  const persistence = new RepositoryRunStatePersistence(repository, { tenantId: 'tenant-a' });
  await persistence.save(execution);
  const loaded = await persistence.load(execution.runId);
  assert.deepEqual(loaded, execution);
  await persistence.save({ ...execution, status: 'running' });
  assert.equal(stored.status, 'running');
});

test('Pipeline hydrates and queues its execution state through injected persistence', async () => {
  const persisted = {
    runId: 'pipeline-run-state', name: 'durable', status: 'suspended', currentNodeIndex: -1, nodes: [],
    permissionMode: 'default', modelOverrides: {}, startedAt: 1, updatedAt: 1,
  } as any;
  const saves: any[] = [];
  const pipeline = new PipelineEngine(
    persisted.runId, undefined, undefined, undefined, undefined, undefined,
    {
      load: async () => structuredClone(persisted),
      save: async value => { saves.push(structuredClone(value)); },
    },
  );
  await (pipeline as any).hydrateRunState();
  assert.equal(pipeline.getState().name, 'durable');
  pipeline.getState().status = 'running';
  (pipeline as any).persistExecutionState();
  await (pipeline as any).flushRunState();
  assert.equal(saves[0]?.status, 'running');
});

test('Pipeline hands terminal state, lifecycle, artifacts, and durable event to the atomic transition service', async () => {
  const runId = 'pipeline-atomic-transition';
  let acceptedRunVersion: number | undefined;
  let acceptedLifecycleVersion: number | undefined;
  let committedInput: any;
  const runPersistence = {
    load: async () => null,
    save: async () => {},
    currentVersion: () => 7,
    acceptCommittedVersion: (_runId: string, version: number) => { acceptedRunVersion = version; },
  };
  const lifecyclePersistence = {
    load: async () => null,
    save: async () => {},
    acceptCommittedVersion: (_state: any, version: number) => { acceptedLifecycleVersion = version; },
  };
  const pipeline = new PipelineEngine(
    runId, undefined, undefined, undefined, undefined, lifecyclePersistence, runPersistence,
    {
      context: { tenantId: 'tenant-a' },
      workerId: 'worker-a',
      service: {
        commit: async (_ctx: unknown, input: unknown) => {
          committedInput = input;
          return { replayed: false, runVersion: 8, lifecycleVersion: 4, eventSequence: 11 };
        },
      } as any,
    },
  );
  const node = PIPELINE_NODES[0]!;
  const nodeState = pipeline.getState().nodes.find(item => item.id === node.id)!;
  nodeState.status = 'completed';
  nodeState.completedAt = 100;
  const lifecycle = createEmptyLifecycleState({ runId, requirementId: 'req-atomic' });
  const artifact = {
    artifactId: 'artifact-a', runId, tenantId: 'tenant-a', kind: 'report', storageKey: 'committed/artifact-a',
    contentType: 'text/plain', sizeBytes: 1, sha256: 'a'.repeat(64), retentionClass: 'standard' as const,
    committed: true, createdAt: 1,
  };
  const lease = {
    key: `run:${runId}:node:${node.id}`, ownerId: 'worker-a', fencingToken: 9,
    leaseUntil: Date.now() + 10_000, heartbeatAt: Date.now(),
  };

  await (pipeline as any).commitAtomicNodeTransition({
    node,
    success: true,
    lease,
    lifecycle: { state: lifecycle, expectedVersion: 3 },
    committedArtifacts: [artifact],
  });

  assert.equal(committedInput.run.expectedVersion, 7);
  assert.equal(committedInput.lifecycle.expectedVersion, 3);
  assert.equal(committedInput.committedArtifacts[0].artifactId, artifact.artifactId);
  assert.equal(committedInput.event.type, 'pipeline_node_end');
  assert.equal(committedInput.lease.fencingToken, 9);
  assert.equal(committedInput.idempotency.key.includes(runId), true);
  assert.equal(acceptedRunVersion, 8);
  assert.equal(acceptedLifecycleVersion, 4);
});

test('Pipeline run-level terminal transition reacquires the final node lease and forwards its fencing token', async () => {
  const runId = 'pipeline-finalize-fenced';
  const node = PIPELINE_NODES.at(-1)!;
  const calls: string[] = [];
  const lease = {
    key: `run:${runId}:node:${node.id}`,
    ownerId: 'worker-a',
    fencingToken: 12,
    leaseUntil: Date.now() + 10_000,
    heartbeatAt: Date.now(),
  };
  const leases = {
    acquire: async () => { calls.push('acquire'); return lease; },
    renew: async () => lease,
    assertCurrent: async () => { calls.push('assert'); },
    release: async () => { calls.push('release'); },
  } as unknown as LeaseRepository;
  const pipeline = new PipelineEngine(
    runId,
    undefined,
    undefined,
    new NodeLeaseExecutor({ context: { tenantId: 'tenant-a' }, leases, workerId: 'worker-a' }),
  );
  let committedToken: number | undefined;

  await (pipeline as any).commitPipelineTerminalTransition(node, async (currentLease: typeof lease) => {
    calls.push('commit');
    committedToken = currentLease.fencingToken;
  });

  assert.equal(committedToken, 12);
  assert.deepEqual(calls, ['acquire', 'commit', 'assert', 'release']);
});

test('Pipeline retries a conflict only after reloading an unchanged base snapshot', async () => {
  const runId = 'pipeline-conflict-retry';
  let version = 3;
  let commits = 0;
  let acceptedVersion: number | undefined;
  let base: any;
  const runPersistence = {
    load: async () => { version = 4; return structuredClone(base); },
    save: async () => {},
    currentVersion: () => version,
    currentSnapshot: () => structuredClone(base),
    acceptCommittedVersion: (_runId: string, next: number) => { acceptedVersion = next; },
  };
  const pipeline = new PipelineEngine(
    runId, undefined, undefined, undefined, undefined, undefined, runPersistence,
    {
      context: { tenantId: 'tenant-a' }, workerId: 'worker-a',
      service: {
        commit: async () => {
          commits += 1;
          if (commits === 1) throw new ConcurrentModificationError('run', runId);
          return { replayed: false, runVersion: 5, eventSequence: 1 };
        },
      } as any,
    },
  );
  const node = PIPELINE_NODES[0]!;
  base = structuredClone(pipeline.getState());
  const nodeState = pipeline.getState().nodes.find(item => item.id === node.id)!;
  nodeState.status = 'completed';
  nodeState.completedAt = 100;

  await (pipeline as any).commitAtomicNodeTransition({ node, success: true });
  assert.equal(commits, 2);
  assert.equal(acceptedVersion, 5);
  assert.equal(pipeline.getState().nodes.find(item => item.id === node.id)?.status, 'completed');
});

test('Pipeline refuses to re-submit an old terminal snapshot over a semantic concurrent change', async () => {
  const runId = 'pipeline-conflict-no-last-write-wins';
  let commits = 0;
  let base: any;
  const runPersistence = {
    load: async () => ({ ...structuredClone(base), name: 'concurrent-name' }),
    save: async () => {},
    currentVersion: () => 3,
    currentSnapshot: () => structuredClone(base),
    acceptCommittedVersion: () => { throw new Error('must not accept'); },
  };
  const pipeline = new PipelineEngine(
    runId, undefined, undefined, undefined, undefined, undefined, runPersistence,
    {
      context: { tenantId: 'tenant-a' }, workerId: 'worker-a',
      service: {
        commit: async () => { commits += 1; throw new ConcurrentModificationError('run', runId); },
      } as any,
    },
  );
  const node = PIPELINE_NODES[0]!;
  base = structuredClone(pipeline.getState());
  const nodeState = pipeline.getState().nodes.find(item => item.id === node.id)!;
  nodeState.status = 'completed';
  nodeState.completedAt = 100;

  await assert.rejects(
    () => (pipeline as any).commitAtomicNodeTransition({ node, success: true }),
    /cannot be retried because the reloaded run changed semantically/,
  );
  assert.equal(commits, 1);
  assert.equal(pipeline.getState().name, 'concurrent-name');
});

test('repository Agent persistence creates then versionedly updates a copied state', async () => {
  const calls: string[] = [];
  let stored: AgentState | undefined;
  let version = 0;
  const repository = {
    findById: async () => stored ? { tenantId: 'tenant-a', value: stored, version } : null,
    create: async (_ctx: unknown, value: AgentState) => {
      calls.push('create'); stored = structuredClone(value); version = 1;
      return { tenantId: 'tenant-a', value: stored, version };
    },
    save: async (_ctx: unknown, value: AgentState, expectedVersion: number) => {
      calls.push(`save:${expectedVersion}`); assert.equal(expectedVersion, version);
      stored = structuredClone(value); version += 1;
      return { tenantId: 'tenant-a', value: stored, version };
    },
  } as unknown as AgentRepository;
  const persistence = new RepositoryAgentStatePersistence(repository, { tenantId: 'tenant-a' });
  const first = state();
  await persistence.save(first);
  first.status = 'failed';
  const second = state('running');
  await persistence.save(second);
  assert.deepEqual(calls, ['create', 'save:1']);
  assert.equal(stored?.status, 'running');
});

test('repository Agent persistence rejects a stale snapshot instead of overwriting it', async () => {
  const repository = {
    findById: async () => ({ tenantId: 'tenant-a', value: state(), version: 1 }),
    create: async () => { throw new Error('must not create'); },
    save: async () => { throw new ConcurrentModificationError('agent', 'agent-a'); },
  } as unknown as AgentRepository;
  const persistence = new RepositoryAgentStatePersistence(repository, { tenantId: 'tenant-a' });
  await assert.rejects(() => persistence.save(state('running')), ConcurrentModificationError);
});

test('AgentEngine flushes injected repository persistence before a terminal completion', async () => {
  const saved: AgentState[] = [];
  const provider = {
    createMessage: async () => ({ content: [], stopReason: 'end_turn' }),
    async *createMessageStream() {
      yield { type: 'text_delta' as const, text: 'done' };
      yield { type: 'message_stop' as const, stopReason: 'end_turn' };
    },
  } as LLMProvider;
  const model: RegisteredModel = {
    id: 'test', displayName: 'test', providerId: 'test', contextWindow: 8_000,
    supportsTools: true, supportsStreaming: true, costLevel: 1, speedLevel: 1, intelligenceLevel: 1, recommendedFor: [],
  };
  const engine = new AgentEngine({
    runId: 'run-agent-engine', agentRunId: 'agent-engine', nodeId: 'node', provider, model,
    registry: new ToolRegistry(), systemPrompt: 'test', cwd: process.cwd(), projectDir: process.cwd(), artifactsDir: process.cwd(), runDir: process.cwd(),
    persistence: { save: async value => { saved.push(structuredClone(value)); } },
  });
  for await (const _event of engine.run('complete')) { /* consume terminal stream */ }
  assert.ok(saved.length >= 2);
  assert.equal(saved.at(-1)?.status, 'completed');
});
