import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { ArtifactManager } from '../storage/artifactManager.js';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';
import type { ArtifactObject, ArtifactRepository } from '../storage/contracts/artifactStore.js';
import type { StorageContext } from '../storage/contracts/common.js';
import type { StorageRepositories, UnitOfWork } from '../storage/contracts/unitOfWork.js';

const context: StorageContext = { tenantId: 'tenant' };

test('artifact manager commits verified metadata once and returns it on retry', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-manager-'));
  const repository = new MemoryArtifactRepository();
  const manager = new ArtifactManager(new LocalArtifactStore(root), new ArtifactUnitOfWork(repository));
  const input = { artifactId: 'artifact', runId: 'run', kind: 'report', contentType: 'text/plain', body: Buffer.from('verified') };
  const first = await manager.uploadAndCommit(context, input);
  const retry = await manager.uploadAndCommit(context, input);
  assert.equal(first.committed, true);
  assert.equal(retry.storageKey, first.storageKey);
  assert.equal(repository.saves, 1);
  fs.rmSync(root, { recursive: true, force: true });
});

class MemoryArtifactRepository implements ArtifactRepository {
  private readonly data = new Map<string, ArtifactObject>();
  saves = 0;
  async save(_ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject> { this.saves += 1; this.data.set(artifact.artifactId, artifact); return artifact; }
  async findById(_ctx: StorageContext, artifactId: string): Promise<ArtifactObject | null> { return this.data.get(artifactId) ?? null; }
  async listByRun(): Promise<{ items: ArtifactObject[] }> { return { items: [...this.data.values()] }; }
  async markCommitted(_ctx: StorageContext, artifactId: string): Promise<ArtifactObject> { const item = this.data.get(artifactId); if (!item) throw new Error('missing'); const committed = { ...item, committed: true }; this.data.set(artifactId, committed); return committed; }
}

class ArtifactUnitOfWork implements UnitOfWork {
  constructor(private readonly artifacts: ArtifactRepository) {}
  async transaction<T>(_ctx: StorageContext, work: (repositories: StorageRepositories) => Promise<T>): Promise<T> {
    return work({ artifacts: this.artifacts } as StorageRepositories);
  }
}
