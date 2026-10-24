import type { ArtifactStore, TemporaryArtifactObject } from './contracts/artifactStore.js';
import type { StorageContext } from './contracts/common.js';

export interface ArtifactCleanupRecord {
  storageKey: string;
  createdAt: number;
  sizeBytes: number;
  action: 'would_delete' | 'deleted' | 'retained';
  reason: 'expired_unreferenced' | 'referenced';
}

export interface ArtifactSweepResult {
  dryRun: boolean;
  retentionMs: number;
  scanned: number;
  eligible: number;
  deleted: number;
  retained: number;
  bytesDeleted: number;
  records: ArtifactCleanupRecord[];
}

export interface ArtifactSweeperOptions {
  retentionMs: number;
  dryRun?: boolean;
  now?: number;
  /** Return true for an object referenced by formal artifact metadata. */
  isReferenced?: (object: TemporaryArtifactObject) => Promise<boolean> | boolean;
  onRecord?: (record: ArtifactCleanupRecord) => Promise<void> | void;
}

/**
 * Removes only expired temporary objects.  A caller supplies the metadata
 * reference predicate because object stores cannot atomically query the run
 * database.  Dry runs produce the same records and metrics without mutation.
 */
export class ArtifactSweeper {
  constructor(private readonly store: ArtifactStore) {}

  async sweep(ctx: StorageContext, options: ArtifactSweeperOptions): Promise<ArtifactSweepResult> {
    if (!Number.isFinite(options.retentionMs) || options.retentionMs < 0) {
      throw new Error('Artifact retentionMs must be a non-negative finite number.');
    }
    const now = options.now ?? Date.now();
    const dryRun = options.dryRun !== false;
    const candidates = await this.store.listTemporary(ctx, now - options.retentionMs);
    const records: ArtifactCleanupRecord[] = [];
    let eligible = 0;
    let deleted = 0;
    let retained = 0;
    let bytesDeleted = 0;
    for (const object of candidates) {
      const referenced = await options.isReferenced?.(object) ?? false;
      const record: ArtifactCleanupRecord = referenced
        ? { ...object, action: 'retained', reason: 'referenced' }
        : { ...object, action: dryRun ? 'would_delete' : 'deleted', reason: 'expired_unreferenced' };
      if (referenced) {
        retained += 1;
      } else {
        eligible += 1;
        if (!dryRun) {
          await this.store.delete(ctx, object.storageKey);
          deleted += 1;
          bytesDeleted += object.sizeBytes;
        }
      }
      records.push(record);
      await options.onRecord?.(record);
    }
    return {
      dryRun, retentionMs: options.retentionMs, scanned: candidates.length,
      eligible, deleted, retained, bytesDeleted, records,
    };
  }
}
