import * as assert from 'assert/strict';
import test from 'node:test';
import { canonicalize, checksum } from '../storage/migration/canonical.js';

test('canonical storage serialization is field-order independent and preserves array order', () => {
  const left = { run: { status: 'done', nodes: [{ id: 'b' }, { id: 'a' }] }, version: 1 };
  const right = { version: 1, run: { nodes: [{ id: 'b' }, { id: 'a' }], status: 'done' } };
  assert.equal(canonicalize(left), canonicalize(right));
  assert.equal(checksum(left), checksum(right));
  assert.notEqual(checksum(left), checksum({ ...right, run: { ...right.run, nodes: [{ id: 'a' }, { id: 'b' }] } }));
});
