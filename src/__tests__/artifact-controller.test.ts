import * as assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { downloadArtifact, getArtifactContent, listRunArtifacts } from '../server/controllers/artifactController.js';
import type { ArtifactObject, ArtifactRepository, ArtifactStore } from '../storage/contracts/artifactStore.js';

const artifact: ArtifactObject = { artifactId: 'artifact-a', runId: 'run-a', tenantId: 'tenant-a', kind: 'report', storageKey: 'committed/tenant-a/run-a/artifact-a', contentType: 'text/plain', sizeBytes: 7, sha256: 'a'.repeat(64), retentionClass: 'archive', committed: true, createdAt: 1 };

test('durable artifact APIs list metadata and read committed content without workspace files', async () => {
  const repository = memoryRepository();
  const store: ArtifactStore = { ...storeBase(), read: async () => Readable.from(Buffer.from('report!')) };
  const listed = await listRunArtifacts(context('run-a'), { artifacts: repository, context: { tenantId: 'tenant-a' } });
  assert.deepEqual(listed.body.artifacts, [artifact]);
  const content = await getArtifactContent(context('run-a', 'artifact-a'), { artifacts: repository, store, context: { tenantId: 'tenant-a' } });
  assert.equal(await (content as Response).text(), 'report!');
  assert.equal((content as Response).headers.get('Content-Type'), 'text/plain');
});

test('durable artifact download returns a short-lived URL when the store supports it', async () => {
  const store: ArtifactStore = { ...storeBase(), read: async () => Readable.from([]), createDownloadUrl: async (_ctx, key, expiry, filename) => `https://objects.example/${key}?expires=${expiry}&name=${filename}` };
  const response = await downloadArtifact(context('run-a', 'artifact-a', { filename: '../unsafe\nreport.txt' }), { artifacts: memoryRepository(), store, context: { tenantId: 'tenant-a' } });
  assert.equal(response.body.url, 'https://objects.example/committed/tenant-a/run-a/artifact-a?expires=300&name=-unsafe-report.txt');
});

test('durable artifact APIs do not expose another tenant metadata or content', async () => {
  const response = await getArtifactContent(context('run-a', 'artifact-a'), {
    artifacts: memoryRepository(), store: { ...storeBase(), read: async () => Readable.from(Buffer.from('private')) }, context: { tenantId: 'other-tenant' },
  });
  assert.equal(response.status, 404);
});

function context(runId: string, artifactId?: string, query: Record<string, string> = {}) {
  return { req: { param: (key: string) => key === 'runId' ? runId : artifactId, query: (key: string) => query[key] }, json: (body: unknown, status = 200) => ({ body, status }), body: (body: Buffer, status: number, headers: Record<string, string>) => ({ body, status, headers }) };
}

function memoryRepository(): ArtifactRepository {
  return { save: async (_ctx, value) => value, findById: async (_ctx, id) => id === artifact.artifactId ? artifact : null, listByRun: async () => ({ items: [artifact] }), markCommitted: async () => artifact };
}

function storeBase(): Omit<ArtifactStore, 'read'> {
  const unavailable = async () => { throw new Error('not used'); };
  return { putTemporary: unavailable as any, stat: unavailable as any, commit: unavailable as any, delete: unavailable, listTemporary: unavailable as any };
}
