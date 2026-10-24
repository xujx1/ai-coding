#!/usr/bin/env node
import { getConfig, loadConfig } from '../../config/index.js';
import { ArtifactManager } from '../artifactManager.js';
import { createStorageDependencies } from '../factory.js';
import { importFileRun } from './fileMigrationImport.js';
import { planFileMigration } from './fileMigrationPlan.js';
import { verifyFileMigration } from './fileMigrationVerify.js';
import { exportFileMigration } from './fileMigrationExport.js';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2] ?? 'migrate';
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
if (command === 'migrate' && dryRun !== apply) {
  const source = option('--from');
  if (!source) {
    console.error('--from is required for migration planning.');
    process.exitCode = 2;
  } else {
    try {
      if (dryRun) console.log(JSON.stringify(planFileMigration(source), null, 2));
      else await applyMigration(source, option('--tenant') ?? 'default');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
} else if (command === 'verify' && !dryRun && !apply) {
  const source = option('--from');
  if (!source) {
    console.error('--from is required for migration verification.');
    process.exitCode = 2;
  } else {
    try {
      await verifyMigration(source, option('--tenant') ?? 'default');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
} else if (command === 'export' && !dryRun && !apply) {
  const destination = option('--to');
  const runId = option('--run');
  if (!destination || !runId) {
    console.error('--to and --run are required for migration export.');
    process.exitCode = 2;
  } else {
    try {
      await exportMigration(destination, runId, option('--tenant') ?? 'default');
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
} else {
  console.error('Usage: storage:migrate -- --from <runtime-projects|runs> (--dry-run | --apply) [--tenant <tenantId>]');
  console.error('       storage:verify -- --from <runtime-projects|runs> [--tenant <tenantId>]');
  console.error('       storage:export -- --to <runtime-projects|runs> --run <runId> [--tenant <tenantId>]');
  process.exitCode = 2;
}

async function applyMigration(source: string, tenantId: string): Promise<void> {
  const plan = planFileMigration(source);
  loadConfig();
  const config = getConfig();
  if (config.storage.driver !== 'postgres') {
    throw new Error('storage:migrate --apply requires AI_CODING_STORAGE_DRIVER=postgres; file mode is never an import target.');
  }
  const dependencies = createStorageDependencies(config);
  const artifacts = new ArtifactManager(dependencies.artifactStore, dependencies.unitOfWork);
  try {
    const results = [];
    for (const run of plan.runs) {
      if (!run.valid) {
        results.push({ runId: run.runId, imported: false, diagnostics: run.diagnostics });
        continue;
      }
      const checksum = run.sourceChecksum!;
      const previous = await dependencies.unitOfWork.transaction({ tenantId }, repositories =>
        repositories.migrations.find({ tenantId }, run.runId, checksum));
      if (previous?.status === 'completed') {
        results.push({ runId: run.runId, imported: false, skipped: true, migration: previous });
        continue;
      }
      try {
        const imported = await importFileRun({
          sourceRoot: source,
          runId: run.runId,
          context: { tenantId },
          unitOfWork: dependencies.unitOfWork,
          artifactUploader: artifacts,
        });
        const migration = await dependencies.unitOfWork.transaction({ tenantId }, repositories => repositories.migrations.record({ tenantId }, {
          sourceRunId: run.runId,
          sourceChecksum: checksum,
          targetSchemaVersion: '001_initial_storage',
          status: 'completed',
          diagnostics: [],
          migratedAt: Date.now(),
        }));
        results.push({ ...imported, migration });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const migration = await dependencies.unitOfWork.transaction({ tenantId }, repositories => repositories.migrations.record({ tenantId }, {
          sourceRunId: run.runId,
          sourceChecksum: checksum,
          targetSchemaVersion: '001_initial_storage',
          status: 'failed',
          diagnostics: [message],
          migratedAt: Date.now(),
        })).catch(() => undefined);
        results.push({ runId: run.runId, imported: false, error: message, migration });
      }
    }
    console.log(JSON.stringify({ dryRun: false, sourceRoot: plan.sourceRoot, results }, null, 2));
    if (results.some(result => result.imported === false && ('error' in result || 'diagnostics' in result))) process.exitCode = 1;
  } finally {
    await dependencies.close();
  }
}

async function verifyMigration(source: string, tenantId: string): Promise<void> {
  const plan = planFileMigration(source);
  loadConfig();
  const config = getConfig();
  if (config.storage.driver !== 'postgres') {
    throw new Error('storage:verify requires AI_CODING_STORAGE_DRIVER=postgres; verification needs the authoritative target.');
  }
  const dependencies = createStorageDependencies(config);
  try {
    const results = [];
    for (const run of plan.runs) {
      if (!run.valid) {
        results.push({ runId: run.runId, matched: false, diagnostics: run.diagnostics });
        continue;
      }
      results.push(await verifyFileMigration({ sourceRoot: source, runId: run.runId, context: { tenantId }, unitOfWork: dependencies.unitOfWork }));
    }
    console.log(JSON.stringify({ sourceRoot: plan.sourceRoot, results }, null, 2));
    if (results.some(result => !result.matched)) process.exitCode = 1;
  } finally {
    await dependencies.close();
  }
}

async function exportMigration(destinationRoot: string, runId: string, tenantId: string): Promise<void> {
  loadConfig();
  const config = getConfig();
  if (config.storage.driver !== 'postgres') {
    throw new Error('storage:export requires AI_CODING_STORAGE_DRIVER=postgres; export reads the authoritative target.');
  }
  const dependencies = createStorageDependencies(config);
  try {
    console.log(JSON.stringify(await exportFileMigration({ destinationRoot, runId, context: { tenantId }, unitOfWork: dependencies.unitOfWork }), null, 2));
  } finally {
    await dependencies.close();
  }
}
