import * as fs from 'fs';
import * as path from 'path';
import { RunPaths } from '../../runtime/paths.js';
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
import { runBrowserVerification } from '../../integrations/playwright.js';
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
