import * as assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyLifecycleState } from '../lifecycle/store.js';
import type { AgentState } from '../persistence/agentTypes.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';

const databaseUrl = process.env.DATABASE_URL;
const runId = `postgres-contract-${Date.now()}`;
const ctx = { tenantId: `postgres-contract-${Date.now()}` };

test('PostgreSQL repositories satisfy the durable storage contract in an isolated transaction', { skip: !databaseUrl }, async () => {
  const database = new PostgresDatabase({
    ...DEFAULT_STORAGE_CONFIG,
    databaseUrl,
    databaseSsl: false,
  });
  await runStorageMigrations(database);

  const rollback = new Error('rollback PostgreSQL contract fixture');
  await assert.rejects(database.transaction(async client => {
    const { agents, artifacts, events, leases, lifecycle, runs, workflows } = postgresRepositories(client);
    const state: ExecutionState = {
      runId,
      name: 'PostgreSQL storage contract',
      status: 'idle',
      currentNodeIndex: -1,
      nodes: [],
      permissionMode: 'default',
      modelOverrides: {},
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    const createdRun = await runs.create(ctx, state);
    assert.equal((await runs.findById(ctx, runId))?.value.name, state.name);

    state.name = 'PostgreSQL storage contract updated';
    const updatedRun = await runs.save(ctx, state, createdRun.version);
    assert.equal(updatedRun.value.name, state.name);
    await assert.rejects(() => runs.save(ctx, state, createdRun.version), /Concurrent modification/);

    const agent: AgentState = {
      agentRunId: `${runId}-agent`, runId, nodeId: 'upload-init', status: 'created',
      currentModelId: 'test-model', currentProviderId: 'test-provider', intelligenceLevel: 1,
      modelSwitchHistory: [], turnCount: 0, tokenUsage: { input: 0, output: 0 },
      compactCount: 0, toolCallCount: 0, startedAt: Date.now(), updatedAt: Date.now(),
    };
    const createdAgent = await agents.create(ctx, agent);
    const planned = await agents.savePlan(ctx, agent.agentRunId, {
      title: 'PostgreSQL plan', steps: [], risks: [], createdAt: Date.now(),
    }, createdAgent.version);
    assert.equal(planned.value.plan?.title, 'PostgreSQL plan');

    const lifecycleState = createEmptyLifecycleState({ requirementId: 'req-postgres-storage', runId });
    const createdLifecycle = await lifecycle.create(ctx, lifecycleState);
    assert.equal((await lifecycle.findByRunId(ctx, runId))?.version, createdLifecycle.version);

    const first = await events.append(ctx, {
      id: `${runId}-event-1`, type: 'pipeline_created', runId, timestamp: Date.now(), data: { source: 'test' },
    });
    const second = await events.append(ctx, {
      id: `${runId}-event-2`, type: 'pipeline_started', runId, timestamp: Date.now() + 1,
    });
    assert.equal(first.sequence + 1, second.sequence);
    assert.deepEqual((await events.listByRun(ctx, runId, { afterSequence: first.sequence })).items.map(event => event.id), [second.id]);

    const workflow = await workflows.save(ctx, {
      id: `${runId}-workflow`, name: 'PostgreSQL workflow', version: 1, locked: false,
      nodes: [], edges: [], globalConfig: { runtime: 'legacy', structureEditable: true },
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    assert.equal((await workflows.findById(ctx, workflow.value.id))?.version, workflow.version);

    const artifact = await artifacts.save(ctx, {
      artifactId: `${runId}-artifact`, runId, tenantId: ctx.tenantId, kind: 'test-report',
      storageKey: `temporary/${runId}`, contentType: 'text/plain', sizeBytes: 13,
      sha256: '0'.repeat(64), retentionClass: 'standard', committed: false, createdAt: Date.now(),
    });
    assert.equal((await artifacts.markCommitted(ctx, artifact.artifactId)).committed, true);

    const lease = await leases.acquire(ctx, `run:${runId}:node:upload-init`, 'worker-a', 30_000);
    assert.ok(lease);
    assert.equal(await leases.acquire(ctx, lease!.key, 'worker-b', 30_000), null);
    assert.equal((await leases.renew(ctx, lease!, 30_000))?.fencingToken, lease!.fencingToken);
    await leases.recordIdempotent(ctx, { scope: 'contract', key: runId, payloadHash: 'hash', result: { ok: true }, createdAt: Date.now() });
    assert.deepEqual((await leases.findIdempotent(ctx, 'contract', runId))?.result, { ok: true });

    throw rollback;
  }), error => error === rollback);

  assert.equal((await postgresRepositories(database).runs.findById(ctx, runId)), null);
  await database.close();
});
