import * as assert from 'assert/strict';
import test from 'node:test';
import { ConcurrentModificationError } from '../storage/contracts/common.js';
import { retryOnConflict } from '../storage/conflictRetry.js';

test('conflict retry reloads only bounded optimistic conflicts', async () => {
  let attempts = 0;
  let reloads = 0;
  const value = await retryOnConflict(async () => {
    attempts += 1;
    if (attempts < 3) throw new ConcurrentModificationError('run', 'r1');
    return 'committed';
  }, { onConflict: async () => { reloads += 1; } });
  assert.equal(value, 'committed');
  assert.equal(reloads, 2);
  await assert.rejects(() => retryOnConflict(async () => { throw new ConcurrentModificationError('run', 'r1'); }, { maxAttempts: 2 }), /Concurrent modification/);
});
