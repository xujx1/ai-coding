import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { createEmptyLifecycleState } from '../lifecycle/store.js';
import type { AgentState } from '../persistence/agentTypes.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { getRunPaths } from '../runtime/paths.js';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';
import { FileAgentRepository } from '../storage/file/fileAgentRepository.js';
import { FileArtifactRepository } from '../storage/file/fileArtifactRepository.js';
import { FileEventRepository } from '../storage/file/fileEventRepository.js';
import { FileLifecycleRepository } from '../storage/file/fileLifecycleRepository.js';
import { FileRunRepository } from '../storage/file/fileRunRepository.js';
import { FileWorkflowRepository } from '../storage/file/fileWorkflowRepository.js';

const ctx = { tenantId: 'test-tenant' };
const runId = `file-storage-${Date.now()}`;
const artifactRoot = path.join(getRunPaths(runId).runDir, 'local-artifacts');

test.after(() => {
  fs.rmSync(getRunPaths(runId).runDir, { recursive: true, force: true });
});

test('file repositories preserve run, agent, lifecycle, event, workflow, and artifact contracts', async () => {
  const runs = new FileRunRepository();
  const agents = new FileAgentRepository();
  const lifecycle = new FileLifecycleRepository();
  const events = new FileEventRepository();
  const workflows = new FileWorkflowRepository();
  const artifactMetadata = new FileArtifactRepository();
  const artifacts = new LocalArtifactStore(artifactRoot);

  const state: ExecutionState = {
    runId,
    name: 'File storage contract',
    status: 'idle',
    currentNodeIndex: -1,
    nodes: [],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  const createdRun = await runs.create(ctx, state);
  const loadedRun = await runs.findById(ctx, runId);
  assert.equal(loadedRun?.value.name, state.name);

  state.name = 'File storage contract updated';
  const updatedRun = await runs.save(ctx, state, createdRun.version);
  assert.equal(updatedRun.value.name, 'File storage contract updated');
  await assert.rejects(() => runs.save(ctx, state, createdRun.version), /Concurrent modification/);

  const agent: AgentState = {
    agentRunId: `${runId}-agent`,
    runId,
    nodeId: 'upload-init',
    status: 'created',
    currentModelId: 'test-model',
    currentProviderId: 'test-provider',
    intelligenceLevel: 1,
    modelSwitchHistory: [],
    turnCount: 0,
    tokenUsage: { input: 0, output: 0 },
    compactCount: 0,
    toolCallCount: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
  const createdAgent = await agents.create(ctx, agent);
  const plannedAgent = await agents.savePlan(ctx, agent.agentRunId, {
    title: 'File plan', steps: [], risks: [], createdAt: Date.now(),
  }, createdAgent.version);
  assert.equal(plannedAgent.value.plan?.title, 'File plan');

  const lifecycleState = createEmptyLifecycleState({ requirementId: 'req-file-storage', runId });
  const createdLifecycle = await lifecycle.create(ctx, lifecycleState);
  assert.equal((await lifecycle.findByRunId(ctx, runId))?.version, createdLifecycle.version);

  const firstEvent = await events.append(ctx, {
    id: `${runId}-event-1`, type: 'pipeline_created', runId, timestamp: Date.now(), data: { source: 'test' },
  });
  const secondEvent = await events.append(ctx, {
    id: `${runId}-event-2`, type: 'pipeline_started', runId, timestamp: Date.now() + 1,
  });
  assert.equal(firstEvent.sequence + 1, secondEvent.sequence);
  assert.deepEqual((await events.listByRun(ctx, runId, { afterSequence: firstEvent.sequence })).items.map(item => item.id), [secondEvent.id]);

  const workflow = (await workflows.list(ctx)).items[0];
  assert.ok(workflow?.value.id);

  const temporary = await artifacts.putTemporary(ctx, {
    artifactId: `${runId}-artifact`,
    runId,
    kind: 'test-report',
    contentType: 'text/plain',
    body: Buffer.from('artifact body'),
  });
  const committed = await artifacts.commit(ctx, temporary);
  await artifactMetadata.save(ctx, committed);
  assert.equal((await artifactMetadata.findById(ctx, committed.artifactId))?.committed, true);
  const content = await readStream(await artifacts.read(ctx, committed.storageKey));
  assert.equal(content, 'artifact body');
});

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}
