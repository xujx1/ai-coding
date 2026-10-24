import * as assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import { createEmptyLifecycleState } from '../lifecycle/store.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { createNodeTransitionIdempotency, NodeTransitionService } from '../storage/nodeTransition.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { PostgresUnitOfWork, postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';
import { clearStorageLogRecords, getStorageLogRecords } from '../storage/structuredLogging.js';

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL node transitions atomically save run, lifecycle, artifacts, event, and outbox', { skip: !databaseUrl }, async () => {
  const database = new PostgresDatabase({ ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false });
  const ctx = { tenantId: `node-transition-${Date.now()}` };
  const runId = `node-transition-run-${Date.now()}`;
  const initial: ExecutionState = { runId, name: 'Transition', status: 'running', currentNodeIndex: 0, currentNodeId: 'node', nodes: [{ id: 'node', name: 'Node', status: 'running', failureCount: 0 }], permissionMode: 'default', modelOverrides: {}, startedAt: Date.now(), updatedAt: Date.now() };
  await runStorageMigrations(database);
  const repos = postgresRepositories(database);
  const created = await repos.runs.create(ctx, initial);
  const currentLease = await repos.leases.acquire(ctx, `run:${runId}:node:node`, 'worker-transition', 10_000);
  assert.ok(currentLease);
  const lifecycle = createEmptyLifecycleState({ runId, requirementId: 'req-transition' });
  await repos.lifecycle.create(ctx, lifecycle);
  const service = new NodeTransitionService(new PostgresUnitOfWork(database));
  try {
    clearStorageLogRecords();
    const terminal = structuredClone(initial);
    terminal.status = 'completed';
    terminal.nodes[0]!.status = 'completed';
    terminal.completedAt = Date.now();
    const nextLifecycle = structuredClone(lifecycle);
    nextLifecycle.status = 'completed';
    nextLifecycle.phase = 'completed';
    const completedEvent = { id: `${runId}-completed`, type: 'pipeline_completed' as const, runId, timestamp: Date.now() };
    const idempotency = createNodeTransitionIdempotency(completedEvent);
    const committed = await service.commit(ctx, {
      run: { state: terminal, expectedVersion: created.version }, lifecycle: { state: nextLifecycle, expectedVersion: 1 },
      workerId: 'worker-transition', lease: currentLease!,
      committedArtifacts: [{ artifactId: `${runId}-artifact`, runId, tenantId: ctx.tenantId, kind: 'report', storageKey: `committed/${ctx.tenantId}/${runId}/report`, contentType: 'text/plain', sizeBytes: 1, sha256: 'a'.repeat(64), retentionClass: 'standard', committed: true, createdAt: Date.now() }],
      event: completedEvent, idempotency,
    });
    assert.equal(committed.replayed, false);
    assert.equal(committed.runVersion, 2);
    assert.equal(committed.lifecycleVersion, 2);
    assert.equal(committed.eventSequence, 1);
    assert.equal((await repos.runs.findById(ctx, runId))?.value.status, 'completed');
    assert.equal((await repos.lifecycle.findByRunId(ctx, runId))?.value.status, 'completed');
    assert.equal((await repos.artifacts.findById(ctx, `${runId}-artifact`))?.committed, true);
    assert.equal((await repos.events.listByRun(ctx, runId)).items[0]?.type, 'pipeline_completed');
    assert.equal((await database.query('SELECT 1 FROM outbox_events WHERE tenant_id = $1 AND run_id = $2', [ctx.tenantId, runId])).rowCount, 1);
    const logs = getStorageLogRecords();
    const committedLog = logs.find(record => record.event === 'node_transition_committed');
    const appendedLog = logs.find(record => record.event === 'storage_event_appended');
    assert.equal(committedLog?.runId, runId);
    assert.equal(committedLog?.workerId, 'worker-transition');
    assert.equal(committedLog?.fencingToken, currentLease!.fencingToken);
    assert.equal(committedLog?.eventSequence, 1);
    assert.equal(typeof committedLog?.transactionId, 'string');
    assert.equal(appendedLog?.transactionId, committedLog?.transactionId);

    // A stale retry with the same stable command key returns the prior result
    // instead of applying a second state transition or event.
    const replayed = await service.commit(ctx, {
      run: { state: terminal, expectedVersion: created.version }, lifecycle: { state: nextLifecycle, expectedVersion: 1 },
      event: completedEvent, idempotency,
    });
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.runVersion, committed.runVersion);
    assert.equal(replayed.lifecycleVersion, committed.lifecycleVersion);
    assert.equal(replayed.eventSequence, 1);
    assert.equal((await repos.events.listByRun(ctx, runId)).items.length, 1);
    await assert.rejects(() => service.commit(ctx, {
      run: { state: terminal, expectedVersion: created.version }, event: completedEvent,
      idempotency: { ...idempotency, payloadHash: 'b'.repeat(64) },
    }), /reused with a different payload/);

    const rollback = structuredClone(terminal);
    rollback.name = 'must-roll-back';
    await assert.rejects(() => service.commit(ctx, {
      run: { state: rollback, expectedVersion: 2 }, lifecycle: { state: nextLifecycle, expectedVersion: 99 },
      event: { id: `${runId}-rollback`, type: 'pipeline_completed', runId, timestamp: Date.now() },
    }), /Concurrent modification/);
    assert.equal((await repos.runs.findById(ctx, runId))?.value.name, 'Transition');
    assert.equal((await repos.events.listByRun(ctx, runId)).items.length, 1);

    await repos.leases.release(ctx, currentLease!);
    const takeover = await repos.leases.acquire(ctx, currentLease!.key, 'worker-takeover', 10_000);
    assert.ok(takeover);
    const stale = structuredClone(terminal);
    stale.name = 'stale-worker-must-not-commit';
    await assert.rejects(() => service.commit(ctx, {
      run: { state: stale, expectedVersion: 2 }, lease: currentLease!,
      event: { id: `${runId}-stale`, type: 'pipeline_completed', runId, timestamp: Date.now() },
    }), /no longer current/);
    assert.equal((await repos.runs.findById(ctx, runId))?.value.name, 'Transition');
    assert.equal((await repos.events.listByRun(ctx, runId)).items.length, 1);
  } finally {
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [ctx.tenantId, runId]);
    await database.close();
  }
});
