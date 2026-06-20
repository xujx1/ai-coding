/**
 * Runtime directory structure management.
 *
 * runtime-projects/
 *   runs/
 *     {runId}/
 *       input/
 *       workspace/
 *         project/
 *       artifacts/
 *       logs/
 *         events.ndjson
 *         permission-decisions.ndjson
 *       agents/
 *         {agentRunId}.json
 *         {agentRunId}.plan.json
 *       checkpoints/
 *       execution-state.json
 *       permissions.json
 */
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../config/index.js';

export interface RunPaths {
  runDir: string;
  inputDir: string;
  workspaceDir: string;
  projectDir: string;
  artifactsDir: string;
  logsDir: string;
  agentsDir: string;
  checkpointsDir: string;
  eventsLog: string;
  permissionLog: string;
  executionState: string;
  permissionsFile: string;
}

export function getRunPaths(runId: string): RunPaths {
  const config = getConfig();
  const runDir = path.join(config.runtimeDir, 'runs', runId);
  return {
    runDir,
    inputDir: path.join(runDir, 'input'),
    workspaceDir: path.join(runDir, 'workspace'),
    projectDir: path.join(runDir, 'workspace', 'project'),
    artifactsDir: path.join(runDir, 'artifacts'),
    logsDir: path.join(runDir, 'logs'),
    agentsDir: path.join(runDir, 'agents'),
    checkpointsDir: path.join(runDir, 'checkpoints'),
    eventsLog: path.join(runDir, 'logs', 'events.ndjson'),
    permissionLog: path.join(runDir, 'logs', 'permission-decisions.ndjson'),
    executionState: path.join(runDir, 'execution-state.json'),
    permissionsFile: path.join(runDir, 'permissions.json'),
  };
}

export function ensureRunDirectories(runId: string): RunPaths {
  const paths = getRunPaths(runId);
  for (const dir of [
    paths.runDir,
    paths.inputDir,
    paths.workspaceDir,
    paths.projectDir,
    paths.artifactsDir,
    paths.logsDir,
    paths.agentsDir,
    paths.checkpointsDir,
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

export function listRuns(): string[] {
  const config = getConfig();
  const runsDir = path.join(config.runtimeDir, 'runs');
  if (!fs.existsSync(runsDir)) return [];
  return fs.readdirSync(runsDir).filter(
    name => fs.statSync(path.join(runsDir, name)).isDirectory()
  );
}

export function runExists(runId: string): boolean {
  return fs.existsSync(getRunPaths(runId).runDir);
}

/**
 * List files in a directory recursively, returning relative paths.
 * Used for artifact tree and workspace tree.
 */
export function listFilesRecursive(dir: string, baseDir: string = dir): FileNode[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];
  for (const entry of entries) {
    // Skip hidden files/dirs and node_modules
    if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'target') continue;
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(baseDir, fullPath);
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'directory',
        children: listFilesRecursive(fullPath, baseDir),
      });
    } else {
      const stat = fs.statSync(fullPath);
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'file',
        size: stat.size,
        modified: stat.mtimeMs,
      });
    }
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
  children?: FileNode[];
}
