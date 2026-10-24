import * as fs from 'node:fs';
import * as path from 'node:path';
import { getRunPaths, listRuns } from '../../runtime/paths.js';
import type { ArtifactObject, ArtifactRepository } from '../contracts/artifactStore.js';
import type { Page, PageRequest, StorageContext } from '../contracts/common.js';

const METADATA_FILE = '.artifact-metadata.json';

export class FileArtifactRepository implements ArtifactRepository {
  async save(_ctx: StorageContext, artifact: ArtifactObject): Promise<ArtifactObject> {
    const artifacts = readArtifacts(artifact.runId);
    const existingIndex = artifacts.findIndex(item => item.artifactId === artifact.artifactId);
    if (existingIndex >= 0) artifacts[existingIndex] = artifact;
    else artifacts.push(artifact);
    writeArtifacts(artifact.runId, artifacts);
    return artifact;
  }

  async findById(_ctx: StorageContext, artifactId: string): Promise<ArtifactObject | null> {
    for (const runId of listRuns()) {
      const artifact = readArtifacts(runId).find(item => item.artifactId === artifactId);
      if (artifact) return artifact;
    }
    return null;
  }

  async listByRun(_ctx: StorageContext, runId: string, page: PageRequest = {}): Promise<Page<ArtifactObject>> {
    const limit = Math.max(1, Math.min(page.limit ?? 100, 500));
    const offset = Number.parseInt(page.cursor ?? '0', 10) || 0;
    const artifacts = readArtifacts(runId).sort((a, b) => b.createdAt - a.createdAt);
    const items = artifacts.slice(offset, offset + limit);
    const nextOffset = offset + items.length;
    return { items, nextCursor: nextOffset < artifacts.length ? String(nextOffset) : undefined };
  }

  async markCommitted(ctx: StorageContext, artifactId: string): Promise<ArtifactObject> {
    const artifact = await this.findById(ctx, artifactId);
    if (!artifact) throw new Error(`Artifact '${artifactId}' was not found.`);
    const next = { ...artifact, committed: true };
    return this.save(ctx, next);
  }
}

function metadataPath(runId: string): string {
  return path.join(getRunPaths(runId).artifactsDir, METADATA_FILE);
}

function readArtifacts(runId: string): ArtifactObject[] {
  try {
    const file = metadataPath(runId);
    if (!fs.existsSync(file)) return [];
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown;
    return Array.isArray(parsed) ? parsed as ArtifactObject[] : [];
  } catch {
    return [];
  }
}

function writeArtifacts(runId: string, artifacts: ArtifactObject[]): void {
  const file = metadataPath(runId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(artifacts, null, 2), 'utf-8');
}
