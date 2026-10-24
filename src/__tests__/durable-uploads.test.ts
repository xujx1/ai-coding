import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { persistDurableUploads } from '../runtime/durableUploads.js';
import { ArtifactManager } from '../storage/artifactManager.js';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';
import type { ArtifactObject, ArtifactRepository } from '../storage/contracts/artifactStore.js';
import type { StorageContext } from '../storage/contracts/common.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';

test('uploaded MRDs and project archives become idempotent committed ArtifactStore objects', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-uploads-'));
  const repository = new MemoryArtifactRepository();
  const manager = new ArtifactManager(new LocalArtifactStore(root), new ArtifactUnitOfWork(repository));
  try {
    const input = { runId: 'run-a', context: { tenantId: 'tenant-a' }, manager, files: [
      { name: 'requirement.md', data: Buffer.from('# Requirement') },
      { name: 'project.zip', data: Buffer.from('zip'), target: 'project' as const },
    ] };
    const first = await persistDurableUploads(input);
    const retry = await persistDurableUploads(input);
    assert.deepEqual(first.map(item => item.kind), ['mrd', 'project-archive']);
    assert.ok(first.every(item => item.committed));
    assert.deepEqual(retry.map(item => item.artifactId), first.map(item => item.artifactId));
    assert.equal(repository.items.size, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

class MemoryArtifactRepository implements ArtifactRepository {
  readonly items = new Map<string, ArtifactObject>();
  async save(_ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject> { this.items.set(artifact.artifactId, artifact); return artifact; }
  async findById(_ctx: StorageContext, artifactId: string): Promise<ArtifactObject | null> { return this.items.get(artifactId) ?? null; }
  async listByRun(): Promise<{ items: ArtifactObject[] }> { return { items: [...this.items.values()] }; }
  async markCommitted(_ctx: StorageContext, artifactId: string): Promise<ArtifactObject> { const artifact = this.items.get(artifactId)!; return artifact; }
}

class ArtifactUnitOfWork implements UnitOfWork {
  constructor(private readonly artifacts: ArtifactRepository) {}
  async transaction<T>(_ctx: StorageContext, work: (repositories: StorageRepositories) => Promise<T>): Promise<T> { return work({ artifacts: this.artifacts } as StorageRepositories); }
}
