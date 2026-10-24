import * as assert from 'node:assert/strict';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { WebSocket, type RawData } from 'ws';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { postgresRepositories } from '../storage/postgres/postgresUnitOfWork.js';

const databaseUrl = process.env.DATABASE_URL;

test('two API processes share PostgreSQL session authority', { skip: !databaseUrl, timeout: 30_000 }, async () => {
  const database = createDatabase();
  await runStorageMigrations(database);
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'two-api-postgres-'));
  const portA = await availablePort();
  let portB = await availablePort();
  while (portB === portA) portB = await availablePort();
  const apiA = startApi('api-a', portA, path.join(runtimeRoot, 'api-a'));
  const apiB = startApi('api-b', portB, path.join(runtimeRoot, 'api-b'));
  let restartedApiA: ChildProcess | undefined;
  let runId: string | undefined;
  let socket: WebSocket | undefined;
  try {
    const [healthA, healthB] = await Promise.all([waitForApi(apiA, portA), waitForApi(apiB, portB)]);
    assert.equal(healthA.storage.database, 'ok');
    assert.equal(healthB.storage.database, 'ok');
    assert.equal(healthA.storage.eventBus, 'ok');
    assert.equal(healthB.storage.eventBus, 'ok');
    assert.notEqual(apiA.pid, apiB.pid);

    const createResponse = await fetch(`http://127.0.0.1:${portA}/api/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'shared-postgres-session', description: 'created by api-a' }),
    });
    assert.equal(createResponse.status, 200);
    const created = await createResponse.json() as { runId: string };
    runId = created.runId;

    const readResponse = await fetch(`http://127.0.0.1:${portB}/api/sessions/${runId}`);
    assert.equal(readResponse.status, 200);
    const observed = await readResponse.json() as { state: ExecutionState };
    assert.equal(observed.state.runId, runId);
    assert.equal(observed.state.name, 'shared-postgres-session');

    socket = new WebSocket(`ws://127.0.0.1:${portB}/api/ws?runId=${runId}&afterSequence=1`);
    await waitForWebSocketMessage(socket, message => message.type === 'connected');
    const liveEvent = waitForWebSocketMessage(socket, message =>
      message.type === 'durable_event' && message.event?.type === 'pipeline_resumed',
    );
    const resumeResponse = await fetch(`http://127.0.0.1:${portA}/api/sessions/${runId}/resume`, { method: 'POST' });
    assert.equal(resumeResponse.status, 200);
    const resumed = await liveEvent;
    assert.equal(resumed.event.sequence, 2);

    await closeWebSocket(socket);
    socket = undefined;
    const suspendResponse = await fetch(`http://127.0.0.1:${portA}/api/sessions/${runId}/suspend`, { method: 'POST' });
    assert.equal(suspendResponse.status, 200);
    assert.equal((await suspendResponse.json() as { suspended: boolean }).suspended, true);

    socket = new WebSocket(`ws://127.0.0.1:${portB}/api/ws?runId=${runId}&afterSequence=2`);
    const replayed = await waitForWebSocketMessage(socket, message =>
      message.type === 'durable_event' && message.event?.type === 'session_suspended',
    );
    assert.equal(replayed.event.sequence, 3);
    const replayResponse = await fetch(`http://127.0.0.1:${portB}/api/sessions/${runId}/events?afterSequence=1`);
    assert.equal(replayResponse.status, 200);
    const replay = await replayResponse.json() as { events: Array<{ sequence: number }> };
    assert.deepEqual(replay.events.map(event => event.sequence), [2, 3]);

    await stopChild(apiA);
    restartedApiA = startApi('api-a-restarted', portA, path.join(runtimeRoot, 'api-a-restarted'));
    const restartedHealth = await waitForApi(restartedApiA, portA);
    assert.equal(restartedHealth.storage.eventBus, 'ok');
    const recoveredResponse = await fetch(`http://127.0.0.1:${portA}/api/sessions/${runId}`);
    assert.equal(recoveredResponse.status, 200);
    const recovered = await recoveredResponse.json() as { state: ExecutionState };
    assert.equal(recovered.state.name, 'shared-postgres-session');
  } finally {
    if (socket) await closeWebSocket(socket);
    await Promise.all([stopChild(apiA), stopChild(apiB), ...(restartedApiA ? [stopChild(restartedApiA)] : [])]);
    if (runId) await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', ['default', runId]);
    await database.close();
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('a second Worker process takes over after the lease owner is killed', { skip: !databaseUrl, timeout: 20_000 }, async () => {
  const database = createDatabase();
  await runStorageMigrations(database);
  const repositories = postgresRepositories(database);
  const tenantId = `dead-worker-${Date.now()}`;
  const runId = `dead-worker-run-${Date.now()}`;
  const nodeId = 'work';
  const initial: ExecutionState = {
    runId, name: 'before-worker-death', status: 'running', currentNodeIndex: 0, currentNodeId: nodeId,
    nodes: [{ id: nodeId, name: 'Work', status: 'running', failureCount: 0 }],
    permissionMode: 'default', modelOverrides: {}, startedAt: Date.now(), updatedAt: Date.now(),
  };
  await repositories.runs.create({ tenantId }, initial);
  const workerA = startWorker('worker-death-a', tenantId, runId, nodeId);
  const workerB = startWorker('worker-death-b', tenantId, runId, nodeId);
  try {
    await Promise.all([waitForWorker(workerA), waitForWorker(workerB)]);
    const owner = await workerCommand(workerA, { type: 'acquire', ttlMs: 250 });
    assert.equal(owner.acquired, true);
    const blocked = await workerCommand(workerB, { type: 'acquire', ttlMs: 250 });
    assert.equal(blocked.acquired, false);

    workerA.kill('SIGKILL');
    await waitForExit(workerA, 3_000);
    await delay(400);
    const takeover = await workerCommand(workerB, { type: 'acquire', ttlMs: 5_000 });
    assert.equal(takeover.acquired, true);
    assert.ok(Number(takeover.lease?.fencingToken) > Number(owner.lease?.fencingToken));
    await workerCommand(workerB, { type: 'commit', resultName: 'worker-death-takeover-won' });

    const stored = await repositories.runs.findById({ tenantId }, runId);
    assert.equal(stored?.value.name, 'worker-death-takeover-won');
    assert.equal((await repositories.events.listByRun({ tenantId }, runId)).items.length, 1);
  } finally {
    await Promise.all([shutdownWorker(workerA), shutdownWorker(workerB)]);
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [tenantId, runId]);
    await database.close();
  }
});

test('two Worker processes reject stale completion after lease takeover', { skip: !databaseUrl, timeout: 20_000 }, async () => {
  const database = createDatabase();
  await runStorageMigrations(database);
  const repositories = postgresRepositories(database);
  const tenantId = `multi-worker-${Date.now()}`;
  const runId = `multi-worker-run-${Date.now()}`;
  const nodeId = 'work';
  const initial: ExecutionState = {
    runId, name: 'before-takeover', status: 'running', currentNodeIndex: 0, currentNodeId: nodeId,
    nodes: [{ id: nodeId, name: 'Work', status: 'running', failureCount: 0 }],
    permissionMode: 'default', modelOverrides: {}, startedAt: Date.now(), updatedAt: Date.now(),
  };
  await repositories.runs.create({ tenantId }, initial);
  const workerA = startWorker('worker-a', tenantId, runId, nodeId);
  const workerB = startWorker('worker-b', tenantId, runId, nodeId);
  try {
    await Promise.all([waitForWorker(workerA), waitForWorker(workerB)]);
    assert.notEqual(workerA.pid, workerB.pid);
    const [attemptA, attemptB] = await Promise.all([
      workerCommand(workerA, { type: 'acquire', ttlMs: 250 }),
      workerCommand(workerB, { type: 'acquire', ttlMs: 250 }),
    ]);
    assert.equal(Number(attemptA.acquired) + Number(attemptB.acquired), 1, 'exactly one process must acquire the initial lease');
    const staleWorker = attemptA.acquired ? workerA : workerB;
    const takeoverWorker = attemptA.acquired ? workerB : workerA;
    const staleToken = Number((attemptA.acquired ? attemptA.lease : attemptB.lease)?.fencingToken);

    await delay(400);
    const takeover = await workerCommand(takeoverWorker, { type: 'acquire', ttlMs: 5_000 });
    assert.equal(takeover.acquired, true);
    assert.ok(Number(takeover.lease?.fencingToken) > staleToken);

    const stale = await workerCommand(staleWorker, { type: 'commit', resultName: 'stale-must-not-win' }, false);
    assert.equal(stale.ok, false);
    assert.match(String(stale.error), /no longer current/);
    const current = await workerCommand(takeoverWorker, { type: 'commit', resultName: 'takeover-won' });
    assert.equal(current.ok, true);

    const stored = await repositories.runs.findById({ tenantId }, runId);
    assert.equal(stored?.value.name, 'takeover-won');
    assert.equal(stored?.value.status, 'completed');
    const events = await repositories.events.listByRun({ tenantId }, runId);
    assert.equal(events.items.length, 1);
    assert.equal(events.items[0]?.data?.workerId, attemptA.acquired ? 'worker-b' : 'worker-a');
  } finally {
    await Promise.all([shutdownWorker(workerA), shutdownWorker(workerB)]);
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [tenantId, runId]);
    await database.close();
  }
});

function createDatabase(): PostgresDatabase {
  return new PostgresDatabase({
    ...DEFAULT_STORAGE_CONFIG,
    databaseUrl: databaseUrl!,
    databaseSsl: false,
    databasePoolMin: 1,
    databasePoolMax: 4,
  });
}

function startApi(workerId: string, port: number, runtimeDir: string): ChildProcess {
  fs.mkdirSync(runtimeDir, { recursive: true });
  const child = spawn(process.execPath, [path.join(process.cwd(), 'dist', 'server', 'app.js')], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      RUNTIME_DIR: runtimeDir,
      ARTIFACT_LOCAL_DIR: path.join(runtimeDir, 'artifact-store'),
      AI_CODING_WORKSPACE_ROOT: path.join(runtimeDir, 'workspaces'),
      AI_CODING_PROFILE: 'local',
      AI_CODING_STORAGE_DRIVER: 'postgres',
      AI_CODING_EVENT_BUS: 'postgres',
      AI_CODING_ARTIFACT_STORE: 'local',
      AI_CODING_WORKER_ID: workerId,
      AI_CODING_AUTO_DEMO: '0',
      DATABASE_URL: databaseUrl!,
      DATABASE_SSL: 'false',
      DATABASE_POOL_MIN: '1',
      DATABASE_POOL_MAX: '3',
      AI_CODING_LANGGRAPH_CHECKPOINTER: 'file',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  captureOutput(child);
  return child;
}

function startWorker(workerId: string, tenantId: string, runId: string, nodeId: string): ChildProcess {
  const child = fork(path.join(process.cwd(), 'dist', '__tests__', 'fixtures', 'postgres-worker-process.js'), [], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl!,
      TEST_TENANT_ID: tenantId,
      TEST_RUN_ID: runId,
      TEST_NODE_ID: nodeId,
      TEST_WORKER_ID: workerId,
    },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  captureOutput(child);
  const target = child as ChildProcess & { __ready?: Promise<any> };
  target.__ready = waitForMessage(child, value => value.type === 'ready');
  return child;
}

async function waitForApi(child: ChildProcess, port: number): Promise<any> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API process exited early (${child.exitCode}): ${await childOutput(child)}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      return await response.json();
    } catch {
      await delay(50);
    }
  }
  throw new Error(`API process did not become ready: ${await childOutput(child)}`);
}

async function waitForWorker(child: ChildProcess): Promise<void> {
  const message = await (child as ChildProcess & { __ready?: Promise<any> }).__ready;
  assert.equal(message.pid, child.pid);
}

async function workerCommand(
  child: ChildProcess,
  command: { type: 'acquire' | 'commit'; ttlMs?: number; resultName?: string },
  requireSuccess = true,
): Promise<any> {
  const id = `${child.pid}-${Date.now()}-${Math.random()}`;
  const response = waitForMessage(child, value => value.id === id);
  child.send?.({ ...command, id });
  const completed = await response;
  if (requireSuccess) assert.equal(completed.ok, true, completed.error);
  return completed;
}

async function shutdownWorker(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || !child.connected) return;
  const id = `shutdown-${child.pid}-${Date.now()}`;
  const response = waitForMessage(child, value => value.id === id);
  child.send?.({ type: 'shutdown', id });
  await response.catch(() => undefined);
  await waitForExit(child, 3_000);
}

function waitForMessage(child: ChildProcess, predicate: (value: any) => boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error(`Timed out waiting for process ${child.pid}: ${bufferedOutput(child)}`)), 10_000);
    const onMessage = (message: unknown) => { if (predicate(message)) finish(undefined, message); };
    const onExit = (code: number | null) => finish(new Error(`Process ${child.pid} exited with ${code}: ${bufferedOutput(child)}`));
    const finish = (error?: Error, message?: unknown) => {
      clearTimeout(timeout);
      child.off('message', onMessage);
      child.off('exit', onExit);
      error ? reject(error) : resolve(message);
    };
    child.on('message', onMessage);
    child.once('exit', onExit);
  });
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGINT');
  await waitForExit(child, 5_000);
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>(resolve => {
    const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, timeoutMs);
    child.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
}

async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

function bufferedOutput(child: ChildProcess): string {
  return String((child as ChildProcess & { __output?: string }).__output ?? '');
}

async function childOutput(child: ChildProcess): Promise<string> {
  return bufferedOutput(child);
}

function captureOutput(child: ChildProcess): void {
  const target = child as ChildProcess & { __output?: string };
  const append = (chunk: unknown) => { target.__output = `${target.__output ?? ''}${String(chunk)}`.slice(-8_000); };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function waitForWebSocketMessage(socket: WebSocket, predicate: (message: any) => boolean): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error('Timed out waiting for WebSocket message.')), 10_000);
    const onMessage = (data: RawData) => {
      try {
        const message = JSON.parse(data.toString());
        if (predicate(message)) finish(undefined, message);
      } catch {
        // Ignore malformed messages while waiting for the expected payload.
      }
    };
    const onError = (error: Error) => finish(error);
    const onClose = () => finish(new Error('WebSocket closed before the expected message arrived.'));
    const finish = (error?: Error, message?: unknown) => {
      clearTimeout(timeout);
      socket.off('message', onMessage);
      socket.off('error', onError);
      socket.off('close', onClose);
      error ? reject(error) : resolve(message);
    };
    socket.on('message', onMessage);
    socket.once('error', onError);
    socket.once('close', onClose);
  });
}

async function closeWebSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  const closed = new Promise<void>(resolve => socket.once('close', () => resolve()));
  socket.close();
  const didClose = await Promise.race([closed.then(() => true), delay(1_000).then(() => false)]);
  if (!didClose) socket.terminate();
}
