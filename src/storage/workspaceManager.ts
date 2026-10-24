import * as fs from 'node:fs';
import * as path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ArtifactObject, ArtifactStore } from './contracts/artifactStore.js';
import { getStorageMetrics } from './metrics.js';

const METADATA = '.ai-coding-workspace.json';

export interface WorkspaceRecord {
  runId: string;
  workerId: string;
  sourceReferences: string[];
  createdAt: number;
  expiresAt: number;
}

export interface WorkspaceManagerOptions {
  root: string;
  retentionMs: number;
  now?: () => number;
}

export interface ScmWorkspaceSource {
  repositoryUrl: string;
  ref?: string;
}

export interface ArtifactWorkspaceSource {
  artifact: ArtifactObject;
  /** Relative destination inside the disposable workspace. */
  destination: string;
}

export interface DurableWorkspaceSources {
  scm?: ScmWorkspaceSource;
  uploadedInputs?: ArtifactWorkspaceSource[];
  committedArtifacts?: ArtifactWorkspaceSource[];
}

export interface WorkspaceReconstructionDependencies {
  artifacts: ArtifactStore;
  /** Composition owns SCM credentials and clone semantics. */
  restoreScm?: (source: ScmWorkspaceSource, destination: string) => Promise<void>;
}

/** Owns only disposable execution directories, never run state or formal artifacts. */
export class WorkspaceManager {
  private readonly now: () => number;

  constructor(private readonly options: WorkspaceManagerOptions) {
    if (options.retentionMs <= 0) throw new Error('Workspace retention must be positive.');
    this.now = options.now ?? Date.now;
  }

  create(runId: string, workerId: string, sourceReferences: string[] = []): { directory: string; record: WorkspaceRecord } {
    const directory = this.directory(runId);
    fs.mkdirSync(directory, { recursive: true });
    const createdAt = this.now();
    const record = { runId, workerId, sourceReferences: [...sourceReferences], createdAt, expiresAt: createdAt + this.options.retentionMs };
    fs.writeFileSync(path.join(directory, METADATA), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    getStorageMetrics().increment('storage_workspace_created_total');
    return { directory, record };
  }

  get(runId: string): { directory: string; record: WorkspaceRecord } | null {
    const directory = this.directory(runId);
    const file = path.join(directory, METADATA);
    if (!fs.existsSync(file)) return null;
    try {
      const record = JSON.parse(fs.readFileSync(file, 'utf8')) as WorkspaceRecord;
      if (!validRecord(record) || record.runId !== runId) return null;
      return { directory, record };
    } catch { return null; }
  }

  /** Recreates a missing/expired workspace from caller-owned durable references. */
  async reconstruct(runId: string, workerId: string, sourceReferences: string[], restore: (directory: string, references: readonly string[]) => Promise<void>): Promise<{ directory: string; record: WorkspaceRecord }> {
    const existing = this.get(runId);
    if (existing && existing.record.expiresAt > this.now()) return existing;
    if (existing) fs.rmSync(existing.directory, { recursive: true, force: true });
    const workspace = this.create(runId, workerId, sourceReferences);
    await restore(workspace.directory, workspace.record.sourceReferences);
    getStorageMetrics().increment('storage_workspace_reconstructed_total');
    return workspace;
  }

  /**
   * Rebuilds a Worker-local cache only from durable sources. Product state is
   * intentionally absent from this operation and remains in its repositories.
   */
  async reconstructDurable(
    runId: string,
    workerId: string,
    sources: DurableWorkspaceSources,
    dependencies: WorkspaceReconstructionDependencies,
  ): Promise<{ directory: string; record: WorkspaceRecord }> {
    const uploadedInputs = sources.uploadedInputs ?? [];
    const committedArtifacts = sources.committedArtifacts ?? [];
    const sourceReferences = [
      ...(sources.scm ? [`scm:${sources.scm.repositoryUrl}${sources.scm.ref ? `#${sources.scm.ref}` : ''}`] : []),
      ...uploadedInputs.map(source => `input:${source.artifact.artifactId}`),
      ...committedArtifacts.map(source => `artifact:${source.artifact.artifactId}`),
    ];
    this.validateDurableSources(runId, [...uploadedInputs, ...committedArtifacts]);
    return this.reconstruct(runId, workerId, sourceReferences, async directory => {
      if (sources.scm) {
        if (!dependencies.restoreScm) throw new Error('Workspace reconstruction requires an SCM restore implementation.');
        const projectDirectory = path.join(directory, 'project');
        fs.mkdirSync(projectDirectory, { recursive: true });
        await dependencies.restoreScm(sources.scm, projectDirectory);
      }
      for (const source of uploadedInputs) {
        await this.restoreArtifact(directory, 'input', source, dependencies.artifacts);
      }
      for (const source of committedArtifacts) {
        await this.restoreArtifact(directory, 'artifacts', source, dependencies.artifacts);
      }
    });
  }

  cleanup(options: { dryRun?: boolean } = {}): Array<{ runId: string; directory: string; deleted: boolean }> {
    const root = path.resolve(this.options.root);
    if (!fs.existsSync(root)) return [];
    const results: Array<{ runId: string; directory: string; deleted: boolean }> = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(root, entry.name);
      const record = this.readRecord(directory);
      const workspace = record ? { directory, record } : null;
      if (!workspace || workspace.record.expiresAt > this.now()) continue;
      if (!options.dryRun) fs.rmSync(workspace.directory, { recursive: true, force: true });
      getStorageMetrics().increment(options.dryRun ? 'storage_workspace_cleanup_dry_run_total' : 'storage_workspace_deleted_total');
      results.push({ runId: workspace.record.runId, directory: workspace.directory, deleted: !options.dryRun });
    }
    return results;
  }

  private directory(runId: string): string {
    const safe = runId.replace(/[^a-zA-Z0-9._-]/g, '-');
    if (!safe || safe === '.' || safe === '..') throw new Error('Invalid workspace run ID.');
    return path.resolve(this.options.root, safe);
  }

  private readRecord(directory: string): WorkspaceRecord | null {
    const file = path.join(directory, METADATA);
    if (!fs.existsSync(file)) return null;
    try {
      const record = JSON.parse(fs.readFileSync(file, 'utf8')) as WorkspaceRecord;
      return validRecord(record) ? record : null;
    } catch { return null; }
  }

  private validateDurableSources(runId: string, sources: ArtifactWorkspaceSource[]): void {
    for (const source of sources) {
      if (source.artifact.runId !== runId) throw new Error(`Artifact '${source.artifact.artifactId}' belongs to a different run.`);
      if (!source.artifact.committed) throw new Error(`Artifact '${source.artifact.artifactId}' is not committed.`);
      safeDestination(source.destination);
    }
  }

  private async restoreArtifact(
    directory: string,
    category: 'input' | 'artifacts',
    source: ArtifactWorkspaceSource,
    artifacts: ArtifactStore,
  ): Promise<void> {
    const target = path.resolve(directory, category, safeDestination(source.destination));
    const root = path.resolve(directory, category);
    if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Unsafe workspace artifact destination.');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    await pipeline(await artifacts.read({ tenantId: source.artifact.tenantId }, source.artifact.storageKey), fs.createWriteStream(target));
  }
}

function safeDestination(destination: string): string {
  const normalized = destination.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized.split('/').some(segment => segment === '..' || segment === '')) {
    throw new Error(`Invalid workspace artifact destination '${destination}'.`);
  }
  return normalized;
}

function validRecord(value: WorkspaceRecord): boolean {
  return typeof value.runId === 'string' && typeof value.workerId === 'string' && Array.isArray(value.sourceReferences) && Number.isFinite(value.createdAt) && Number.isFinite(value.expiresAt);
}
