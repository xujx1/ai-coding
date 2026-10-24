import type { ExecutionState } from '../persistence/executionTypes.js';
import type { StorageContext } from './contracts/common.js';
import type { RunRepository } from './contracts/runRepository.js';

/**
 * Version-aware persistence for a Pipeline-owned execution snapshot. Product
 * code keeps its mutable state locally, while this adapter keeps the durable
 * repository version required for compare-and-swap writes.
 */
export interface RunStatePersistence {
  load(runId: string): Promise<ExecutionState | null>;
  save(state: ExecutionState): Promise<void>;
  currentVersion?(runId: string): number | undefined;
  currentSnapshot?(runId: string): ExecutionState | undefined;
  acceptCommittedVersion?(runId: string, version: number, state?: ExecutionState): void;
}

export class RepositoryRunStatePersistence implements RunStatePersistence {
  private readonly versions = new Map<string, number>();
  private readonly snapshots = new Map<string, ExecutionState>();

  constructor(
    private readonly runs: RunRepository,
    private readonly context: StorageContext,
  ) {}

  async load(runId: string): Promise<ExecutionState | null> {
    const record = await this.runs.findById(this.context, runId);
    if (!record) return null;
    this.versions.set(runId, record.version);
    this.snapshots.set(runId, structuredClone(record.value));
    return structuredClone(record.value);
  }

  async save(state: ExecutionState): Promise<void> {
    const snapshot = structuredClone(state);
    let version = this.versions.get(snapshot.runId);
    if (version === undefined) {
      const existing = await this.runs.findById(this.context, snapshot.runId);
      if (!existing) {
        const created = await this.runs.create(this.context, snapshot);
        this.versions.set(snapshot.runId, created.version);
        this.snapshots.set(snapshot.runId, structuredClone(created.value));
        return;
      }
      version = existing.version;
    }
    const saved = await this.runs.save(this.context, snapshot, version);
    this.versions.set(snapshot.runId, saved.version);
    this.snapshots.set(snapshot.runId, structuredClone(saved.value));
  }

  currentVersion(runId: string): number | undefined {
    return this.versions.get(runId);
  }

  currentSnapshot(runId: string): ExecutionState | undefined {
    const snapshot = this.snapshots.get(runId);
    return snapshot ? structuredClone(snapshot) : undefined;
  }

  acceptCommittedVersion(runId: string, version: number, state?: ExecutionState): void {
    this.versions.set(runId, version);
    if (state) this.snapshots.set(runId, structuredClone(state));
  }
}
