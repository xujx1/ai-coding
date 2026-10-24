import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { createPipelineArtifactWriter } from '../storage/pipelineArtifactWriter.js';
import { ArtifactManager } from '../storage/artifactManager.js';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';
import type { ArtifactObject, ArtifactRepository } from '../storage/contracts/artifactStore.js';
import type { StorageContext } from '../storage/contracts/common.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';

test('pipeline reports and download bundles are committed through the injected artifact writer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-artifact-writer-'));
  const repository = new MemoryArtifactRepository();
  const writer = createPipelineArtifactWriter(new ArtifactManager(new LocalArtifactStore(root), new ArtifactUnitOfWork(repository)), { tenantId: 'tenant-a' });
  try {
    const report = await writer.write({ runId: 'run-a', nodeId: 'review', relativePath: 'orders/code-review.md', body: Buffer.from('# Review') });
    const bundle = await writer.write({ runId: 'run-a', nodeId: 'archive', relativePath: 'downloads/run-a-projects.zip', body: Buffer.from('zip') });
    assert.deepEqual([report.kind, bundle.kind], ['report', 'download-bundle']);
    assert.ok(report.committed && bundle.committed);
    assert.equal(repository.items.size, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('pipeline artifact writer can defer metadata to the node transition transaction', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-artifact-deferred-'));
  const repository = new MemoryArtifactRepository();
  const writer = createPipelineArtifactWriter(
    new ArtifactManager(new LocalArtifactStore(root), new ArtifactUnitOfWork(repository)),
    { tenantId: 'tenant-a' },
    { deferMetadata: true },
  );
  try {
    const prepared = await writer.write({
      runId: 'run-a', nodeId: 'review', relativePath: 'orders/code-review.md', body: Buffer.from('# Review'),
    });
    assert.equal(prepared.committed, true);
    assert.equal(repository.items.size, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

class MemoryArtifactRepository implements ArtifactRepository {
  readonly items = new Map<string, ArtifactObject>();
  async save(_ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject> { this.items.set(artifact.artifactId, artifact); return artifact; }
  async findById(_ctx: StorageContext, artifactId: string): Promise<ArtifactObject | null> { return this.items.get(artifactId) ?? null; }
  async listByRun(): Promise<{ items: ArtifactObject[] }> { return { items: [...this.items.values()] }; }
  async markCommitted(_ctx: StorageContext, artifactId: string): Promise<ArtifactObject> { return this.items.get(artifactId)!; }
}
class ArtifactUnitOfWork implements UnitOfWork {
  constructor(private readonly artifacts: ArtifactRepository) {}
  async transaction<T>(_ctx: StorageContext, work: (repositories: StorageRepositories) => Promise<T>): Promise<T> { return work({ artifacts: this.artifacts } as StorageRepositories); }
}
