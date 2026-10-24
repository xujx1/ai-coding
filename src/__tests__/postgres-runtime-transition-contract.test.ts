import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import { createEmptyLifecycleState } from '../lifecycle/store.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { getConfig } from '../config/index.js';
import { NodeLeaseExecutor } from '../storage/nodeLeaseExecutor.js';
import { NodeTransitionService } from '../storage/nodeTransition.js';
import { FencedRuntimeTransitionCommitter } from '../storage/runtimeNodeTransition.js';
import { RepositoryLifecycleStatePersistence } from '../storage/lifecycleStatePersistence.js';
import { ArtifactManager } from '../storage/artifactManager.js';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';
import { createPipelineArtifactWriter } from '../storage/pipelineArtifactWriter.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { PostgresUnitOfWork, postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';
import { compileWorkflowDefinition } from '../workflows/runtime/langgraph/compiler.js';
import { createInitialGraphState } from '../workflows/runtime/langgraph/state.js';
import { createTestingWorkflowRuntime } from '../workflows/runtime/testing/testingWorkflowRuntime.js';
import type { WorkflowDefinition } from '../workflows/types.js';

const databaseUrl = process.env.DATABASE_URL;

test('Legacy, LangGraph, and Testing use one fenced atomic product-transition contract', { skip: !databaseUrl }, async () => {
  const database = new PostgresDatabase({ ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false });
  const tenantId = `runtime-contract-${Date.now()}`;
  const context = { tenantId };
  const unitOfWork = new PostgresUnitOfWork(database);
  const repositories = postgresRepositories(database);
  const transitions = new FencedRuntimeTransitionCommitter({
    service: new NodeTransitionService(unitOfWork),
    runs: repositories.runs,
    lifecycle: repositories.lifecycle,
    context,
    workerId: 'runtime-contract-worker',
  });
  const leases = new NodeLeaseExecutor({
    context,
    leases: repositories.leases,
    workerId: 'runtime-contract-worker',
    ttlMs: 10_000,
  });
  const langGraphRunId = `langgraph-contract-${Date.now()}`;
  const testingRunId = `testing-contract-${Date.now()}`;
  const artifactRoot = path.join(getConfig().runtimeDir, 'test-artifact-store', tenantId);
  const artifactWriter = createPipelineArtifactWriter(
    new ArtifactManager(new LocalArtifactStore(artifactRoot), unitOfWork),
    context,
    { deferMetadata: true },
  );
  await runStorageMigrations(database);

  try {
    const workflow: WorkflowDefinition = {
      id: 'runtime-contract', name: 'Runtime contract', version: 1, locked: false,
      globalConfig: { runtime: 'langgraph', structureEditable: true }, createdAt: '', updatedAt: '',
      nodes: [
        { id: 'work', type: 'stage', data: { label: 'Work' } },
        { id: 'end', type: 'end', data: { label: 'End' } },
      ],
      edges: [{ id: 'work-end', source: 'work', target: 'end', kind: 'normal' }],
    };
    const graph = createInitialGraphState({
      runId: langGraphRunId,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      nodeIds: ['work'],
      permissionMode: 'default',
    });
    await repositories.runs.create(context, executionState(langGraphRunId, 'work'));
    await repositories.lifecycle.create(context, createEmptyLifecycleState({ runId: langGraphRunId, requirementId: 'req-langgraph' }));
    const langGraphArtifactPath = 'artifacts/runtime-contract/langgraph-report.json';
    const langGraphArtifactFile = path.join(getConfig().runtimeDir, 'runs', langGraphRunId, langGraphArtifactPath);
    fs.mkdirSync(path.dirname(langGraphArtifactFile), { recursive: true });
    fs.writeFileSync(langGraphArtifactFile, JSON.stringify({ runtime: 'langgraph' }));
    const app = compileWorkflowDefinition(workflow, {
      nodeLeaseExecutor: leases,
      transitionCommitter: transitions,
      artifactWriter,
      handlers: {
        work: async () => ({
          artifactIndex: { work: [langGraphArtifactPath] },
          nodes: { work: { status: 'completed', completedAt: Date.now(), outputArtifacts: [langGraphArtifactPath] } },
        }),
      },
    });
    await app.invoke({ graph }, { configurable: { thread_id: langGraphRunId } });

    const langGraphRun = await repositories.runs.findById(context, langGraphRunId);
    assert.equal(langGraphRun?.value.nodes[0]?.status, 'completed');
    assert.equal(langGraphRun?.value.metadata?.lastGraphSyncReason, 'langgraph-node:work');
    const langGraphEvents = await repositories.events.listByRun(context, langGraphRunId);
    assert.equal(langGraphEvents.items.length, 1);
    assert.equal(langGraphEvents.items[0]?.data?.runtime, 'langgraph');
    assert.equal(await outboxCount(database, tenantId, langGraphRunId), 1);
    assert.equal((await repositories.artifacts.listByRun(context, langGraphRunId)).items.length, 1);

    const testingLifecycle = createEmptyLifecycleState({ runId: testingRunId, requirementId: 'req-testing' });
    await repositories.runs.create(context, executionState(testingRunId, 'pipeline-work'));
    await repositories.lifecycle.create(context, testingLifecycle);
    const testing = createTestingWorkflowRuntime({
      nodeLeaseExecutor: leases,
      transitionCommitter: transitions,
      lifecyclePersistence: new RepositoryLifecycleStatePersistence(repositories.lifecycle, context, unitOfWork),
      artifactWriter,
    });
    const testingResult = await testing.start({
      runId: testingRunId,
      requirementId: 'req-testing',
      workflowInstanceId: 'testing-contract-workflow',
      autoApproveReviews: true,
      dryRunExecution: true,
      stopAfterNode: 'generate_strategy',
    });
    assert.equal(testingResult.state.nodes.find(node => node.nodeId === 'generate_strategy')?.status, 'succeeded');
    const testingRun = await repositories.runs.findById(context, testingRunId);
    const testingReadModels = testingRun?.value.metadata?.testingWorkflows as Record<string, { currentNodeId: string }>;
    assert.equal(testingReadModels['testing-contract-workflow']?.currentNodeId, 'review_strategy');
    const testingEvents = await repositories.events.listByRun(context, testingRunId);
    assert.equal(testingEvents.items.length, 3);
    assert.equal(testingEvents.items[0]?.data?.runtime, 'testing');
    assert.equal(await outboxCount(database, tenantId, testingRunId), 3);
    const testingArtifacts = await repositories.artifacts.listByRun(context, testingRunId);
    assert.equal(testingArtifacts.items.length, 1);
    assert.equal(testingArtifacts.items[0]?.artifactId, testingResult.context.refs[0]?.artifactId);

    // Once another Worker owns the lease, the old token cannot alter any of
    // the shared run/lifecycle/event/outbox state.
    const stale = await repositories.leases.acquire(context, `run:${langGraphRunId}:node:stale-check`, 'stale-worker', 10_000);
    assert.ok(stale);
    await repositories.leases.release(context, stale!);
    const takeover = await repositories.leases.acquire(context, stale!.key, 'takeover-worker', 10_000);
    assert.ok(takeover);
    const beforeRun = await repositories.runs.findById(context, langGraphRunId);
    const beforeLifecycle = await repositories.lifecycle.findByRunId(context, langGraphRunId);
    const beforeEvents = await repositories.events.listByRun(context, langGraphRunId);
    const beforeOutbox = await outboxCount(database, tenantId, langGraphRunId);
    await assert.rejects(() => transitions.commit({
      runtime: 'langgraph',
      runId: langGraphRunId,
      nodeId: 'stale-check',
      transitionId: `langgraph:${langGraphRunId}:stale-check:completed`,
      lease: stale!,
      updateRun: current => ({ ...current, name: 'stale-worker-must-not-commit' }),
      includeCurrentLifecycle: true,
      eventData: { status: 'completed' },
    }), /no longer current/);
    assert.deepEqual(await repositories.runs.findById(context, langGraphRunId), beforeRun);
    assert.deepEqual(await repositories.lifecycle.findByRunId(context, langGraphRunId), beforeLifecycle);
    assert.deepEqual(await repositories.events.listByRun(context, langGraphRunId), beforeEvents);
    assert.equal(await outboxCount(database, tenantId, langGraphRunId), beforeOutbox);
  } finally {
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = ANY($2::text[])', [tenantId, [langGraphRunId, testingRunId]]);
    await database.close();
    fs.rmSync(artifactRoot, { recursive: true, force: true });
    for (const runId of [langGraphRunId, testingRunId]) {
      fs.rmSync(path.join(getConfig().runtimeDir, 'runs', runId), { recursive: true, force: true });
    }
  }
});

function executionState(runId: string, nodeId: string): ExecutionState {
  const now = Date.now();
  return {
    runId,
    name: runId,
    status: 'running',
    currentNodeIndex: 0,
    currentNodeId: nodeId,
    nodes: [{ id: nodeId, name: nodeId, status: 'pending', failureCount: 0 }],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: now,
    updatedAt: now,
  };
}

async function outboxCount(database: PostgresDatabase, tenantId: string, runId: string): Promise<number> {
  const result = await database.query<{ count: string }>(
    'SELECT count(*)::text AS count FROM outbox_events WHERE tenant_id = $1 AND run_id = $2',
    [tenantId, runId],
  );
  return Number(result.rows[0]?.count ?? 0);
}
