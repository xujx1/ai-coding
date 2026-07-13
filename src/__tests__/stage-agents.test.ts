import * as assert from 'assert/strict';
import test from 'node:test';
import { getPipelineAgentDefinition } from '../agents/codegen/stageAgents.js';

test('mrd-render agent can inspect requirement ownership evidence', () => {
  const agent = getPipelineAgentDefinition('mrd-render');

  assert.ok(agent);
  assert.deepEqual(agent.defaultTools, ['glob', 'grep', 'read_file', 'write_file']);
});
