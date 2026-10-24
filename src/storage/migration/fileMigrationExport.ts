import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AgentState } from '../../persistence/agentTypes.js';
import type { PipelineEvent } from '../../events/types.js';
import type { StorageContext } from '../contracts/common.js';
import type { UnitOfWork } from '../contracts/unitOfWork.js';
import { checksum } from './canonical.js';

export interface FileMigrationExportResult {
  runId: string;
  directory: string;
  checksum: string;
  agents: number;
  events: number;
  lifecycle: boolean;
}

/** Exports the stable read models to a fresh, file-compatible rollback snapshot. */
export async function exportFileMigration(args: {
  destinationRoot: string;
  runId: string;
  context: StorageContext;
  unitOfWork: UnitOfWork;
}): Promise<FileMigrationExportResult> {
  const snapshot = await args.unitOfWork.transaction(args.context, async repositories => {
    const execution = await repositories.runs.findById(args.context, args.runId);
    if (!execution) throw new Error(`Run '${args.runId}' was not found in the authoritative target.`);
    const agents = await allPages(cursor => repositories.agents.listByRun(args.context, args.runId, { cursor, limit: 500 }));
    const lifecycle = await repositories.lifecycle.findByRunId(args.context, args.runId);
    const events = await allPages(cursor => repositories.events.listByRun(args.context, args.runId, { cursor, limit: 500 }));
    return { execution: execution.value, agents: agents.map(item => item.value), lifecycle: lifecycle?.value, events: events.map(stripEvent) };
  });
  const runsRoot = path.basename(path.resolve(args.destinationRoot)) === 'runs'
    ? path.resolve(args.destinationRoot)
    : path.join(path.resolve(args.destinationRoot), 'runs');
  const destination = path.resolve(runsRoot, safeRunId(args.runId));
  if (destination !== path.join(runsRoot, safeRunId(args.runId))) throw new Error('Export path escaped the requested destination root.');
  if (fs.existsSync(destination)) throw new Error(`Export destination already exists: ${destination}`);
  const staging = `${destination}.staging-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(path.join(staging, 'agents'), { recursive: true });
    fs.mkdirSync(path.join(staging, 'artifacts'), { recursive: true });
    fs.mkdirSync(path.join(staging, 'logs'), { recursive: true });
    writeJson(path.join(staging, 'execution-state.json'), snapshot.execution);
    for (const agent of snapshot.agents) writeAgent(staging, agent);
    if (snapshot.lifecycle) writeJson(path.join(staging, 'artifacts', 'lifecycle-state.json'), snapshot.lifecycle);
    fs.writeFileSync(path.join(staging, 'logs', 'events.ndjson'), snapshot.events.map(event => JSON.stringify(event)).join('\n') + (snapshot.events.length ? '\n' : ''), 'utf8');
    const value = comparable(snapshot);
    const snapshotChecksum = checksum(value);
    const restored = readSnapshot(staging);
    if (checksum(comparable(restored)) !== snapshotChecksum) {
      throw new Error(`Exported rollback snapshot for '${args.runId}' failed checksum verification.`);
    }
    const result: FileMigrationExportResult = {
      runId: args.runId, directory: destination, checksum: snapshotChecksum, agents: snapshot.agents.length,
      events: snapshot.events.length, lifecycle: Boolean(snapshot.lifecycle),
    };
    writeJson(path.join(staging, 'migration-export.json'), result);
    fs.mkdirSync(runsRoot, { recursive: true });
    fs.renameSync(staging, destination);
    return result;
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function writeAgent(staging: string, agent: AgentState): void {
  const { plan, ...state } = agent;
  writeJson(path.join(staging, 'agents', `${safeFileName(agent.agentRunId)}.json`), state);
  if (plan) writeJson(path.join(staging, 'agents', `${safeFileName(agent.agentRunId)}.plan.json`), plan);
}

function comparable(snapshot: { execution: unknown; agents: AgentState[]; lifecycle?: unknown; events: PipelineEvent[] }) {
  return {
    execution: snapshot.execution,
    agents: [...snapshot.agents].sort((a, b) => a.agentRunId.localeCompare(b.agentRunId)),
    lifecycle: snapshot.lifecycle ?? null,
    events: snapshot.events.map(event => ({
      id: event.id, type: event.type, runId: event.runId, timestamp: event.timestamp,
      agentRunId: event.agentRunId ?? null, nodeId: event.nodeId ?? null, data: event.data ?? null,
    })),
  };
}

function stripEvent(event: PipelineEvent & { tenantId: string; sequence: number }): PipelineEvent {
  const { tenantId: _tenantId, sequence: _sequence, ...value } = event;
  return value;
}

async function allPages<T>(read: (cursor?: string) => Promise<{ items: T[]; nextCursor?: string }>): Promise<T[]> {
  const result: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await read(cursor);
    result.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return result;
}

function safeRunId(runId: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(runId) || runId === '.' || runId === '..') throw new Error(`Invalid run ID for export: ${runId}`);
  return runId;
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-');
}

function writeJson(file: string, value: unknown): void {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readSnapshot(directory: string): { execution: unknown; agents: AgentState[]; lifecycle?: unknown; events: PipelineEvent[] } {
  const agentsDir = path.join(directory, 'agents');
  const plans = new Map<string, AgentState['plan']>();
  for (const file of fs.readdirSync(agentsDir).filter(file => file.endsWith('.plan.json'))) {
    plans.set(file.slice(0, -'.plan.json'.length), JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8')));
  }
  const agents = fs.readdirSync(agentsDir).filter(file => file.endsWith('.json') && !file.endsWith('.plan.json')).map(file => {
    const state = JSON.parse(fs.readFileSync(path.join(agentsDir, file), 'utf8')) as AgentState;
    const plan = plans.get(path.basename(file, '.json'));
    return plan ? { ...state, plan } : state;
  });
  const lifecycleFile = path.join(directory, 'artifacts', 'lifecycle-state.json');
  const eventsFile = path.join(directory, 'logs', 'events.ndjson');
  return {
    execution: JSON.parse(fs.readFileSync(path.join(directory, 'execution-state.json'), 'utf8')),
    agents,
    lifecycle: fs.existsSync(lifecycleFile) ? JSON.parse(fs.readFileSync(lifecycleFile, 'utf8')) : undefined,
    events: fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').split(/\r?\n/).flatMap(line => line.trim() ? [JSON.parse(line) as PipelineEvent] : []) : [],
  };
}
