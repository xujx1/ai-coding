import * as assert from 'node:assert/strict';
import test from 'node:test';
import { Command } from '@langchain/langgraph';
import { createLangGraphSpikeApp, langGraphRunConfig } from '../workflows/runtime/langgraph/spike.js';
import { createPostgresCheckpointer } from '../workflows/runtime/langgraph/checkpointer.js';

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL LangGraph checkpointer restores an interrupted run by thread_id', { skip: !databaseUrl }, async () => {
  const threadId = `postgres-checkpoint-${Date.now()}`;
  const saver = await createPostgresCheckpointer(databaseUrl!);
  const app = createLangGraphSpikeApp(saver);
  const config = langGraphRunConfig(threadId);

  await app.invoke({ runId: threadId, status: 'pending', events: [] }, config);
  const waiting = await app.getState(config);
  assert.deepEqual(waiting.next, ['approval']);

  const recoveredApp = createLangGraphSpikeApp(await createPostgresCheckpointer(databaseUrl!));
  const resumed = await recoveredApp.invoke(new Command({ resume: { approved: true } }), config);
  assert.equal(resumed.runId, threadId);
  assert.equal(resumed.status, 'completed');
  assert.deepEqual(resumed.events, [`prepare:${threadId}`, 'approval:approved', 'finalize']);

  await saver.deleteThread(threadId);
  await saver.end();
});
