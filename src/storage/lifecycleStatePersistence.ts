import type { LifecycleState } from '../lifecycle/types.js';
import type { StorageContext } from './contracts/common.js';
import type { LifecycleRepository } from './contracts/lifecycleRepository.js';
import type { UnitOfWork } from './contracts/unitOfWork.js';

export interface LifecycleStatePersistence {
  load(runId: string): Promise<LifecycleState | null>;
  save(state: LifecycleState): Promise<void>;
  expectedVersion?(state: LifecycleState): number | undefined;
  acceptCommittedVersion?(state: LifecycleState, version: number): void;
}

/** Version-aware lifecycle persistence for runtimes that own a mutable snapshot. */
export class RepositoryLifecycleStatePersistence implements LifecycleStatePersistence {
  private readonly snapshotVersions = new WeakMap<LifecycleState, number>();

  constructor(
    private readonly lifecycle: LifecycleRepository,
    private readonly context: StorageContext,
    private readonly unitOfWork?: UnitOfWork,
  ) {}

  async load(runId: string): Promise<LifecycleState | null> {
    const existing = await this.lifecycle.findByRunId(this.context, runId);
    if (!existing) return null;
    const state = structuredClone(existing.value);
    this.snapshotVersions.set(state, existing.version);
    return state;
  }

  async save(state: LifecycleState): Promise<void> {
    const snapshot = structuredClone(state);
    const expectedVersion = this.snapshotVersions.get(state);
    const saved = await this.write(snapshot, expectedVersion);
    this.snapshotVersions.set(state, saved.version);
  }

  private async write(state: LifecycleState, expectedVersion?: number) {
    const operation = async (lifecycle: LifecycleRepository) => {
      if (expectedVersion !== undefined) {
        return lifecycle.save(this.context, state, expectedVersion);
      }
      const existing = await lifecycle.findByRunId(this.context, state.runId);
      return existing
        ? lifecycle.save(this.context, state, existing.version)
        : lifecycle.create(this.context, state);
    };
    if (!this.unitOfWork) return operation(this.lifecycle);
    return this.unitOfWork.transaction(this.context, repositories => operation(repositories.lifecycle));
  }

  expectedVersion(state: LifecycleState): number | undefined {
    return this.snapshotVersions.get(state);
  }

  acceptCommittedVersion(state: LifecycleState, version: number): void {
    this.snapshotVersions.set(state, version);
  }
}
