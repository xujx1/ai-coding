import * as fs from 'fs';
import * as path from 'path';
import { RunPaths } from '../runtime/paths.js';
import { BranchSummary } from './state.js';

export function writeBranchSummaryArtifact(
  paths: RunPaths,
  summary: BranchSummary
): string {
  const projectDirName = safeArtifactSegment(summary.projectName);
  const relativePath = path.join(projectDirName, 'branch-summary.json');
  const absolutePath = path.join(paths.artifactsDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, JSON.stringify(summary, null, 2), 'utf-8');
  return path.join('artifacts', relativePath).replace(/\\/g, '/');
}

export function createEmptyBranchSummary(args: {
  branchId: string;
  projectName: string;
}): BranchSummary {
  return {
    branchId: args.branchId,
    projectName: args.projectName,
    changedFiles: [],
    publicApiChanges: [],
    databaseChanges: [],
    configChanges: [],
    dependencyChanges: [],
    testResults: {
      status: 'skipped',
    },
    riskNotes: [],
    requiredCrossAppChecks: [],
  };
}

function safeArtifactSegment(value: string): string {
  return value
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/^\.+$/, 'project') || 'project';
}
