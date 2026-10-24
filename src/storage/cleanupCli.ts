#!/usr/bin/env node
import { getConfig, loadConfig } from '../config/index.js';
import { ArtifactSweeper } from './artifactSweeper.js';
import { createStorageDependencies } from './factory.js';
import { WorkspaceManager } from './workspaceManager.js';

const apply = process.argv.includes('--apply');
const tenantIndex = process.argv.indexOf('--tenant');
const tenantId = tenantIndex >= 0 ? process.argv[tenantIndex + 1] : 'default';
try {
  loadConfig();
  const config = getConfig();
  const dependencies = createStorageDependencies(config);
  try {
    const workspace = new WorkspaceManager({ root: config.storage.workspaceRoot, retentionMs: config.storage.workspaceRetentionHours * 3_600_000 });
    const artifacts = await new ArtifactSweeper(dependencies.artifactStore).sweep({ tenantId }, {
      retentionMs: config.storage.temporaryArtifactRetentionHours * 3_600_000,
      dryRun: !apply,
      isReferenced: async object => isFormallyReferenced(dependencies, tenantId, object.storageKey),
    });
    console.log(JSON.stringify({ dryRun: !apply, workspace: workspace.cleanup({ dryRun: !apply }), artifacts }, null, 2));
  } finally { await dependencies.close(); }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function isFormallyReferenced(
  dependencies: ReturnType<typeof createStorageDependencies>,
  tenantId: string,
  storageKey: string,
): Promise<boolean> {
  return dependencies.unitOfWork.transaction({ tenantId }, async repositories => {
    let runCursor: string | undefined;
    do {
      const runs = await repositories.runs.list({ tenantId }, { cursor: runCursor, limit: 500 });
      for (const run of runs.items) {
        let artifactCursor: string | undefined;
        do {
          const artifacts = await repositories.artifacts.listByRun({ tenantId }, run.runId, { cursor: artifactCursor, limit: 500 });
          if (artifacts.items.some(artifact => artifact.committed && artifact.storageKey === storageKey)) return true;
          artifactCursor = artifacts.nextCursor;
        } while (artifactCursor);
      }
      runCursor = runs.nextCursor;
    } while (runCursor);
    return false;
  });
}
