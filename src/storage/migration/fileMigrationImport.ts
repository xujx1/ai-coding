import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import type { AgentState, PlanState } from '../../persistence/agentTypes.js';
import type { ExecutionState } from '../../persistence/executionTypes.js';
import type { PipelineEvent } from '../../events/types.js';
import type { LifecycleState } from '../../lifecycle/types.js';
import type { WorkflowDefinition } from '../../workflows/types.js';
import type { StorageContext } from '../contracts/common.js';
import type { StorageRepositories, UnitOfWork } from '../contracts/unitOfWork.js';
import type { ArtifactObject, ArtifactPutInput } from '../contracts/artifactStore.js';
import { planFileMigration } from './fileMigrationPlan.js';
import type { LangGraphCheckpointEnvelope } from '../../workflows/runtime/langgraph/checkpointer.js';

export interface FileRunImportResult {
  runId: string;
  imported: boolean;
  agents: number;
  lifecycle: boolean;
  workflow: boolean;
  events: number;
  artifacts: number;
  checkpoint: boolean;
}

export interface LegacyArtifactUploader {
  uploadAndCommit(ctx: StorageContext, input: ArtifactPutInput): Promise<ArtifactObject>;
}

/**
 * Imports one validated legacy run through a UnitOfWork. The implementation
 * intentionally refuses malformed plans before opening a transaction; callers
 * can therefore continue with other runs after recording the failure.
 */
export async function importFileRun(args: {
  sourceRoot: string;
  runId: string;
  context: StorageContext;
  unitOfWork: UnitOfWork;
  artifactUploader?: LegacyArtifactUploader;
}): Promise<FileRunImportResult> {
  const planned = planFileMigration(args.sourceRoot).runs.find(run => run.runId === args.runId);
  if (!planned) throw new Error(`Run '${args.runId}' was not found in the migration source.`);
  if (!planned.valid) throw new Error(`Run '${args.runId}' is not eligible for migration: ${planned.diagnostics.join('; ')}`);

  const runDir = resolveRunDirectory(args.sourceRoot, args.runId);
  const execution = requireJson<ExecutionState>(path.join(runDir, 'execution-state.json'));
  const agents = readAgents(path.join(runDir, 'agents'));
  const lifecycle = readOptionalJson<LifecycleState>(path.join(runDir, 'artifacts', 'lifecycle-state.json'));
  const workflow = workflowSnapshot(execution);
  const events = readEvents(path.join(runDir, 'logs', 'events.ndjson'));
  const checkpoint = readCheckpoint(runDir);
  const migrationContext = { ...args.context, preserveTimestamps: true };

  const result = await args.unitOfWork.transaction(args.context, async repositories => {
    const existing = await repositories.runs.findById(migrationContext, args.runId);
    if (existing) {
      return { runId: args.runId, imported: false, agents: 0, lifecycle: false, workflow: false, events: 0, artifacts: 0, checkpoint: false };
    }
    await repositories.runs.create(migrationContext, execution);
    for (const agent of agents) await repositories.agents.create(migrationContext, agent);
    if (lifecycle) await repositories.lifecycle.create(migrationContext, lifecycle);
    if (workflow) await repositories.workflows.save(migrationContext, workflow);
    for (const event of events) await repositories.events.append(migrationContext, event);
    if (checkpoint) await repositories.checkpoints.import(migrationContext, {
      runId: args.runId,
      checkpointId: checkpoint.id,
      state: checkpoint.state,
      metadata: checkpoint.metadata,
    });
    return { runId: args.runId, imported: true, agents: agents.length, lifecycle: Boolean(lifecycle), workflow: Boolean(workflow), events: events.length, artifacts: 0, checkpoint: Boolean(checkpoint) };
  });
  if (!args.artifactUploader) return result;
  const artifacts = await importArtifacts({ runDir, runId: args.runId, context: args.context, uploader: args.artifactUploader });
  return { ...result, artifacts };
}

function readCheckpoint(runDir: string): LangGraphCheckpointEnvelope | undefined {
  const latest = path.join(runDir, 'langgraph', 'latest.json');
  if (fs.existsSync(latest)) return requireJson<LangGraphCheckpointEnvelope>(latest);
  const legacy = path.join(runDir, 'checkpoints');
  const files = fs.existsSync(legacy)
    ? fs.readdirSync(legacy).filter(file => file.endsWith('.json')).sort()
    : [];
  if (!files.length) return undefined;
  const checkpoint = requireJson<LangGraphCheckpointEnvelope>(path.join(legacy, files.at(-1)!));
  return checkpoint?.state && checkpoint.runId ? checkpoint : undefined;
}

function resolveRunDirectory(sourceRoot: string, runId: string): string {
  const root = path.resolve(sourceRoot);
  return path.basename(root) === 'runs' ? path.join(root, runId) : path.join(root, 'runs', runId);
}

function readAgents(directory: string): AgentState[] {
  if (!fs.existsSync(directory)) return [];
  const plans = new Map<string, PlanState>();
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.plan.json')).sort()) {
    plans.set(file.slice(0, -'.plan.json'.length), requireJson<PlanState>(path.join(directory, file)));
  }
  return fs.readdirSync(directory).filter(file => file.endsWith('.json') && !file.endsWith('.plan.json')).sort()
    .map(file => {
      const agent = requireJson<AgentState>(path.join(directory, file));
      return { ...agent, plan: agent.plan ?? plans.get(agent.agentRunId) };
    });
}

function readEvents(file: string): PipelineEvent[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => line.trim() ? [parseJson<PipelineEvent>(line, file)] : []);
}

async function importArtifacts(args: {
  runDir: string;
  runId: string;
  context: StorageContext;
  uploader: LegacyArtifactUploader;
}): Promise<number> {
  const root = path.join(args.runDir, 'artifacts');
  if (!fs.existsSync(root)) return 0;
  let imported = 0;
  for (const file of recursiveFiles(root)) {
    const relativePath = path.relative(root, file).split(path.sep).join('/');
    if (relativePath === 'lifecycle-state.json' || relativePath === '.artifact-metadata.json') continue;
    await args.uploader.uploadAndCommit(args.context, {
      artifactId: `legacy-${crypto.createHash('sha256').update(`${args.runId}:${relativePath}`).digest('hex')}`,
      runId: args.runId,
      kind: `legacy/${path.extname(relativePath).slice(1) || 'file'}`,
      contentType: contentType(relativePath),
      body: fs.readFileSync(file),
      retentionClass: 'archive',
    });
    imported += 1;
  }
  return imported;
}

function recursiveFiles(directory: string): string[] {
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

function contentType(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.json') return 'application/json';
  if (extension === '.html') return 'text/html; charset=utf-8';
  if (extension === '.xml') return 'application/xml';
  if (extension === '.txt' || extension === '.md' || extension === '.log') return 'text/plain; charset=utf-8';
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.zip') return 'application/zip';
  return 'application/octet-stream';
}

function workflowSnapshot(execution: ExecutionState): WorkflowDefinition | undefined {
  const snapshot = execution.metadata?.workflowSnapshot;
  const definition = snapshot && typeof snapshot === 'object'
    ? (snapshot as Record<string, unknown>).definition
    : undefined;
  return isWorkflowDefinition(definition) ? definition : undefined;
}

function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
  return typeof value === 'object' && value !== null
    && typeof (value as Record<string, unknown>).id === 'string'
    && typeof (value as Record<string, unknown>).version === 'number'
    && Array.isArray((value as Record<string, unknown>).nodes);
}

function readOptionalJson<T>(file: string): T | undefined {
  return fs.existsSync(file) ? requireJson<T>(file) : undefined;
}

function requireJson<T>(file: string): T {
  return parseJson<T>(fs.readFileSync(file, 'utf8'), file);
}

function parseJson<T>(source: string, description: string): T {
  try { return JSON.parse(source) as T; }
  catch { throw new Error(`${description} is not valid JSON`); }
}
