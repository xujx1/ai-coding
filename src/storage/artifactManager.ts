import type { ArtifactObject, ArtifactPutInput, ArtifactStore } from './contracts/artifactStore.js';
import type { StorageContext } from './contracts/common.js';
import type { UnitOfWork } from './contracts/unitOfWork.js';

/** Coordinates object storage with durable metadata; the object is never formal without metadata. */
export class ArtifactManager {
  constructor(private readonly artifacts: ArtifactStore, private readonly unitOfWork: UnitOfWork) {}

  async uploadAndCommit(ctx: StorageContext, input: ArtifactPutInput): Promise<ArtifactObject> {
    const existing = await this.unitOfWork.transaction(ctx, repositories => repositories.artifacts.findById(ctx, input.artifactId));
    if (existing?.committed) {
      if (existing.runId !== input.runId || existing.kind !== input.kind) throw new Error(`Artifact ID '${input.artifactId}' was reused with conflicting metadata.`);
      return existing;
    }
    const committed = await this.uploadPrepared(ctx, input);
    return this.unitOfWork.transaction(ctx, async repositories => {
      const prior = await repositories.artifacts.findById(ctx, committed.artifactId);
      if (prior?.committed) return prior;
      await repositories.artifacts.save(ctx, committed);
      return repositories.artifacts.markCommitted(ctx, committed.artifactId);
    });
  }

  /** Upload and verify content while deferring formal metadata to a caller-owned transaction. */
  async uploadPrepared(ctx: StorageContext, input: ArtifactPutInput): Promise<ArtifactObject> {
    const temporary = await this.artifacts.putTemporary(ctx, input);
    const stat = await this.artifacts.stat(ctx, temporary.storageKey);
    if (!stat || stat.sizeBytes !== temporary.sizeBytes || stat.sha256 !== temporary.sha256) {
      throw new Error(`Artifact '${input.artifactId}' failed post-upload integrity verification.`);
    }
    return this.artifacts.commit(ctx, temporary);
  }
}
