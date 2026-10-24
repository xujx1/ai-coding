import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { ArtifactSweeper } from '../storage/artifactSweeper.js';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';

test('artifact sweeper reports dry-run cleanup records and deletes only expired unreferenced temporary objects', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-sweeper-'));
  const store = new LocalArtifactStore(root);
  const ctx = { tenantId: 'tenant-a' };
  const expired = await store.putTemporary(ctx, {
    artifactId: 'expired', runId: 'run-a', kind: 'report', contentType: 'text/plain', body: Buffer.from('expired'),
  });
  const referenced = await store.putTemporary(ctx, {
    artifactId: 'referenced', runId: 'run-a', kind: 'report', contentType: 'text/plain', body: Buffer.from('referenced'),
  });
  const recent = await store.putTemporary(ctx, {
    artifactId: 'recent', runId: 'run-a', kind: 'report', contentType: 'text/plain', body: Buffer.from('recent'),
  });
  const now = 2_000_000;
  for (const artifact of [expired, referenced]) {
    fs.utimesSync(path.join(root, artifact.storageKey), (now - 10_000) / 1000, (now - 10_000) / 1000);
  }
  fs.utimesSync(path.join(root, recent.storageKey), now / 1000, now / 1000);

  const sweeper = new ArtifactSweeper(store);
  const dryRun = await sweeper.sweep(ctx, {
    now, retentionMs: 1_000, isReferenced: object => object.storageKey === referenced.storageKey,
  });
  assert.deepEqual(dryRun.records.map(record => [record.storageKey, record.action]), [
    [expired.storageKey, 'would_delete'], [referenced.storageKey, 'retained'],
  ]);
  assert.equal(fs.existsSync(path.join(root, expired.storageKey)), true);

  const records: string[] = [];
  const applied = await sweeper.sweep(ctx, {
    now, retentionMs: 1_000, dryRun: false,
    isReferenced: object => object.storageKey === referenced.storageKey,
    onRecord: record => { records.push(`${record.action}:${record.storageKey}`); },
  });
  assert.equal(applied.scanned, 2);
  assert.equal(applied.deleted, 1);
  assert.equal(applied.retained, 1);
  assert.equal(applied.bytesDeleted, Buffer.byteLength('expired'));
  assert.equal(fs.existsSync(path.join(root, expired.storageKey)), false);
  assert.equal(fs.existsSync(path.join(root, referenced.storageKey)), true);
  assert.equal(fs.existsSync(path.join(root, recent.storageKey)), true);
  assert.equal(records.length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});
