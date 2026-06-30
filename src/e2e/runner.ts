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
        artifactPaths: [
          ...(startupArtifact ? [startupArtifact] : []),
          ...browser.artifactPaths,
        ],
        failureClassification: browser.ok ? undefined : 'frontend',
        fallbackReason: browser.ok ? undefined : browser.error,
        generatedAt: new Date().toISOString(),
      },
      contract,
      smoke,
      diagnostics: browser.diagnostics,
      classification: browser.ok ? undefined : classifyE2EFailure('frontend', browser.error ?? 'Browser verification failed.', 'playwright'),
      extraArtifactPaths: [
        ...(startupArtifact ? [startupArtifact] : []),
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
      extraArtifactPaths: startupArtifact ? [startupArtifact] : [],
    });
  } finally {
    await cleanup?.();
  }
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
    const importer = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<any>;
    const playwright = await importer('playwright');
    const browser = await playwright.chromium.launch();
    const page = await browser.newPage();
    page.on('console', (message: any) => {
      if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
    });
    page.on('requestfailed', (request: any) => {
      diagnostics.networkErrors.push({
        url: request.url(),
        method: request.method(),
        error: request.failure()?.errorText,
      });
    });
    const response = await page.goto(args.frontendUrl, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
    const screenshotDir = path.join(args.outputDir, 'screenshots');
    fs.mkdirSync(screenshotDir, { recursive: true });
    await page.screenshot({ path: path.join(screenshotDir, 'home.png'), fullPage: true });
    await browser.close();
    return {
      ok: Boolean(response?.ok()),
      error: response?.ok() ? undefined : `Frontend returned HTTP ${response?.status() ?? 'unknown'}.`,
      artifactPaths: ['screenshots/home.png'],
      diagnostics,
    };
  } catch (err) {
    if (args.frontendUrl) {
      const reportDir = path.join(args.outputDir, 'playwright-report');
      fs.mkdirSync(reportDir, { recursive: true });
      try {
        const response = await fetch(args.frontendUrl);
        const report = {
          mode: 'http-fallback',
          reason: `Playwright browser execution was unavailable: ${(err as Error).message}`,
          url: args.frontendUrl,
          status: response.status,
          ok: response.ok,
          generatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(path.join(reportDir, 'platform-fallback.json'), JSON.stringify(report, null, 2), 'utf-8');
        return {
          ok: response.ok,
          error: response.ok ? undefined : `Frontend returned HTTP ${response.status}.`,
          artifactPaths: ['playwright-report/platform-fallback.json'],
          diagnostics,
        };
      } catch (fallbackErr) {
        return {
          ok: false,
          error: (fallbackErr as Error).message,
          artifactPaths: [],
          diagnostics,
        };
      }
    }
    return {
      ok: false,
      error: (err as Error).message,
      artifactPaths: [],
      diagnostics,
    };
  }
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
    ...(args.extraArtifactPaths ?? []),
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
  timeoutMs: number
): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn(command, args, {
      cwd,
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
