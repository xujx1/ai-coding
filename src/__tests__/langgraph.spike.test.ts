import * as assert from 'assert/strict';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import {
  collectSpikeStreamEvents,
  readLatestSpikeFileCheckpoint,
  resumeLangGraphSpike,
  startLangGraphSpike,
  writeSpikeFileCheckpoint,
} from '../langgraph/spike.js';

test('LangGraph spike starts, interrupts, resumes, and completes with thread_id = runId', async () => {
  const runId = 'spike-run-1';
  const { app, firstResult, waitingState } = await startLangGraphSpike(runId);

  assert.equal(firstResult.runId, runId);
  assert.equal(firstResult.status, 'prepared');
  assert.deepEqual(firstResult.events, [`prepare:${runId}`]);
  assert.deepEqual(waitingState.next, ['approval']);
  assert.equal(waitingState.config.configurable?.thread_id, runId);
  assert.equal(waitingState.tasks[0]?.interrupts[0]?.value.nodeId, 'approval');

  const resumed = await resumeLangGraphSpike(app, runId, {
    approved: true,
  });

  assert.equal(resumed.runId, runId);
  assert.equal(resumed.status, 'completed');
  assert.equal(resumed.approved, true);
  assert.deepEqual(resumed.events, [
    `prepare:${runId}`,
    'approval:approved',
    'finalize',
  ]);
});

test('LangGraph spike rejection resumes to cancelled terminal state', async () => {
  const runId = 'spike-run-reject';
  const { app, waitingState } = await startLangGraphSpike(runId);

  assert.deepEqual(waitingState.next, ['approval']);

  const resumed = await resumeLangGraphSpike(app, runId, {
    approved: false,
    feedback: '需求边界不完整',
  });

  assert.equal(resumed.runId, runId);
  assert.equal(resumed.status, 'cancelled');
  assert.equal(resumed.approved, false);
  assert.deepEqual(resumed.events, [
    `prepare:${runId}`,
    'approval:rejected',
    'finalize',
  ]);
});

test('LangGraph spike file checkpoint uses latest pointer and durable JSON', async () => {
  const runDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-coding-lg-spike-'));
  const checkpoint = {
    id: 'checkpoint-1',
    runId: 'spike-run-2',
    state: {
      status: 'prepared',
    },
    createdAt: 123,
  };

  const checkpointPath = await writeSpikeFileCheckpoint(runDir, checkpoint);
  const checkpointContent = JSON.parse(await fs.readFile(checkpointPath, 'utf-8'));
  const latest = await readLatestSpikeFileCheckpoint(runDir);

  assert.equal(checkpointContent.id, checkpoint.id);
  assert.deepEqual(latest, checkpoint);
});

test('LangGraph spike stream maps updates and interrupts to PipelineEvent-compatible events', async () => {
  const events = await collectSpikeStreamEvents('spike-run-3', {
    approved: true,
  });

  assert.deepEqual(
    events.map((event) => event.type),
    [
      'pipeline_node_end',
      'confirmation_waiting',
      'pipeline_node_end',
      'pipeline_node_end',
    ]
  );
  assert.equal(events[0].nodeId, 'prepare');
  assert.equal(events[1].nodeId, 'approval');
  assert.equal(events[1].data?.title, 'Approve LangGraph spike');
  assert.equal(events[2].nodeId, 'approval');
  assert.equal(events[3].nodeId, 'finalize');
});
