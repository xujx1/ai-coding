import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import { ChildProcess, spawn } from 'child_process';
import { RunPaths } from '../runtime/paths.js';
import {
  createJavaProcessEnv,
  resolveJavaToolCommand,
  shellQuote,
} from '../tools/builtin/javaRuntime.js';
import { confidenceMeetsThreshold } from './config.js';
import { selectApiBaseUrlConvention } from './capabilities.js';
import {
  E2ERuntimeConfig,
  ProjectStartupCapabilitySnapshot,
  StartupCommandEvidence,
  StartupKind,
  StartupManifest,
  StartupManifestService,
} from './types.js';

export interface ServiceHandle {
  kind: StartupKind;
  process?: ChildProcess;
  port: number;
  url: string;
  command?: string;
  originalCommand?: string;
  readinessEndpoint?: string;
  logArtifactPath?: string;
}

export interface IntegrationHarnessRun {
  manifest: StartupManifest;
  services: ServiceHandle[];
  cleanup: () => Promise<void>;
  artifactPath: string;
}

export async function allocateServicePorts(
  serviceNames: string[]
): Promise<Record<string, number>> {
  const entries = await Promise.all(serviceNames.map(async name => [name, await allocatePort()] as const));
  return Object.fromEntries(entries);
}

export async function startIntegrationHarness(args: {
  runId: string;
  appName: string;
  projectRoot: string;
  paths: RunPaths;
  capabilities: ProjectStartupCapabilitySnapshot;
  config: E2ERuntimeConfig;
}): Promise<IntegrationHarnessRun> {
  const e2eDir = appE2EDir(args.paths, args.appName);
  fs.mkdirSync(e2eDir, { recursive: true });
  const manifestPath = path.join(e2eDir, 'startup-manifest.json');
  const manifest: StartupManifest = {
    schemaVersion: 1,
    runId: args.runId,
    appName: args.appName,
    projectRoot: args.projectRoot,
    fallbackReasons: [...args.capabilities.fallbackReasons],
    cleanup: {
      attempted: false,
      status: 'pending',
      errors: [],
    },
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const services: ServiceHandle[] = [];
  const ports = await allocateServicePorts(['backend', 'frontend']);

  try {
    if (args.capabilities.backend) {
      const backend = await startService({
        kind: 'backend',
        evidence: args.capabilities.backend,
        port: ports.backend,
        readinessEndpoints: args.capabilities.readinessEndpoints,
        config: args.config,
        projectRoot: args.projectRoot,
        logFile: path.join(e2eDir, 'backend-startup.log'),
        logArtifactPath: artifactPathFor(args.appName, 'backend-startup.log'),
      });
      services.push(backend);
      manifest.backend = serviceToManifest(backend, 'ready');
      writeManifest(manifestPath, manifest);
    } else {
      manifest.backend = { kind: 'backend', status: 'skipped' };
    }

    if (args.capabilities.frontend) {
      const backendUrl = manifest.backend?.url;
      const convention = backendUrl ? selectApiBaseUrlConvention(args.capabilities) : undefined;
      const env = convention && backendUrl ? { [convention.name]: backendUrl } : {};
      const frontend = await startService({
        kind: 'frontend',
        evidence: args.capabilities.frontend,
        port: ports.frontend,
        readinessEndpoints: ['/'],
        config: args.config,
        env,
        projectRoot: args.projectRoot,
        logFile: path.join(e2eDir, 'frontend-startup.log'),
        logArtifactPath: artifactPathFor(args.appName, 'frontend-startup.log'),
      });
      services.push(frontend);
      manifest.frontend = serviceToManifest(frontend, 'ready');
      if (convention && backendUrl) {
        manifest.apiBaseUrlInjection = {
          variableName: convention.name,
          value: backendUrl,
          source: convention.source,
        };
      }
    } else {
      manifest.frontend = { kind: 'frontend', status: 'skipped' };
    }
  } catch (err) {
    const message = (err as Error).message;
    if (!manifest.backend && args.capabilities.backend) {
      manifest.backend = serviceToManifest({
        kind: 'backend',
        port: ports.backend,
        url: `http://127.0.0.1:${ports.backend}`,
        command: args.capabilities.backend.command,
        logArtifactPath: artifactPathFor(args.appName, 'backend-startup.log'),
      }, 'failed', message);
    } else if (!manifest.frontend && args.capabilities.frontend) {
      manifest.frontend = serviceToManifest({
        kind: 'frontend',
        port: ports.frontend,
        url: `http://127.0.0.1:${ports.frontend}`,
        command: args.capabilities.frontend.command,
        logArtifactPath: artifactPathFor(args.appName, 'frontend-startup.log'),
      }, 'failed', message);
    }
    manifest.fallbackReasons.push(message);
    writeManifest(manifestPath, manifest);
    await cleanupServices(services, manifest, manifestPath);
    throw err;
  }

  writeManifest(manifestPath, manifest);
  return {
    manifest,
    services,
    artifactPath: artifactPathFor(args.appName, 'startup-manifest.json'),
    cleanup: () => cleanupServices(services, manifest, manifestPath),
  };
}

export function shouldStartCapability(
  evidence: StartupCommandEvidence | undefined,
  config: E2ERuntimeConfig
): boolean {
  return Boolean(evidence && confidenceMeetsThreshold(evidence.confidence, config.startupConfidenceThreshold));
}

async function startService(args: {
  kind: StartupKind;
  evidence: StartupCommandEvidence;
  port: number;
  readinessEndpoints: string[];
  config: E2ERuntimeConfig;
  env?: Record<string, string>;
  projectRoot: string;
  logFile: string;
  logArtifactPath: string;
}): Promise<ServiceHandle> {
  if (!shouldStartCapability(args.evidence, args.config)) {
    throw new Error(`${args.kind} startup confidence '${args.evidence.confidence}' is below threshold '${args.config.startupConfidenceThreshold}'.`);
  }
  const url = `http://127.0.0.1:${args.port}`;
  const prepared = prepareStartupCommand(args.evidence, args.port, args.projectRoot);
  const env = createJavaProcessEnv({
    PORT: String(args.port),
    HOST: '127.0.0.1',
    ...args.env,
    ...prepared.env,
  });
  fs.mkdirSync(path.dirname(args.logFile), { recursive: true });
  const logStream = fs.createWriteStream(args.logFile, { flags: 'a' });
  logStream.write([
    `# ${args.kind} startup`,
    `timestamp=${new Date().toISOString()}`,
    `cwd=${args.evidence.workingDirectory}`,
    `command=${prepared.command}`,
    prepared.command !== args.evidence.command ? `originalCommand=${args.evidence.command}` : undefined,
    prepared.profile ? `springProfile=${prepared.profile}` : undefined,
    `url=${url}`,
    '',
  ].filter(Boolean).join('\n'));
  logStream.write('\n');
  const child = spawn(prepared.command, {
    cwd: args.evidence.workingDirectory,
    shell: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: process.platform !== 'win32',
  });
  child.stdout?.on('data', chunk => logStream.write(String(chunk)));
  child.stderr?.on('data', chunk => logStream.write(String(chunk)));
  child.once('close', code => {
    logStream.write(`\n[process exited with code ${code ?? 'unknown'}]\n`);
    logStream.end();
  });
  try {
    const readinessEndpoint = await waitForReadiness(url, args.readinessEndpoints, args.config.readinessTimeoutMs);
    return {
      kind: args.kind,
      process: child,
      port: args.port,
      url,
      command: prepared.command,
      originalCommand: prepared.command === args.evidence.command ? undefined : args.evidence.command,
      readinessEndpoint,
      logArtifactPath: args.logArtifactPath,
    };
  } catch (err) {
    logStream.write(`\n[startup failed] ${(err as Error).message}\n`);
    await terminateProcess(child);
    throw err;
  }
}

function prepareStartupCommand(
  evidence: StartupCommandEvidence,
  port: number,
  projectRoot: string
): { command: string; env: NodeJS.ProcessEnv; profile?: string } {
  const command = evidence.command.trim();
  if (!isMavenSpringBootCommand(command)) {
    return { command, env: {} };
  }
  const profile = detectSpringTestProfile(projectRoot);
  const args = [`--server.port=${port}`];
  if (profile) args.push(`--spring.profiles.active=${profile}`);
  return {
    command: [
      resolveJavaToolCommand('mvn'),
      'spring-boot:run',
      ...(profile ? [`-Dspring-boot.run.profiles=${profile}`] : []),
      `-Dspring-boot.run.arguments=${shellQuote(args.join(' '))}`,
    ].join(' '),
    env: profile ? { SPRING_PROFILES_ACTIVE: profile } : {},
    profile,
  };
}

function isMavenSpringBootCommand(command: string): boolean {
  return /\bmvn(?:\s|$)/.test(command) && command.includes('spring-boot:run');
}

function detectSpringTestProfile(projectRoot: string): string | undefined {
  const candidates = [
    path.join(projectRoot, 'src/main/resources/application-test.yml'),
    path.join(projectRoot, 'src/main/resources/application-test.yaml'),
    path.join(projectRoot, 'src/main/resources/application-test.properties'),
  ];
  return candidates.some(candidate => fs.existsSync(candidate)) ? 'test' : undefined;
}

export async function waitForReadiness(
  baseUrl: string,
  endpoints: string[],
  timeoutMs: number
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  let lastError = '';
  const candidates = unique(['/', ...endpoints]);
  while (Date.now() < deadline) {
    for (const endpoint of candidates) {
      const url = new URL(endpoint, baseUrl).toString();
      try {
        const response = await fetch(url, { method: 'GET' });
        if (response.status < 500) return endpoint;
        lastError = `${url} returned ${response.status}`;
      } catch (err) {
        lastError = (err as Error).message;
      }
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for service readiness at ${baseUrl}: ${lastError}`);
}

async function cleanupServices(
  services: ServiceHandle[],
  manifest: StartupManifest,
  manifestPath: string
): Promise<void> {
  manifest.cleanup.attempted = true;
  for (const service of services) {
    if (!service.process || service.process.killed) continue;
    try {
      await terminateProcess(service.process);
    } catch (err) {
      manifest.cleanup.errors.push((err as Error).message);
    }
  }
  manifest.cleanup.status = manifest.cleanup.errors.length ? 'failed' : 'completed';
  manifest.updatedAt = new Date().toISOString();
  if (manifest.frontend?.status === 'ready') manifest.frontend.status = 'stopped';
  if (manifest.backend?.status === 'ready') manifest.backend.status = 'stopped';
  writeManifest(manifestPath, manifest);
}

function terminateProcess(child: ChildProcess): Promise<void> {
  return new Promise(resolve => {
    if (child.killed || child.exitCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32') {
          child.kill('SIGKILL');
        } else if (child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        }
      } catch {
        // Process may have already exited.
      }
      resolve();
    }, 1000);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      if (process.platform === 'win32') {
        child.kill('SIGTERM');
      } else if (child.pid) {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}

function serviceToManifest(
  service: Pick<ServiceHandle, 'kind' | 'command' | 'originalCommand' | 'port' | 'url' | 'readinessEndpoint' | 'logArtifactPath'>,
  status: StartupManifestService['status'],
  error?: string
): StartupManifestService {
  const now = new Date().toISOString();
  return {
    kind: service.kind,
    command: service.command,
    originalCommand: service.originalCommand,
    port: service.port,
    url: service.url,
    readinessEndpoint: service.readinessEndpoint,
    logArtifactPath: service.logArtifactPath,
    status,
    startedAt: now,
    readyAt: status === 'ready' ? now : undefined,
    error,
  };
}

function writeManifest(file: string, manifest: StartupManifest): void {
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2), 'utf-8');
}

function appE2EDir(paths: RunPaths, appName: string): string {
  return path.join(paths.artifactsDir, safeArtifactSegment(appName), 'e2e');
}

export function artifactPathFor(appName: string, file: string): string {
  return `artifacts/${safeArtifactSegment(appName)}/e2e/${file}`.replace(/\\/g, '/');
}

function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function safeArtifactSegment(value: string): string {
  return value.trim().replace(/[\\/]+/g, '-').replace(/^\.+$/, 'project') || 'project';
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
