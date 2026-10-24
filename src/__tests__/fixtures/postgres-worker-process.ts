import { DEFAULT_STORAGE_CONFIG } from '../../config/storage.js';
import type { ExecutionState } from '../../persistence/executionTypes.js';
import type { Lease } from '../../storage/contracts/leaseRepository.js';
import { NodeTransitionService } from '../../storage/nodeTransition.js';
import { PostgresDatabase } from '../../storage/postgres/database.js';
import { postgresRepositories, PostgresUnitOfWork } from '../../storage/postgres/postgresUnitOfWork.js';

interface WorkerCommand {
  id: string;
  type: 'acquire' | 'commit' | 'shutdown';
  ttlMs?: number;
  resultName?: string;
}

const databaseUrl = process.env.DATABASE_URL;
const tenantId = process.env.TEST_TENANT_ID;
const runId = process.env.TEST_RUN_ID;
const nodeId = process.env.TEST_NODE_ID;
const workerId = process.env.TEST_WORKER_ID;

if (!databaseUrl || !tenantId || !runId || !nodeId || !workerId || !process.send) {
  throw new Error('PostgreSQL Worker fixture requires DATABASE_URL, test identity variables, and an IPC channel.');
}

const context = { tenantId };
const database = new PostgresDatabase({ ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false, databasePoolMin: 1, databasePoolMax: 2 });
const repositories = postgresRepositories(database);
const transitions = new NodeTransitionService(new PostgresUnitOfWork(database));
const leaseKey = `run:${runId}:node:${nodeId}`;
let lease: Lease | null = null;
let queue = Promise.resolve();

process.on('message', message => {
  queue = queue.then(() => handle(message as WorkerCommand)).catch(error => {
    send({ id: (message as WorkerCommand)?.id, ok: false, error: errorMessage(error), pid: process.pid });
  });
});

send({ type: 'ready', workerId, pid: process.pid });

async function handle(command: WorkerCommand): Promise<void> {
  if (command.type === 'acquire') {
    lease = await repositories.leases.acquire(context, leaseKey, workerId!, command.ttlMs ?? 5_000);
    send({ id: command.id, ok: true, acquired: Boolean(lease), lease, pid: process.pid });
    return;
  }
  if (command.type === 'commit') {
    if (!lease) throw new Error(`${workerId} has no lease to submit.`);
    const current = await repositories.runs.findById(context, runId!);
    if (!current) throw new Error(`Run '${runId}' does not exist.`);
    const terminal = structuredClone(current.value) as ExecutionState;
    terminal.name = command.resultName ?? workerId!;
    terminal.status = 'completed';
    terminal.completedAt = Date.now();
    terminal.updatedAt = terminal.completedAt;
    const node = terminal.nodes.find(item => item.id === nodeId);
    if (node) {
      node.status = 'completed';
      node.completedAt = terminal.completedAt;
    }
    const result = await transitions.commit(context, {
      run: { state: terminal, expectedVersion: current.version },
      lease,
      workerId,
      event: {
        id: `${runId}:${nodeId}:${workerId}:${lease.fencingToken}`,
        type: 'pipeline_node_end',
        runId: runId!,
        nodeId,
        timestamp: Date.now(),
        data: { success: true, workerId, pid: process.pid },
      },
    });
    send({ id: command.id, ok: true, result, fencingToken: lease.fencingToken, pid: process.pid });
    return;
  }
  if (command.type === 'shutdown') {
    await database.close();
    send({ id: command.id, ok: true, pid: process.pid });
    process.disconnect();
  }
}

function send(message: Record<string, unknown>): void {
  process.send?.(message);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
