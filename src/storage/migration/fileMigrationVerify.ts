import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentState, PlanState } from '../../persistence/agentTypes.js';
import type { ExecutionState } from '../../persistence/executionTypes.js';
import type { PipelineEvent } from '../../events/types.js';
import type { LifecycleState } from '../../lifecycle/types.js';
import type { StorageContext } from '../contracts/common.js';
import type { UnitOfWork } from '../contracts/unitOfWork.js';
import { checksum } from './canonical.js';
import { planFileMigration } from './fileMigrationPlan.js';
import type { LangGraphCheckpointEnvelope } from '../../workflows/runtime/langgraph/checkpointer.js';

export interface FileMigrationVerification {
  runId: string;
  validSource: boolean;
  matched: boolean;
  sourceChecksum?: string;
  targetChecksum?: string;
  transcriptSampleMatched: boolean;
  lifecycleMatched: boolean;
  checkpointMatched: boolean;
  diagnostics: string[];
}

/** Read-only source/target verification after an import. */
export async function verifyFileMigration(args: {
  sourceRoot: string;
  runId: string;
  context: StorageContext;
  unitOfWork: UnitOfWork;
}): Promise<FileMigrationVerification> {
  const plan = planFileMigration(args.sourceRoot).runs.find(run => run.runId === args.runId);
  if (!plan) throw new Error(`Run '${args.runId}' was not found in the migration source.`);
  if (!plan.valid) return {
    runId: args.runId, validSource: false, matched: false, transcriptSampleMatched: false,
    lifecycleMatched: false, checkpointMatched: false, diagnostics: plan.diagnostics,
  };
  const runDir = runDirectory(args.sourceRoot, args.runId);
  const source = {
    execution: json<ExecutionState>(path.join(runDir, 'execution-state.json')),
    agents: agents(path.join(runDir, 'agents')),
    lifecycle: optionalJson<LifecycleState>(path.join(runDir, 'artifacts', 'lifecycle-state.json')),
    events: events(path.join(runDir, 'logs', 'events.ndjson')),
    checkpoint: sourceCheckpoint(runDir),
  };
  const target = await args.unitOfWork.transaction(args.context, async repositories => {
    const run = await repositories.runs.findById(args.context, args.runId);
    const agents = await allPages(cursor => repositories.agents.listByRun(args.context, args.runId, { cursor, limit: 500 }));
    const lifecycle = await repositories.lifecycle.findByRunId(args.context, args.runId);
    const events = await allPages(cursor => repositories.events.listByRun(args.context, args.runId, { cursor, limit: 500 }));
    const checkpoint = await repositories.checkpoints?.findLatest(args.context, args.runId) ?? null;
    return { execution: run?.value, agents: agents.map(item => item.value), lifecycle: lifecycle?.value, events: events.map(stripStoredEvent), checkpoint };
  });
  const sourceComparable = comparable(source);
  const targetComparable = comparable(target);
  const sourceChecksum = checksum(sourceComparable);
  const targetChecksum = checksum(targetComparable);
  const transcriptSampleMatched = compareTranscriptSample(source.events, target.events);
  const lifecycleMatched = checksum(source.lifecycle ?? null) === checksum(target.lifecycle ?? null);
  const checkpointMatched = checksum(source.checkpoint?.state ?? null) === checksum(target.checkpoint?.state ?? null);
  const diagnostics: string[] = [];
  if (sourceChecksum !== targetChecksum) diagnostics.push('Source and target canonical checksums differ.');
  if (!transcriptSampleMatched) diagnostics.push('Sampled transcript events differ after replay.');
  if (!lifecycleMatched) diagnostics.push('Lifecycle snapshot differs after replay.');
  if (!checkpointMatched) diagnostics.push('Runtime checkpoint differs after replay.');
  return {
    runId: args.runId, validSource: true,
    matched: sourceChecksum === targetChecksum && transcriptSampleMatched && lifecycleMatched && checkpointMatched,
    sourceChecksum, targetChecksum, transcriptSampleMatched, lifecycleMatched, checkpointMatched, diagnostics,
  };
}

function sourceCheckpoint(runDir: string): LangGraphCheckpointEnvelope | undefined {
  const latest = path.join(runDir, 'langgraph', 'latest.json');
  if (fs.existsSync(latest)) return json<LangGraphCheckpointEnvelope>(latest);
  const legacy = path.join(runDir, 'checkpoints');
  const files = fs.existsSync(legacy) ? fs.readdirSync(legacy).filter(file => file.endsWith('.json')).sort() : [];
  return files.length ? json<LangGraphCheckpointEnvelope>(path.join(legacy, files.at(-1)!)) : undefined;
}

function comparable(value: { execution?: ExecutionState; agents: AgentState[]; lifecycle?: LifecycleState; events: PipelineEvent[] }) {
  return {
    execution: value.execution ?? null,
    agents: [...value.agents].sort((a, b) => a.agentRunId.localeCompare(b.agentRunId)),
    lifecycle: value.lifecycle ?? null,
    events: value.events.map(event => ({ id: event.id, type: event.type, runId: event.runId, timestamp: event.timestamp, agentRunId: event.agentRunId, nodeId: event.nodeId, data: event.data })),
  };
}

function stripStoredEvent(event: PipelineEvent & { tenantId: string; sequence: number }): PipelineEvent {
  const { tenantId: _tenantId, sequence: _sequence, ...value } = event;
  return value;
}

function compareTranscriptSample(source: PipelineEvent[], target: PipelineEvent[]): boolean {
  if (source.length !== target.length) return false;
  if (!source.length) return true;
  const indexes = [...new Set([0, Math.floor((source.length - 1) / 2), source.length - 1])];
  return indexes.every(index => checksum(eventComparable(source[index])) === checksum(eventComparable(target[index])));
}

function eventComparable(event: PipelineEvent | undefined) {
  return event ? {
    id: event.id, type: event.type, runId: event.runId, timestamp: event.timestamp,
    agentRunId: event.agentRunId, nodeId: event.nodeId, data: event.data,
  } : null;
}

async function allPages<T>(read: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>): Promise<T[]> {
  const values: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await read(cursor);
    values.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return values;
}

function runDirectory(sourceRoot: string, runId: string): string {
  const root = path.resolve(sourceRoot);
  return path.basename(root) === 'runs' ? path.join(root, runId) : path.join(root, 'runs', runId);
}

function agents(directory: string): AgentState[] {
  if (!fs.existsSync(directory)) return [];
  const plans = new Map<string, PlanState>();
  for (const file of fs.readdirSync(directory).filter(file => file.endsWith('.plan.json')).sort()) {
    plans.set(file.slice(0, -'.plan.json'.length), json<PlanState>(path.join(directory, file)));
  }
  return fs.readdirSync(directory).filter(file => file.endsWith('.json') && !file.endsWith('.plan.json')).sort()
    .map(file => {
      const agent = json<AgentState>(path.join(directory, file));
      const plan = agent.plan ?? plans.get(agent.agentRunId);
      return plan ? { ...agent, plan } : agent;
    });
}

function events(file: string): PipelineEvent[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap(line => line.trim() ? [parse<PipelineEvent>(line, file)] : []);
}

function optionalJson<T>(file: string): T | undefined { return fs.existsSync(file) ? json<T>(file) : undefined; }
function json<T>(file: string): T { return parse<T>(fs.readFileSync(file, 'utf8'), file); }
function parse<T>(value: string, source: string): T {
  try { return JSON.parse(value) as T; }
  catch { throw new Error(`${source} is not valid JSON`); }
}
