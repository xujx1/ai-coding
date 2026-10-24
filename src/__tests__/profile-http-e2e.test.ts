import * as assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { createEmptyLifecycleState } from '../lifecycle/store.js';

test('ecom-demo HTTP E2E exposes applications requirements testing Ops and Demo-only route', { timeout: 30_000 }, async (t) => {
  if (!fs.existsSync(path.join(process.cwd(), 'demo'))) {
    t.skip('explicit Demo assets are unavailable in this production-only checkout');
    return;
  }
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecom-demo-http-'));
  const port = await availablePort();
  const child = startApi(port, runtimeRoot, {
    AI_CODING_PROFILE: 'ecom-demo',
    AI_CODING_STORAGE_DRIVER: 'file',
    AI_CODING_EVENT_BUS: 'memory',
    AI_CODING_ARTIFACT_STORE: 'local',
    AI_CODING_LANGGRAPH_CHECKPOINTER: 'file',
    AI_CODING_AUTO_DEMO: '0',
  });
  try {
    const health = await waitForApi(child, port);
    assert.equal(health.status, 'ok');

    const overview = await jsonRequest(port, '/api/management/overview');
    assert.equal(overview.response.status, 200);
    assert.ok(Array.isArray(overview.body.repositories) && overview.body.repositories.length > 0);
    assert.ok(Array.isArray(overview.body.requirements) && overview.body.requirements.length > 0);

    const opsApps = await jsonRequest(port, '/api/ops/apps');
    assert.ok(Array.isArray(opsApps.body.apps) && opsApps.body.apps.length > 0);
    const appId = String(opsApps.body.apps[0].appId);
    const requirementId = String(overview.body.requirements[0].requirementId);

    const requirementFiles = await jsonRequest(port, `/api/management/requirements/${encodeURIComponent(requirementId)}/files`);
    assert.equal(requirementFiles.response.status, 200);
    const filePath = firstFilePath(requirementFiles.body.tree);
    assert.ok(filePath);
    const requirementContent = await jsonRequest(port, `/api/management/requirements/${encodeURIComponent(requirementId)}/files/content?path=${encodeURIComponent(filePath!)}`);
    assert.equal(requirementContent.response.status, 200);
    assert.ok(String(requirementContent.body.content).length > 0);

    const ops = await jsonRequest(port, '/api/ops/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ appId, alert: 'demo timeout', workflowConfig: { enabledNodeIds: ['local-log-trace'] } }),
    });
    assert.equal(ops.response.status, 200);
    assert.equal(ops.body.analysis.app.appId, appId);

    const session = await jsonRequest(port, '/api/sessions', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: 'ecom HTTP testing E2E' }),
    });
    assert.equal(session.response.status, 200);
    const runId = String(session.body.runId);
    seedTestingLifecycle(runtimeRoot, runId, requirementId, appId);

    const testing = await jsonRequest(port, '/api/testing/workflows/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        requirementId, runId, workflowInstanceId: `ecom-http-${runId}`,
        requirementSummary: 'Ecom HTTP profile verification', appIds: [appId],
        autoApproveReviews: true, dryRunExecution: true,
      }),
    });
    assert.equal(testing.response.status, 200, JSON.stringify(testing.body));
    assert.equal(testing.body.workflow.status, 'completed');
    assert.ok(Array.isArray(testing.body.artifacts) && testing.body.artifacts.length > 0);

    const demoRoute = await fetch(`http://127.0.0.1:${port}/api/demo/full-flow`, { method: 'POST' });
    assert.notEqual(demoRoute.status, 404, 'the explicit Demo profile must register its Demo-only route');
  } finally {
    await stopChild(child);
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('production HTTP E2E starts without demo and exposes health and core APIs', {
  skip: process.env.RUN_PRODUCTION_WITHOUT_DEMO_E2E !== '1', timeout: 30_000,
}, async () => {
  assert.equal(fs.existsSync(path.join(process.cwd(), 'demo')), false, 'CI must physically make demo/ unavailable');
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'production-no-demo-http-'));
  const port = await availablePort();
  const child = startApi(port, runtimeRoot, {
    NODE_ENV: 'test',
    AI_CODING_ALLOW_INSECURE_TEST_INFRA: '1',
    AI_CODING_PROFILE: 'production',
    AI_CODING_STORAGE_DRIVER: 'postgres',
    AI_CODING_EVENT_BUS: 'postgres',
    AI_CODING_ARTIFACT_STORE: 's3',
    AI_CODING_LANGGRAPH_CHECKPOINTER: 'file',
  });
  try {
    const health = await waitForApi(child, port);
    assert.equal(health.status, 'ok');
    assert.equal(health.storage.database, 'ok');
    assert.equal(health.storage.eventBus, 'ok');
    assert.equal(health.storage.artifactStore, 'ok');

    for (const endpoint of ['/api/sessions', '/api/management/overview', '/api/ops/apps', '/api/ops/workbench', '/api/workflows', '/api/metrics']) {
      const response = await fetch(`http://127.0.0.1:${port}${endpoint}`);
      assert.equal(response.status, 200, `${endpoint} must remain available without demo/`);
    }
    const demoRoute = await fetch(`http://127.0.0.1:${port}/api/demo/full-flow`, { method: 'POST' });
    assert.equal(demoRoute.status, 404);
  } finally {
    await stopChild(child);
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

function seedTestingLifecycle(runtimeRoot: string, runId: string, requirementId: string, appId: string): void {
  const lifecycle = createEmptyLifecycleState({
    requirementId, runId,
    apps: [{ appId, role: 'primary', status: 'deployed', artifactIds: [], ciRunIds: [], testRunIds: [] }],
    metadata: { requirementSummary: 'Ecom HTTP profile verification' },
  });
  lifecycle.environments.push({ environmentId: 'ecom-http-env', requirementId, runId, mode: 'local-simulated' });
  lifecycle.deploymentSets.push({
    deploymentSetId: 'ecom-http-deployment', requirementId, runId, version: 1,
    environmentId: 'ecom-http-env', appIds: [appId], pipelineRunIds: [], artifactIds: [], createdAt: Date.now(),
  });
  const file = path.join(runtimeRoot, 'runs', runId, 'artifacts', 'lifecycle-state.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(lifecycle, null, 2));
}

function startApi(port: number, runtimeRoot: string, env: NodeJS.ProcessEnv): ChildProcess {
  const child = spawn(process.execPath, [path.join(process.cwd(), 'dist', 'server', 'app.js')], {
    cwd: process.cwd(),
    env: {
      ...process.env, ...env,
      PORT: String(port), HOST: '127.0.0.1', RUNTIME_DIR: runtimeRoot,
      ARTIFACT_LOCAL_DIR: path.join(runtimeRoot, 'artifacts'),
      AI_CODING_WORKSPACE_ROOT: path.join(runtimeRoot, 'workspaces'),
      AI_CODING_WORKER_ID: `profile-http-${port}`,
      AI_CODING_AUTO_DEMO: '0',
      DATABASE_POOL_MIN: '1', DATABASE_POOL_MAX: '3',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout?.on('data', chunk => { output += String(chunk); });
  child.stderr?.on('data', chunk => { output += String(chunk); });
  (child as ChildProcess & { capturedOutput?: () => string }).capturedOutput = () => output;
  return child;
}

async function waitForApi(child: ChildProcess, port: number): Promise<any> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.status === 200) return response.json();
    } catch { /* retry while startup completes */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const output = (child as ChildProcess & { capturedOutput?: () => string }).capturedOutput?.() ?? '';
  throw new Error(`API did not become ready (exit=${child.exitCode}): ${output}`);
}

async function jsonRequest(port: number, pathname: string, init?: RequestInit): Promise<{ response: Response; body: any }> {
  const response = await fetch(`http://127.0.0.1:${port}${pathname}`, init);
  const body = await response.json();
  return { response, body };
}

function firstFilePath(tree: any[]): string | undefined {
  for (const entry of tree ?? []) {
    if (entry.type === 'file' && typeof entry.path === 'string') return entry.path;
    const nested = firstFilePath(entry.children);
    if (nested) return nested;
  }
  return undefined;
}

async function availablePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill('SIGINT');
  await Promise.race([
    new Promise<void>(resolve => child.once('exit', () => resolve())),
    new Promise<void>(resolve => setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3_000)),
  ]);
}
