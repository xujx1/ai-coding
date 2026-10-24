import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';
import { assertSafeArtifactStorageKey, sanitizeDownloadFilename } from '../storage/artifacts/keys.js';
import { S3ArtifactStore } from '../storage/artifacts/s3ArtifactStore.js';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';

test('artifact storage rejects traversal and control-character keys', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-key-security-'));
  const store = new LocalArtifactStore(root);
  for (const key of ['../secret', 'committed//x', 'committed/a/../x', '/committed/a', 'committed/a\\x', 'committed/a\0x']) {
    assert.throws(() => assertSafeArtifactStorageKey(key), /Invalid artifact storage key/);
    await assert.rejects(() => store.read({ tenantId: 'tenant' }, key), /Invalid artifact storage key/);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('download filenames cannot inject response headers or paths', () => {
  assert.equal(sanitizeDownloadFilename('../../report\r\nX-Injected: yes.txt'), 'report--X-Injected: yes.txt');
  assert.equal(sanitizeDownloadFilename('..'), 'artifact-download');
});

test('S3 signed download URLs do not expose the configured secret access key', async () => {
  const secret = 'secret-value-must-not-appear';
  const store = new S3ArtifactStore({
    ...DEFAULT_STORAGE_CONFIG,
    s3Bucket: 'test-artifacts', s3Region: 'us-east-1', s3Endpoint: 'https://storage.example.invalid',
    s3AccessKeyId: 'test-access-key', s3SecretAccessKey: secret,
  });
  const url = await store.createDownloadUrl!({ tenantId: 'tenant' }, 'committed/tenant/run/report.txt', 60, 'report\r\nInjected.txt');
  assert.equal(url.includes(secret), false);
  assert.match(decodeURIComponent(url), /filename="report--Injected.txt"/);
});
