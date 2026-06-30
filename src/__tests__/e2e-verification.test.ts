import * as assert from 'assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import { ensureRunDirectories, getRunPaths } from '../runtime/paths.js';
import {
  detectProjectStartupCapabilities,
  selectApiBaseUrlConvention,
} from '../e2e/capabilities.js';
import {
  allocateServicePorts,
  startIntegrationHarness,
} from '../e2e/integrationHarness.js';
import {
  collectApiContractInputs,
  runApiContractCheck,
} from '../e2e/contract.js';
import {
  classifyE2EFailure,
  runE2EVerification,
} from '../e2e/runner.js';

test('startup capability detection records trusted frontend/backend evidence and API URL convention', () => {
  const projectRoot = makeTempProject('capability-detection');
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
    scripts: {
      dev: 'vite --host 127.0.0.1',
      server: 'node server.js',
    },
    dependencies: {
      vite: '^5.0.0',
      express: '^4.0.0',
    },
  }, null, 2));
  fs.writeFileSync(path.join(projectRoot, 'vite.config.ts'), 'export default {};');
  fs.writeFileSync(path.join(projectRoot, '.env'), 'VITE_API_BASE_URL=http://localhost:8080\n');

  const snapshot = detectProjectStartupCapabilities(projectRoot, '2026-06-30T00:00:00.000Z');

  assert.equal(snapshot.frontend?.command, 'npm run dev');
  assert.equal(snapshot.backend?.command, 'npm run server');
  assert.equal(snapshot.playwrightConfig, undefined);
  assert.equal(snapshot.trustedStartup, true);
  assert.equal(selectApiBaseUrlConvention(snapshot).name, 'VITE_API_BASE_URL');
  assert.equal(selectApiBaseUrlConvention(snapshot).source, 'env-file');
});

test('contract input collection detects backend endpoints and client mismatches', () => {
  const projectRoot = makeTempProject('contract-detection');
  fs.mkdirSync(path.join(projectRoot, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, 'src', 'routes.ts'),
    "router.get('/api/health', handler);\n"
  );
  fs.writeFileSync(
    path.join(projectRoot, 'src', 'client.ts'),
    "fetch('/api/missing');\n"
  );

  const inputs = collectApiContractInputs(projectRoot);
  const result = runApiContractCheck(projectRoot);

  assert.ok(inputs.some(input => input.kind === 'router'));
  assert.equal(result.status, 'failed');
  assert.ok(result.failures.some(failure => failure.includes('/api/missing')));
});

test('port allocation returns distinct session-scoped ports', async () => {
  const ports = await allocateServicePorts(['frontend', 'backend']);

  assert.ok(ports.frontend > 0);
  assert.ok(ports.backend > 0);
  assert.notEqual(ports.frontend, ports.backend);
});

test('integration harness records timeout failure and cleanup status', async () => {
  const projectRoot = makeTempProject('startup-timeout');
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
    scripts: {
      server: 'node never-ready.js',
    },
  }, null, 2));
  fs.writeFileSync(path.join(projectRoot, 'never-ready.js'), 'setInterval(() => {}, 1000);\n');
  const runId = `e2e-timeout-${Date.now()}`;
  const paths = ensureRunDirectories(runId);
  const capabilities = detectProjectStartupCapabilities(projectRoot);

  await assert.rejects(() => startIntegrationHarness({
    runId,
    appName: 'project',
    projectRoot,
    paths,
    capabilities,
    config: {
      enabled: true,
      browserConcurrency: 1,
      startupTimeoutMs: 500,
      readinessTimeoutMs: 500,
      artifactRetention: 'all',
      startupConfidenceThreshold: 'medium',
    },
  }), /Timed out waiting/);

  const manifestPath = path.join(paths.artifactsDir, 'project', 'e2e', 'startup-manifest.json');
  assert.equal(fs.existsSync(manifestPath), true);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  assert.equal(manifest.cleanup.attempted, true);
});

test('E2E runner classifies unsupported startup as non-product fallback', async () => {
  const projectRoot = makeTempProject('unsupported-startup');
  const runId = `e2e-unsupported-${Date.now()}`;
  const paths = ensureRunDirectories(runId);

  const result = await runE2EVerification({
    runId,
    appName: 'project',
    projectRoot,
    paths,
    config: {
      enabled: true,
      browserConcurrency: 1,
      startupTimeoutMs: 500,
      readinessTimeoutMs: 500,
      artifactRetention: 'all',
      startupConfidenceThreshold: 'medium',
    },
  });

  assert.equal(result.summary.status, 'unsupported');
  assert.equal(result.classification?.classification, 'environment');
  assert.ok(result.artifactPaths.includes('artifacts/project/e2e/verification-summary.md'));
});

test('E2E runner verifies generated frontend/backend services and writes app artifacts', async () => {
  const projectRoot = makeTempProject('fullstack-success');
  fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
    scripts: {
      dev: 'node frontend.js',
      server: 'node backend.js',
    },
    dependencies: {
      vite: '^5.0.0',
      express: '^4.0.0',
    },
  }, null, 2));
  fs.writeFileSync(path.join(projectRoot, 'vite.config.ts'), 'export default {};');
  fs.writeFileSync(path.join(projectRoot, 'backend.js'), [
    "const http = require('http');",
    "const port = Number(process.env.PORT);",
    "http.createServer((req, res) => {",
    "  if (req.url === '/health') { res.end('ok'); return; }",
    "  res.end(JSON.stringify({ ok: true }));",
    "}).listen(port, '127.0.0.1');",
  ].join('\n'));
  fs.writeFileSync(path.join(projectRoot, 'frontend.js'), [
    "const http = require('http');",
    "const port = Number(process.env.PORT);",
    "http.createServer((req, res) => {",
    "  res.setHeader('content-type', 'text/html');",
    "  res.end('<main><h1>Generated App</h1></main>');",
    "}).listen(port, '127.0.0.1');",
  ].join('\n'));
  const runId = `e2e-fullstack-${Date.now()}`;
  const paths = ensureRunDirectories(runId);

  const result = await runE2EVerification({
    runId,
    appName: 'project',
    projectRoot,
    paths,
    config: {
      enabled: true,
      browserConcurrency: 1,
      startupTimeoutMs: 3000,
      readinessTimeoutMs: 3000,
      artifactRetention: 'all',
      startupConfidenceThreshold: 'medium',
    },
  });

  assert.equal(result.summary.status, 'passed');
  assert.ok(result.artifactPaths.includes('artifacts/project/e2e/startup-manifest.json'));
  assert.ok(result.artifactPaths.includes('artifacts/project/e2e/api-smoke-results.json'));
  assert.ok(fs.existsSync(path.join(paths.artifactsDir, 'project', 'e2e', 'e2e-summary.json')));
});

test('failure classification helper keeps contract failures separate', () => {
  const result = classifyE2EFailure('contract', 'DTO mismatch', 'contract');

  assert.equal(result.classification, 'contract');
  assert.equal(result.source, 'contract');
});

function makeTempProject(name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ai-coding-${name}-`));
  return root;
}
