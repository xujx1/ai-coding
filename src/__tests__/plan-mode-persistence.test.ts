import * as assert from 'node:assert/strict';
import test from 'node:test';
import { generatePlan } from '../agents/core/planMode.js';
import type { LLMProvider } from '../models/providers.js';

test('plan generation uses the injected durable persistence callback', async () => {
  const persisted: unknown[] = [];
  const provider = {
    createMessage: async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ title: 'Durable plan', steps: [{ title: 'Persist', description: 'save', risk: 'low' }], risks: [] }) }],
      stopReason: 'end_turn',
    }),
    async *createMessageStream() {},
  } as LLMProvider;
  const plan = await generatePlan({
    runId: 'plan-run', agentRunId: 'plan-agent', nodeId: 'node', goal: 'persist a plan', provider, modelId: 'test', cwd: process.cwd(),
    persistPlan: async value => { persisted.push(value); },
  });
  assert.equal(plan.title, 'Durable plan');
  assert.deepEqual(persisted, [plan]);
});
