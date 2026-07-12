import { spawn } from 'child_process';
import type {
  ExecutionReport,
  GeneratedScript,
} from '../../testing/artifacts.js';

export interface PytestExecutionOptions {
  cwd: string;
  timeoutMs?: number;
  command?: string;
  args?: string[];
  dryRun?: boolean;
  generatedAt?: number;
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
}

export interface ParsedPytestOutput {
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  total: number;
  dependencyErrors: string[];
}

export async function executePytestScript(
  script: GeneratedScript,
  options: PytestExecutionOptions,
): Promise<ExecutionReport> {
  const started = Date.now();
  const command = options.command ?? 'pytest';
  const args = options.args ?? ['-q', script.path.split('/').pop() ?? script.path];
  const result = options.dryRun
    ? {
        stdout: options.stdout ?? '',
        stderr: options.stderr ?? 'dry run',
        exitCode: options.exitCode ?? 0,
        timedOut: false,
      }
    : await runCommand({ command, args, cwd: options.cwd, timeoutMs: options.timeoutMs ?? 60_000 });
  const parsed = parsePytestOutput(result.stdout, result.stderr, result.exitCode);
  const status = result.timedOut
    ? 'blocked'
    : result.exitCode === 0 && parsed.failed === 0 && parsed.errored === 0
      ? 'passed'
      : 'failed';

  return {
    schemaVersion: 1,
    artifactKind: 'testing-execution-report',
    requirementId: script.requirementId,
    runId: script.runId,
    workflowInstanceId: script.workflowInstanceId,
    sourceNodeId: 'execute_scripts',
    status,
    generatedAt: options.generatedAt ?? Date.now(),
    testRunId: script.testRunId,
    deploymentSetId: script.deploymentSetId,
    environmentId: script.environmentId,
    upstreamArtifactIds: [],
    executionReportId: `report-${script.scriptId}`,
    executor: 'pytest',
    command: [command, ...args].join(' '),
    exitCode: result.exitCode,
    durationMs: Math.max(0, Date.now() - started),
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    dependencyErrors: parsed.dependencyErrors,
    evidenceArtifactIds: [],
    summary: {
      passed: parsed.passed,
      failed: parsed.failed,
      skipped: parsed.skipped,
      errored: parsed.errored,
      total: parsed.total,
    },
  };
}

export function parsePytestOutput(stdout: string, stderr = '', exitCode: number | null = null): ParsedPytestOutput {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let errored = 0;

  for (const line of stdout.split(/\r?\n/)) {
    const resultMatch = line.match(/\b(PASSED|FAILED|SKIPPED|ERROR)\b/);
    if (resultMatch) {
      if (resultMatch[1] === 'PASSED') passed += 1;
      if (resultMatch[1] === 'FAILED') failed += 1;
      if (resultMatch[1] === 'SKIPPED') skipped += 1;
      if (resultMatch[1] === 'ERROR') errored += 1;
    }
  }

  const summaryMatch = stdout.match(/(?:(\d+)\s+passed)?(?:,\s*)?(?:(\d+)\s+failed)?(?:,\s*)?(?:(\d+)\s+skipped)?(?:,\s*)?(?:(\d+)\s+error(?:ed|s)?)?/i);
  if (summaryMatch && summaryMatch[0].trim()) {
    passed = Number(summaryMatch[1] ?? passed);
    failed = Number(summaryMatch[2] ?? failed);
    skipped = Number(summaryMatch[3] ?? skipped);
    errored = Number(summaryMatch[4] ?? errored);
  }

  if (passed + failed + skipped + errored === 0 && exitCode !== null) {
    if (exitCode === 0) passed = 1;
    else failed = 1;
  }

  return {
    passed,
    failed,
    skipped,
    errored,
    total: passed + failed + skipped + errored,
    dependencyErrors: dependencyErrorsFrom(stderr),
  };
}

function runCommand(args: {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
}): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise(resolve => {
    const child = spawn(args.command, args.args, {
      cwd: args.cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      settled = true;
      resolve({ stdout, stderr, exitCode: -1, timedOut: true });
    }, args.timeoutMs);

    child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr?.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      resolve({ stdout, stderr: `${stderr}${err.message}`, exitCode: 127, timedOut: false });
    });
    child.on('close', code => {
      if (settled) return;
      clearTimeout(timeout);
      settled = true;
      resolve({ stdout, stderr, exitCode: code, timedOut: false });
    });
  });
}

function dependencyErrorsFrom(stderr: string): string[] {
  const errors: string[] = [];
  if (/command not found|ENOENT|not recognized|No module named|ModuleNotFoundError|ImportError/i.test(stderr)) {
    errors.push(stderr.trim() || 'pytest dependency is unavailable');
  }
  return errors;
}
