import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { NodeTransitionService } from './nodeTransition.js';
import { PostgresDatabase, runStorageMigrations } from './postgres/database.js';
import { postgresRepositories, PostgresUnitOfWork } from './postgres/postgresUnitOfWork.js';

const ACTIVE_RUNS = 100;
const CONCURRENT_NODES = 20;
const EVENT_COUNT = 100_000;
const SESSION_LIST_P95_TARGET_MS = 300;
const STATE_UPDATE_P95_TARGET_MS = 200;
const TAKEOVER_TARGET_MS = 90_000;

export interface StorageLoadTestReport {
  tenantId: string;
  activeRunsCreated: number;
  concurrentNodeTransitions: number;
  eventCount: number;
  eventPages: number;
  sessionListP95Ms: number;
  stateUpdateP95Ms: number;
  eventPageP95Ms: number;
  takeoverMs: number;
  targets: {
    sessionListP95Ms: number;
    stateUpdateP95Ms: number;
    takeoverMs: number;
  };
  passed: boolean;
  completedAt: string;
}

export async function runStorageLoadTest(databaseUrl = process.env.DATABASE_URL): Promise<StorageLoadTestReport> {
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the storage load test.');
  const database = new PostgresDatabase({
    ...DEFAULT_STORAGE_CONFIG,
    databaseUrl,
    databaseSsl: process.env.DATABASE_SSL === 'true',
    databasePoolMin: 2,
    databasePoolMax: Math.max(CONCURRENT_NODES + 2, 24),
  });
  const tenantId = `load-test-${Date.now()}`;
  const context = { tenantId };
  const repositories = postgresRepositories(database);
  const transitions = new NodeTransitionService(new PostgresUnitOfWork(database));
  const runIds = Array.from({ length: ACTIVE_RUNS }, (_, index) => `${tenantId}-run-${String(index + 1).padStart(3, '0')}`);
  const eventRunId = `${tenantId}-event-run`;

  try {
    await runStorageMigrations(database);
    for (const runId of runIds) await repositories.runs.create(context, initialState(runId));
    const activeCount = Number((await database.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM runs WHERE tenant_id = $1 AND status = 'running'",
      [tenantId],
    )).rows[0]?.count ?? 0);
    if (activeCount !== ACTIVE_RUNS) throw new Error(`Expected ${ACTIVE_RUNS} active runs, found ${activeCount}.`);

    const listSamples = await samples(40, async () => { await repositories.runs.list(context, { limit: 100 }); });
    const updateSamples: number[] = [];
    for (let index = 0; index < ACTIVE_RUNS; index += 1) {
      const runId = runIds[index % runIds.length]!;
      const current = await repositories.runs.findById(context, runId);
      if (!current) throw new Error(`Load-test run '${runId}' disappeared.`);
      const state = structuredClone(current.value);
      state.metadata = { ...state.metadata, loadTestUpdate: index + 1 };
      const startedAt = performance.now();
      await repositories.runs.save(context, state, current.version);
      updateSamples.push(performance.now() - startedAt);
    }

    await Promise.all(runIds.slice(0, CONCURRENT_NODES).map(async (runId, index) => {
      const lease = await repositories.leases.acquire(context, `run:${runId}:node:work`, `load-worker-${index + 1}`, 10_000);
      if (!lease) throw new Error(`Could not acquire load-test lease for '${runId}'.`);
      const current = await repositories.runs.findById(context, runId);
      if (!current) throw new Error(`Load-test run '${runId}' disappeared before transition.`);
      const terminal = structuredClone(current.value);
      terminal.status = 'completed';
      terminal.completedAt = Date.now();
      terminal.nodes[0]!.status = 'completed';
      terminal.nodes[0]!.completedAt = terminal.completedAt;
      await transitions.commit(context, {
        run: { state: terminal, expectedVersion: current.version },
        lease,
        workerId: lease.ownerId,
        event: {
          id: `${runId}-completed`, type: 'pipeline_node_end', runId, nodeId: 'work', timestamp: Date.now(),
          data: { success: true, loadTest: true },
        },
      });
    }));

    await repositories.runs.create(context, initialState(eventRunId));
    const inserted = await database.query(`
      INSERT INTO run_events (tenant_id, event_id, run_id, sequence, event_type, node_id, payload, occurred_at)
      SELECT $1, $2 || sequence::text, $3, sequence, 'pipeline_node_end', 'load-event',
             jsonb_build_object('loadTest', true, 'sequence', sequence), now()
      FROM generate_series(1, $4::integer) AS sequence
    `, [tenantId, `${eventRunId}-event-`, eventRunId, EVENT_COUNT]);
    if (inserted.rowCount !== EVENT_COUNT) throw new Error(`Expected ${EVENT_COUNT} events, inserted ${inserted.rowCount}.`);
    await database.query(`
      INSERT INTO run_event_sequences (tenant_id, run_id, last_sequence) VALUES ($1, $2, $3)
      ON CONFLICT (tenant_id, run_id) DO UPDATE SET last_sequence = EXCLUDED.last_sequence
    `, [tenantId, eventRunId, EVENT_COUNT]);

    const pageSamples: number[] = [];
    let afterSequence = 0;
    let eventPages = 0;
    let observedEvents = 0;
    while (observedEvents < EVENT_COUNT) {
      const startedAt = performance.now();
      const page = await repositories.events.listByRun(context, eventRunId, { afterSequence, limit: 1_000 });
      pageSamples.push(performance.now() - startedAt);
      if (!page.items.length) throw new Error(`Event replay stopped at sequence ${afterSequence}.`);
      for (const event of page.items) {
        if (event.sequence !== afterSequence + 1) throw new Error(`Event gap: expected ${afterSequence + 1}, received ${event.sequence}.`);
        afterSequence = event.sequence;
      }
      observedEvents += page.items.length;
      eventPages += 1;
    }
    if (observedEvents !== EVENT_COUNT || afterSequence !== EVENT_COUNT) {
      throw new Error(`Event replay observed ${observedEvents}/${EVENT_COUNT}, last sequence ${afterSequence}.`);
    }

    const takeoverRunId = runIds.at(-1)!;
    const leaseKey = `run:${takeoverRunId}:node:takeover`;
    const oldLease = await repositories.leases.acquire(context, leaseKey, 'failed-load-worker', 250);
    if (!oldLease) throw new Error('Could not acquire takeover baseline lease.');
    const takeoverStartedAt = performance.now();
    let takeover = null;
    while (!takeover && performance.now() - takeoverStartedAt < TAKEOVER_TARGET_MS) {
      takeover = await repositories.leases.acquire(context, leaseKey, 'replacement-load-worker', 5_000);
      if (!takeover) await delay(25);
    }
    const takeoverMs = performance.now() - takeoverStartedAt;
    if (!takeover || takeover.fencingToken <= oldLease.fencingToken) throw new Error('Replacement Worker did not receive a newer fencing token.');

    const report: StorageLoadTestReport = {
      tenantId,
      activeRunsCreated: activeCount,
      concurrentNodeTransitions: CONCURRENT_NODES,
      eventCount: observedEvents,
      eventPages,
      sessionListP95Ms: round(p95(listSamples)),
      stateUpdateP95Ms: round(p95(updateSamples)),
      eventPageP95Ms: round(p95(pageSamples)),
      takeoverMs: round(takeoverMs),
      targets: {
        sessionListP95Ms: SESSION_LIST_P95_TARGET_MS,
        stateUpdateP95Ms: STATE_UPDATE_P95_TARGET_MS,
        takeoverMs: TAKEOVER_TARGET_MS,
      },
      passed: false,
      completedAt: new Date().toISOString(),
    };
    report.passed = report.sessionListP95Ms < report.targets.sessionListP95Ms
      && report.stateUpdateP95Ms < report.targets.stateUpdateP95Ms
      && report.takeoverMs < report.targets.takeoverMs;
    if (!report.passed) throw new Error(`Storage load-test targets were missed: ${JSON.stringify(report)}`);
    return report;
  } finally {
    await database.query('DELETE FROM execution_leases WHERE tenant_id = $1', [tenantId]).catch(() => undefined);
    await database.query('DELETE FROM runs WHERE tenant_id = $1', [tenantId]).catch(() => undefined);
    await database.close();
  }
}

function initialState(runId: string): ExecutionState {
  return {
    runId,
    name: runId,
    status: 'running',
    currentNodeIndex: 0,
    currentNodeId: 'work',
    nodes: [{ id: 'work', name: 'Work', status: 'running', failureCount: 0 }],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };
}

async function samples(count: number, work: () => Promise<void>): Promise<number[]> {
  const result: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    await work();
    result.push(performance.now() - startedAt);
  }
  return result;
}

function p95(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]!;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  runStorageLoadTest()
    .then(report => process.stdout.write(`${JSON.stringify(report, null, 2)}\n`))
    .catch(error => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
