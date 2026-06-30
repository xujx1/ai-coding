import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { RunPaths } from '../runtime/paths.js';
import { loadE2ERuntimeConfigFromEnv } from './config.js';
import { detectProjectStartupCapabilities } from './capabilities.js';
import {
  artifactPathFor,
  startIntegrationHarness,
} from './integrationHarness.js';
import {
  runApiContractCheck,
  runApiSmokeChecks,
  writeApiResultArtifacts,
} from './contract.js';
import {
  ApiContractResult,
  ApiSmokeResult,
  ConsoleNetworkDiagnostic,
  E2EFailureClassification,
  E2ERuntimeConfig,
  E2ESummary,
  FailureClassificationResult,
  ProjectStartupCapabilitySnapshot,
} from './types.js';

export interface E2EVerificationRunArgs {
  runId: string;
  appName: string;
  projectRoot: string;
  paths: RunPaths;
  config?: E2ERuntimeConfig;
  capabilities?: ProjectStartupCapabilitySnapshot;
}

export interface E2EVerificationRunResult {
  summary: E2ESummary;
  contract: ApiContractResult;
  smoke: ApiSmokeResult;
  diagnostics: ConsoleNetworkDiagnostic;
  classification?: FailureClassificationResult;
  artifactPaths: string[];
}

export async function runE2EVerification(
  args: E2EVerificationRunArgs
): Promise<E2EVerificationRunResult> {
  const config = args.config ?? loadE2ERuntimeConfigFromEnv();
  const capabilities = args.capabilities ?? detectProjectStartupCapabilities(args.projectRoot);
  const e2eDir = appE2EDir(args.paths, args.appName);
  fs.mkdirSync(e2eDir, { recursive: true });

  if (!config.enabled) {
    return writeTerminalArtifacts({
      paths: args.paths,
      appName: args.appName,
      summary: baseSummary(args.appName, 'skipped', ['E2E verification is disabled by runtime configuration.']),
      contract: skippedContract(),
      smoke: skippedSmoke(),
      diagnostics: emptyDiagnostics(),
      classification: {
        classification: 'environment',
        reason: 'E2E verification is disabled by runtime configuration.',
        source: 'fallback',
        generatedAt: new Date().toISOString(),
      },
    });
  }

  const contract = runApiContractCheck(args.projectRoot);
  let smoke = skippedSmoke();
  let cleanup: (() => Promise<void>) | undefined;
  let startupArtifact: string | undefined;
  let frontendUrl: string | undefined;
  let backendUrl: string | undefined;

  if (contract.status === 'failed') {
    return writeTerminalArtifacts({
      paths: args.paths,
      appName: args.appName,
      summary: baseSummary(args.appName, 'failed', contract.failures),
      contract,
      smoke,
      diagnostics: emptyDiagnostics(),
      classification: classifyE2EFailure('contract', contract.failures.join('\n'), 'contract'),
    });
  }

  if (!capabilities.frontend && !capabilities.playwrightConfig) {
    return writeTerminalArtifacts({
      paths: args.paths,
      appName: args.appName,
      summary: baseSummary(args.appName, 'unsupported', capabilities.fallbackReasons),
      contract,
      smoke,
      diagnostics: emptyDiagnostics(),
      classification: classifyE2EFailure('environment', capabilities.fallbackReasons.join('\n'), 'fallback'),
    });
  }

  try {
    startupArtifact = artifactPathFor(args.appName, 'startup-manifest.json');
    const harness = await startIntegrationHarness({
      runId: args.runId,
      appName: args.appName,
      projectRoot: args.projectRoot,
      paths: args.paths,
      capabilities,
      config,
    });
    cleanup = harness.cleanup;
    startupArtifact = harness.artifactPath;
    const startupArtifacts = unique([
      startupArtifact,
      harness.manifest.backend?.logArtifactPath,
      harness.manifest.frontend?.logArtifactPath,
    ].filter(Boolean) as string[]);
    frontendUrl = harness.manifest.frontend?.url;
    backendUrl = harness.manifest.backend?.url;
    smoke = await runApiSmokeChecks({
      baseUrl: backendUrl,
      readinessEndpoints: capabilities.readinessEndpoints,
      changedEndpoints: contract.comparedEndpoints,
    });
    if (smoke.status === 'failed') {
      return writeTerminalArtifacts({
        paths: args.paths,
        appName: args.appName,
        summary: baseSummary(args.appName, 'failed', ['API smoke checks failed.'], frontendUrl, backendUrl),
        contract,
        smoke,
        diagnostics: emptyDiagnostics(),
        classification: classifyE2EFailure('backend', 'API smoke checks failed.', 'smoke'),
        extraArtifactPaths: startupArtifact ? [startupArtifact] : [],
      });
    }

    const browser = await runBrowserVerification({
      projectRoot: args.projectRoot,
      outputDir: e2eDir,
      frontendUrl,
      playwrightConfig: capabilities.playwrightConfig
        ? path.join(args.projectRoot, capabilities.playwrightConfig)
        : undefined,
      timeoutMs: config.startupTimeoutMs,
    });
    return writeTerminalArtifacts({
      paths: args.paths,
      appName: args.appName,
      summary: {
        status: browser.ok ? 'passed' : 'failed',
        appName: args.appName,
        liveFrontendUrl: frontendUrl,
        liveBackendUrl: backendUrl,
        usedProjectPlaywrightConfig: Boolean(capabilities.playwrightConfig),
        artifactPaths: [],
        failureClassification: browser.ok ? undefined : 'frontend',
        fallbackReason: browser.ok ? undefined : browser.error,
        generatedAt: new Date().toISOString(),
      },
      contract,
      smoke,
      diagnostics: browser.diagnostics,
      classification: browser.ok ? undefined : classifyE2EFailure('frontend', browser.error ?? 'Browser verification failed.', 'playwright'),
      extraArtifactPaths: [
        ...startupArtifacts,
        ...browser.artifactPaths,
      ],
    });
  } catch (err) {
    const reason = (err as Error).message;
    return writeTerminalArtifacts({
      paths: args.paths,
      appName: args.appName,
      summary: baseSummary(args.appName, 'failed', [reason], frontendUrl, backendUrl),
      contract,
      smoke,
      diagnostics: emptyDiagnostics(),
      classification: classifyE2EFailure(classifyStartupError(reason), reason, 'startup'),
      extraArtifactPaths: startupFailureArtifacts(args.paths, args.appName, startupArtifact),
    });
  } finally {
    await cleanup?.();
  }
}

function startupFailureArtifacts(paths: RunPaths, appName: string, startupArtifact?: string): string[] {
  const e2eDir = appE2EDir(paths, appName);
  return [
    startupArtifact,
    fs.existsSync(path.join(e2eDir, 'backend-startup.log')) ? artifactPathFor(appName, 'backend-startup.log') : undefined,
    fs.existsSync(path.join(e2eDir, 'frontend-startup.log')) ? artifactPathFor(appName, 'frontend-startup.log') : undefined,
  ].filter(Boolean) as string[];
}

export function classifyE2EFailure(
  classification: E2EFailureClassification,
  reason: string,
  source: FailureClassificationResult['source']
): FailureClassificationResult {
  return {
    classification,
    reason,
    source,
    generatedAt: new Date().toISOString(),
  };
}

async function runBrowserVerification(args: {
  projectRoot: string;
  outputDir: string;
  frontendUrl?: string;
  playwrightConfig?: string;
  timeoutMs: number;
}): Promise<{
  ok: boolean;
  error?: string;
  artifactPaths: string[];
  diagnostics: ConsoleNetworkDiagnostic;
}> {
  const diagnostics = emptyDiagnostics();
  if (!args.frontendUrl && !args.playwrightConfig) {
    return {
      ok: false,
      error: 'No live frontend URL or project-owned Playwright config was available.',
      artifactPaths: [],
      diagnostics,
    };
  }
  if (args.playwrightConfig) {
    const reportPath = path.join(args.outputDir, 'playwright-report');
    const output = await runCommand(
      'npx',
      ['playwright', 'test', '--config', args.playwrightConfig, '--reporter=json'],
      args.projectRoot,
      args.timeoutMs
    );
    fs.mkdirSync(reportPath, { recursive: true });
    fs.writeFileSync(path.join(reportPath, 'project-playwright-output.json'), output.stdout || output.stderr || '{}', 'utf-8');
    return {
      ok: output.exitCode === 0,
      error: output.exitCode === 0 ? undefined : output.stderr || output.stdout || 'Project-owned Playwright failed.',
      artifactPaths: ['playwright-report/project-playwright-output.json'],
      diagnostics,
    };
  }

  try {
    return await runGeneratedPlaywrightSpec({
      projectRoot: args.projectRoot,
      outputDir: args.outputDir,
      frontendUrl: args.frontendUrl,
      timeoutMs: args.timeoutMs,
      diagnostics,
    });
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      artifactPaths: [],
      diagnostics,
    };
  }
}

async function runGeneratedPlaywrightSpec(args: {
  projectRoot: string;
  outputDir: string;
  frontendUrl?: string;
  timeoutMs: number;
  diagnostics: ConsoleNetworkDiagnostic;
}): Promise<{
  ok: boolean;
  error?: string;
  artifactPaths: string[];
  diagnostics: ConsoleNetworkDiagnostic;
}> {
  if (!args.frontendUrl) {
    return {
      ok: false,
      error: 'No live frontend URL was available for generated Playwright verification.',
      artifactPaths: [],
      diagnostics: args.diagnostics,
    };
  }
  const reportDir = path.join(args.outputDir, 'playwright-report');
  const screenshotDir = path.join(args.outputDir, 'screenshots');
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
  const specPath = path.join(args.outputDir, 'generated-playwright.spec.js');
  const executionSpecPath = path.join(process.cwd(), 'generated-e2e-tests', `${safeFileSegment(path.basename(args.outputDir))}-${Date.now()}.spec.js`);
  const outputPath = path.join(reportDir, 'generated-playwright-output.json');
  const screenshotPath = path.join(screenshotDir, 'home.png');
  const expectedKeywords = inferExpectedVisibleKeywords(args.projectRoot);
  fs.writeFileSync(specPath, renderGeneratedPlaywrightSpec(), 'utf-8');
  fs.mkdirSync(path.dirname(executionSpecPath), { recursive: true });
  fs.writeFileSync(executionSpecPath, fs.readFileSync(specPath, 'utf-8'), 'utf-8');
  const cliSpecPath = path.relative(process.cwd(), executionSpecPath);
  const output = await runCommand(
    'npx',
    ['playwright', 'test', cliSpecPath, '--reporter=json', `--output=${path.join(args.outputDir, 'test-results')}`],
    process.cwd(),
    Math.max(args.timeoutMs, 30000),
    {
      E2E_FRONTEND_URL: args.frontendUrl,
      E2E_SCREENSHOT_PATH: screenshotPath,
      E2E_EXPECTED_KEYWORDS: JSON.stringify(expectedKeywords),
    }
  );
  const rawOutput = output.stdout || output.stderr || '{}';
  fs.writeFileSync(outputPath, rawOutput, 'utf-8');
  fs.rmSync(executionSpecPath, { force: true });
  const consoleErrors = extractPlaywrightConsoleErrors(rawOutput);
  args.diagnostics.consoleErrors.push(...consoleErrors);
  return {
    ok: output.exitCode === 0,
    error: output.exitCode === 0 ? undefined : output.stderr || output.stdout || 'Generated Playwright verification failed.',
    artifactPaths: [
      'generated-playwright.spec.js',
      'playwright-report/generated-playwright-output.json',
      ...(fs.existsSync(screenshotPath) ? ['screenshots/home.png'] : []),
    ],
    diagnostics: args.diagnostics,
  };
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'e2e';
}

function renderGeneratedPlaywrightSpec(): string {
  return `import { test, expect } from '@playwright/test';

test('generated app verification', async ({ page }) => {
  const frontendUrl = process.env.E2E_FRONTEND_URL;
  const screenshotPath = process.env.E2E_SCREENSHOT_PATH;
  const expectedKeywords = JSON.parse(process.env.E2E_EXPECTED_KEYWORDS || '[]');
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => {
    consoleErrors.push(error.message);
  });

  const response = await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
  expect(response && response.ok(), 'frontend should return a successful HTTP response').toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

  const bodyText = (await page.locator('body').innerText()).trim();
  expect(bodyText.length, 'page should render visible text').toBeGreaterThan(0);
  if (expectedKeywords.length > 0) {
    expect(
      expectedKeywords.some(keyword => bodyText.includes(keyword)),
      'page should contain at least one expected business keyword'
    ).toBeTruthy();
  }
  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  expect(consoleErrors, 'page should not emit console errors').toEqual([]);
});
`;
}

function inferExpectedVisibleKeywords(projectRoot: string): string[] {
  const staticRoot = path.join(projectRoot, 'src/main/resources/static');
  const candidates = ['活动', '命中', '预览', '商品', 'SKU', '管理配置', '用户运行'];
  if (!fs.existsSync(staticRoot)) return [];
  const text = listFiles(staticRoot, 2)
    .filter(file => /\.(html|js|css|vue|tsx|jsx|ts)$/.test(file))
    .map(file => fs.readFileSync(path.join(staticRoot, file), 'utf-8'))
    .join('\n');
  return candidates.filter(keyword => text.includes(keyword)).slice(0, 5);
}

function listFiles(root: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth || !fs.existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, maxDepth, depth + 1).map(file => path.join(entry.name, file)));
    } else {
      files.push(entry.name);
    }
  }
  return files;
}

function extractPlaywrightConsoleErrors(rawOutput: string): string[] {
  try {
    const parsed = JSON.parse(rawOutput);
    const errors: string[] = [];
    for (const suite of parsed.suites ?? []) {
      collectSpecErrors(suite, errors);
    }
    return errors;
  } catch {
    return [];
  }
}

function collectSpecErrors(node: any, errors: string[]): void {
  for (const spec of node.specs ?? []) {
    for (const test of spec.tests ?? []) {
      for (const result of test.results ?? []) {
        for (const error of result.errors ?? []) {
          if (error.message) errors.push(String(error.message));
        }
      }
    }
  }
  for (const child of node.suites ?? []) collectSpecErrors(child, errors);
}

function writeTerminalArtifacts(args: {
  paths: RunPaths;
  appName: string;
  summary: E2ESummary;
  contract: ApiContractResult;
  smoke: ApiSmokeResult;
  diagnostics: ConsoleNetworkDiagnostic;
  classification?: FailureClassificationResult;
  extraArtifactPaths?: string[];
}): E2EVerificationRunResult {
  const dir = appE2EDir(args.paths, args.appName);
  fs.mkdirSync(dir, { recursive: true });
  const apiArtifacts = writeApiResultArtifacts({
    paths: args.paths,
    appName: safeArtifactSegment(args.appName),
    contract: args.contract,
    smoke: args.smoke,
  });
  fs.writeFileSync(path.join(dir, 'console-network-summary.json'), JSON.stringify(args.diagnostics, null, 2), 'utf-8');
  if (args.classification) {
    fs.writeFileSync(path.join(dir, 'failure-classification.json'), JSON.stringify(args.classification, null, 2), 'utf-8');
  }
  const summaryMd = renderSummary(args.summary, args.classification);
  fs.writeFileSync(path.join(dir, 'verification-summary.md'), summaryMd, 'utf-8');
  const artifactPaths = unique([
    ...apiArtifacts,
    artifactPathFor(args.appName, 'console-network-summary.json'),
    ...(args.classification ? [artifactPathFor(args.appName, 'failure-classification.json')] : []),
    artifactPathFor(args.appName, 'verification-summary.md'),
    ...(args.extraArtifactPaths ?? []).map(artifact => normalizeE2EArtifactPath(args.appName, artifact)),
    ...args.summary.artifactPaths.map(artifact => artifact.startsWith('artifacts/')
      ? artifact
      : artifactPathFor(args.appName, artifact)),
  ]);
  const summary: E2ESummary = {
    ...args.summary,
    artifactPaths,
    failureClassification: args.summary.failureClassification ?? args.classification?.classification,
  };
  fs.writeFileSync(path.join(dir, 'e2e-summary.json'), JSON.stringify(summary, null, 2), 'utf-8');
  const allArtifactPaths = unique([...artifactPaths, artifactPathFor(args.appName, 'e2e-summary.json')]);
  return {
    summary,
    contract: args.contract,
    smoke: args.smoke,
    diagnostics: args.diagnostics,
    classification: args.classification,
    artifactPaths: allArtifactPaths,
  };
}

function baseSummary(
  appName: string,
  status: E2ESummary['status'],
  reasons: string[],
  frontendUrl?: string,
  backendUrl?: string
): E2ESummary {
  return {
    status,
    appName,
    liveFrontendUrl: frontendUrl,
    liveBackendUrl: backendUrl,
    usedProjectPlaywrightConfig: false,
    fallbackReason: reasons.filter(Boolean).join('\n') || undefined,
    artifactPaths: [],
    generatedAt: new Date().toISOString(),
  };
}

function skippedContract(): ApiContractResult {
  return {
    status: 'skipped',
    inputs: [],
    comparedEndpoints: [],
    failures: [],
    generatedAt: new Date().toISOString(),
  };
}

function skippedSmoke(): ApiSmokeResult {
  return {
    status: 'skipped',
    checks: [],
    generatedAt: new Date().toISOString(),
  };
}

function emptyDiagnostics(): ConsoleNetworkDiagnostic {
  return {
    consoleErrors: [],
    networkErrors: [],
    generatedAt: new Date().toISOString(),
  };
}

function classifyStartupError(reason: string): E2EFailureClassification {
  const lower = reason.toLowerCase();
  if (lower.includes('timeout') || lower.includes('port') || lower.includes('command') || lower.includes('npx')) {
    return 'environment';
  }
  if (lower.includes('contract')) return 'contract';
  return 'backend';
}

function renderSummary(summary: E2ESummary, classification?: FailureClassificationResult): string {
  return [
    '# E2E Verification Summary',
    '',
    `- App: ${summary.appName}`,
    `- Status: ${summary.status}`,
    summary.liveFrontendUrl ? `- Frontend URL: ${summary.liveFrontendUrl}` : undefined,
    summary.liveBackendUrl ? `- Backend URL: ${summary.liveBackendUrl}` : undefined,
    `- Project Playwright Config: ${summary.usedProjectPlaywrightConfig ? 'yes' : 'no'}`,
    classification ? `- Failure Classification: ${classification.classification}` : undefined,
    summary.fallbackReason ? `- Fallback Reason: ${summary.fallbackReason}` : undefined,
  ].filter(Boolean).join('\n');
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  env?: NodeJS.ProcessEnv
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      stderr += `\nTimed out after ${timeoutMs}ms.`;
    }, timeoutMs);
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('close', exitCode => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
    child.on('error', err => {
      clearTimeout(timer);
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

function appE2EDir(paths: RunPaths, appName: string): string {
  return path.join(paths.artifactsDir, safeArtifactSegment(appName), 'e2e');
}

function safeArtifactSegment(value: string): string {
  return value.trim().replace(/[\\/]+/g, '-').replace(/^\.+$/, 'project') || 'project';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeE2EArtifactPath(appName: string, artifact: string): string {
  return artifact.startsWith('artifacts/') ? artifact : artifactPathFor(appName, artifact);
}
