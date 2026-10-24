import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { getConfig } from '../config/index.js';
import { getStateStore } from '../persistence/stateStore.js';
import { saveWorkflowDefinition } from '../workflows/storage.js';
import { createBuiltInMrdToCodeWorkflow } from '../workflows/builtinDefinitions.js';
import {
  getLangGraphRuntime,
  langGraphRunConfig,
  recoverPostgresRuntimeForRun,
} from '../workflows/runtime/langgraph/runtime.js';
import { createPostgresCheckpointer } from '../workflows/runtime/langgraph/checkpointer.js';

const enabled = Boolean(process.env.DATABASE_URL);

test('PostgreSQL runtime recovery reconciles the product read model before resume', { skip: !enabled }, async () => {
  const previousStorageDriver = process.env.AI_CODING_STORAGE_DRIVER;
  const previousCheckpointer = process.env.AI_CODING_LANGGRAPH_CHECKPOINTER;
  process.env.AI_CODING_STORAGE_DRIVER = 'postgres';
  process.env.AI_CODING_LANGGRAPH_CHECKPOINTER = 'postgres';
  const runId = `postgres-runtime-${Date.now()}`;
  const workflowId = `postgres-runtime-workflow-${Date.now()}`;
  const workflow = {
    ...createBuiltInMrdToCodeWorkflow(),
    id: workflowId,
    name: 'PostgreSQL recovery fixture',
    locked: false,
    globalConfig: { runtime: 'langgraph' as const, structureEditable: false },
  };
  const workflowPath = path.join(getConfig().runtimeDir, 'workflows', `${workflowId}.json`);
  assert.equal(saveWorkflowDefinition(workflow).valid, true);

  try {
    await getLangGraphRuntime().start(runId, { workflowId });
    const persisted = await createPostgresCheckpointer(process.env.DATABASE_URL!);
    assert.ok(await persisted.getTuple(langGraphRunConfig(runId)), 'start must persist a PostgreSQL checkpoint');
    await persisted.end();
    assert.equal(await recoverPostgresRuntimeForRun(runId), true);
    const recovered = getStateStore(runId).loadExecutionState();
    assert.equal(recovered?.metadata?.lastGraphSyncReason, 'postgres-checkpoint-recovery');

    const resumed = await getLangGraphRuntime().resume(runId, { approved: true });
    assert.ok(['running', 'waiting_confirmation', 'completed'].includes(resumed.status));
    assert.equal(getStateStore(runId).loadExecutionState()?.status, resumed.status);
  } finally {
    fs.rmSync(workflowPath, { force: true });
    fs.rmSync(path.join(getConfig().runtimeDir, 'runs', runId), { recursive: true, force: true });
    if (previousStorageDriver === undefined) delete process.env.AI_CODING_STORAGE_DRIVER;
    else process.env.AI_CODING_STORAGE_DRIVER = previousStorageDriver;
    if (previousCheckpointer === undefined) delete process.env.AI_CODING_LANGGRAPH_CHECKPOINTER;
    else process.env.AI_CODING_LANGGRAPH_CHECKPOINTER = previousCheckpointer;
  }
});
