import * as fs from 'node:fs';
import * as path from 'node:path';
import { checksum } from './canonical.js';

export interface FileMigrationRecordCounts {
  executionStates: number;
  agents: number;
  agentPlans: number;
  lifecycleStates: number;
  workflowSnapshots: number;
  events: number;
  checkpoints: number;
  artifacts: number;
  artifactBytes: number;
}

export interface FileMigrationRunPlan {
  runId: string;
  valid: boolean;
  sourceChecksum?: string;
  records: FileMigrationRecordCounts;
  diagnostics: string[];
}

export interface FileMigrationPlan {
  sourceRoot: string;
  generatedAt: string;
  dryRun: true;
  runs: FileMigrationRunPlan[];
  totals: FileMigrationRecordCounts & { validRuns: number; invalidRuns: number };
}

/**
 * Produces a read-only, deterministic import plan for legacy runtime files.
 * It deliberately reports malformed runs individually so a later transactional
 * importer can migrate valid runs without treating the directory as all-or-nothing.
 */
export function planFileMigration(sourceRoot: string): FileMigrationPlan {
  if (!fs.existsSync(sourceRoot) || !fs.statSync(sourceRoot).isDirectory()) {
    throw new Error(`Migration source directory does not exist: ${path.resolve(sourceRoot)}`);
  }
  const runsRoot = resolveRunsRoot(sourceRoot);
  const runs = fs.existsSync(runsRoot)
    ? fs.readdirSync(runsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
    : [];
  const plans = runs.map(runId => planRun(path.join(runsRoot, runId), runId));
  const totals = plans.reduce<FileMigrationPlan['totals']>((total, plan) => {
    for (const key of Object.keys(plan.records) as Array<keyof FileMigrationRecordCounts>) total[key] += plan.records[key];
    if (plan.valid) total.validRuns += 1;
    else total.invalidRuns += 1;
    return total;
  }, emptyTotals());
  return { sourceRoot: runsRoot, generatedAt: new Date().toISOString(), dryRun: true, runs: plans, totals };
}

function planRun(runDir: string, runId: string): FileMigrationRunPlan {
  const records = emptyRecords();
  const diagnostics: string[] = [];
  const execution = readJson(path.join(runDir, 'execution-state.json'), 'execution state', diagnostics);
  if (execution) {
    records.executionStates = 1;
    if (!isRecord(execution) || execution.runId !== runId) diagnostics.push('execution state runId does not match its directory name');
    if (isRecord(execution) && isRecord(execution.metadata) && isRecord(execution.metadata.workflowSnapshot)) records.workflowSnapshots = 1;
  }

  const agentsDir = path.join(runDir, 'agents');
  for (const file of files(agentsDir, '.json')) {
    const value = readJson(file, `agent file ${path.basename(file)}`, diagnostics);
    if (file.endsWith('.plan.json')) records.agentPlans += value ? 1 : 0;
    else records.agents += value ? 1 : 0;
  }

  const lifecycle = readJson(path.join(runDir, 'artifacts', 'lifecycle-state.json'), 'lifecycle state', diagnostics);
  if (lifecycle) records.lifecycleStates = 1;
  records.events = countNdjson(path.join(runDir, 'logs', 'events.ndjson'), diagnostics);
  const checkpointFiles = [
    ...files(path.join(runDir, 'checkpoints'), '.json'),
    ...files(path.join(runDir, 'langgraph'), '.json').filter(file => path.basename(file) === 'latest.json'),
  ];
  for (const file of checkpointFiles) {
    if (readJson(file, `checkpoint ${path.basename(file)}`, diagnostics)) records.checkpoints += 1;
  }
  for (const file of recursiveFiles(path.join(runDir, 'artifacts'))) {
    if (path.basename(file) === 'lifecycle-state.json') continue;
    records.artifacts += 1;
    records.artifactBytes += fs.statSync(file).size;
  }

  if (!execution) diagnostics.unshift('execution-state.json is required');
  const sourceChecksum = execution ? checksum({ execution, agents: readJsonValues(agentsDir), lifecycle, events: readNdjsonValues(path.join(runDir, 'logs', 'events.ndjson')), checkpoints: checkpointFiles.flatMap(file => readJsonFileValue(file)) }) : undefined;
  return { runId, valid: diagnostics.length === 0, sourceChecksum, records, diagnostics };
}

function readJsonFileValue(file: string): unknown[] {
  try { return [JSON.parse(fs.readFileSync(file, 'utf8'))]; } catch { return []; }
}

function resolveRunsRoot(sourceRoot: string): string {
  const root = path.resolve(sourceRoot);
  return path.basename(root) === 'runs' ? root : path.join(root, 'runs');
}

function emptyRecords(): FileMigrationRecordCounts {
  return { executionStates: 0, agents: 0, agentPlans: 0, lifecycleStates: 0, workflowSnapshots: 0, events: 0, checkpoints: 0, artifacts: 0, artifactBytes: 0 };
}

function emptyTotals(): FileMigrationPlan['totals'] {
  return { ...emptyRecords(), validRuns: 0, invalidRuns: 0 };
}

function files(directory: string, extension: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(extension))
    .map(entry => path.join(directory, entry.name)).sort();
}

function recursiveFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const result: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) result.push(file);
    }
  };
  visit(directory);
  return result.sort();
}

function readJson(file: string, description: string, diagnostics: string[]): unknown | undefined {
  if (!fs.existsSync(file)) return undefined;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { diagnostics.push(`${description} is not valid JSON`); return undefined; }
}

function countNdjson(file: string, diagnostics: string[]): number {
  if (!fs.existsSync(file)) return 0;
  let count = 0;
  for (const [index, line] of fs.readFileSync(file, 'utf8').split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try { JSON.parse(line); count += 1; }
    catch { diagnostics.push(`event line ${index + 1} is not valid JSON`); }
  }
  return count;
}

function readJsonValues(directory: string): unknown[] {
  return files(directory, '.json').flatMap(file => {
    try { return [JSON.parse(fs.readFileSync(file, 'utf8'))]; } catch { return []; }
  });
}

function readNdjsonValues(file: string): unknown[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => {
    if (!line.trim()) return [];
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
