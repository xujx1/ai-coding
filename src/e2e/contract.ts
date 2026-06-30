import * as fs from 'fs';
import * as path from 'path';
import { RunPaths } from '../runtime/paths.js';
import {
  ApiContractInput,
  ApiContractResult,
  ApiEndpointEvidence,
  ApiSmokeResult,
} from './types.js';
import { artifactPathFor } from './integrationHarness.js';

export function collectApiContractInputs(projectRoot: string): ApiContractInput[] {
  const files = listFiles(projectRoot, 5);
  return [
    ...files.filter(file => /openapi|swagger/i.test(file) && /\.(json|ya?ml)$/.test(file)).map(file => ({
      kind: 'openapi' as const,
      path: file,
      endpoints: endpointsFromOpenApi(path.join(projectRoot, file)),
    })),
    ...files.filter(file => /controller/i.test(file)).map(file => ({
      kind: 'controller' as const,
      path: file,
      endpoints: endpointsFromController(path.join(projectRoot, file)),
    })),
    ...files.filter(file => /router|routes/i.test(file)).map(file => ({
      kind: 'router' as const,
      path: file,
      endpoints: endpointsFromRouter(path.join(projectRoot, file)),
    })),
    ...files.filter(file => /dto/i.test(file) && /\.(ts|java|kt)$/.test(file)).map(file => ({
      kind: 'dto' as const,
      path: file,
      endpoints: [],
    })),
    ...files.filter(file => /client|api/i.test(file) && /\.(ts|tsx|js|jsx)$/.test(file)).map(file => ({
      kind: 'generated-client' as const,
      path: file,
      endpoints: endpointsFromClient(path.join(projectRoot, file)),
    })),
  ];
}

export function runApiContractCheck(projectRoot: string): ApiContractResult {
  const inputs = collectApiContractInputs(projectRoot);
  const backendEndpoints = inputs
    .filter(input => input.kind === 'openapi' || input.kind === 'controller' || input.kind === 'router')
    .flatMap(input => input.endpoints);
  const clientEndpoints = inputs
    .filter(input => input.kind === 'generated-client')
    .flatMap(input => input.endpoints);
  const failures = clientEndpoints
    .filter(client => !backendEndpoints.some(backend => endpointKey(backend) === endpointKey(client)))
    .map(client => `Client expects ${client.method} ${client.path}, but backend evidence does not expose it.`);
  return {
    status: failures.length ? 'failed' : inputs.length ? 'passed' : 'skipped',
    inputs,
    comparedEndpoints: [...backendEndpoints, ...clientEndpoints],
    failures,
    generatedAt: new Date().toISOString(),
  };
}

export async function runApiSmokeChecks(args: {
  baseUrl?: string;
  readinessEndpoints: string[];
  changedEndpoints?: ApiEndpointEvidence[];
}): Promise<ApiSmokeResult> {
  if (!args.baseUrl) {
    return {
      status: 'skipped',
      checks: [],
      generatedAt: new Date().toISOString(),
    };
  }
  const endpointChecks = [
    ...args.readinessEndpoints.map(endpoint => ({ name: `readiness ${endpoint}`, method: 'GET', path: endpoint })),
    ...(args.changedEndpoints ?? []).slice(0, 5).map(endpoint => ({
      name: `${endpoint.method} ${endpoint.path}`,
      method: endpoint.method,
      path: endpoint.path,
    })),
  ];
  const checks = [];
  for (const check of uniqueChecks(endpointChecks)) {
    const url = new URL(check.path, args.baseUrl).toString();
    try {
      const response = await fetch(url, { method: check.method });
      checks.push({
        name: check.name,
        method: check.method,
        url,
        status: response.status,
        ok: response.status < 500,
      });
    } catch (err) {
      checks.push({
        name: check.name,
        method: check.method,
        url,
        ok: false,
        error: (err as Error).message,
      });
    }
  }
  return {
    status: checks.length ? checks.every(check => check.ok) ? 'passed' : 'failed' : 'skipped',
    baseUrl: args.baseUrl,
    checks,
    generatedAt: new Date().toISOString(),
  };
}

export function writeApiResultArtifacts(args: {
  paths: RunPaths;
  appName: string;
  contract: ApiContractResult;
  smoke: ApiSmokeResult;
}): string[] {
  const dir = path.join(args.paths.artifactsDir, args.appName, 'e2e');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'api-contract-results.json'), JSON.stringify(args.contract, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'api-smoke-results.json'), JSON.stringify(args.smoke, null, 2), 'utf-8');
  return [
    artifactPathFor(args.appName, 'api-contract-results.json'),
    artifactPathFor(args.appName, 'api-smoke-results.json'),
  ];
}

function endpointsFromOpenApi(file: string): ApiEndpointEvidence[] {
  const content = readText(file);
  const endpoints: ApiEndpointEvidence[] = [];
  const pathRegex = /["']?(\/[^"'\s:]+)["']?\s*:\s*\{?([\s\S]*?)(?=\n\s*["']?\/|\n\s*\})/g;
  let match: RegExpExecArray | null;
  while ((match = pathRegex.exec(content))) {
    const endpointPath = match[1];
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      if (new RegExp(`\\b${method}\\b`, 'i').test(match[2])) {
        endpoints.push({ method: method.toUpperCase(), path: endpointPath, source: file });
      }
    }
  }
  return endpoints;
}

function endpointsFromController(file: string): ApiEndpointEvidence[] {
  const content = readText(file);
  const classPrefix = content.match(/@RequestMapping\(["']([^"']+)["']\)/)?.[1] ?? '';
  const endpoints: ApiEndpointEvidence[] = [];
  const regex = /@(Get|Post|Put|Patch|Delete|Request)Mapping(?:\([^"']*["']([^"']*)["'][^)]*\))?/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    const method = match[1] === 'Request' ? 'GET' : match[1].toUpperCase();
    endpoints.push({ method, path: normalizeEndpoint(`${classPrefix}/${match[2] ?? ''}`), source: file });
  }
  return endpoints;
}

function endpointsFromRouter(file: string): ApiEndpointEvidence[] {
  const content = readText(file);
  const endpoints: ApiEndpointEvidence[] = [];
  const regex = /\.(get|post|put|patch|delete)\(["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    endpoints.push({ method: match[1].toUpperCase(), path: normalizeEndpoint(match[2]), source: file });
  }
  return endpoints;
}

function endpointsFromClient(file: string): ApiEndpointEvidence[] {
  const content = readText(file);
  const endpoints: ApiEndpointEvidence[] = [];
  const regex = /\b(GET|POST|PUT|PATCH|DELETE)\b|fetch\(["']([^"']+)["']|axios\.(get|post|put|patch|delete)\(["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content))) {
    const method = (match[1] ?? match[3] ?? 'GET').toUpperCase();
    const endpointPath = match[2] ?? match[4];
    if (endpointPath?.startsWith('/')) endpoints.push({ method, path: normalizeEndpoint(endpointPath), source: file });
  }
  return endpoints;
}

function listFiles(root: string, maxDepth: number, depth = 0): string[] {
  if (depth > maxDepth) return [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap(entry => {
    if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist', 'build'].includes(entry.name)) return [];
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return listFiles(full, maxDepth, depth + 1).map(file => `${entry.name}/${file}`);
    }
    return [entry.name];
  });
}

function readText(file: string): string {
  try {
    if (!fs.existsSync(file) || fs.statSync(file).size > 512_000) return '';
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

function normalizeEndpoint(value: string): string {
  const normalized = `/${value}`.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

function endpointKey(endpoint: ApiEndpointEvidence): string {
  return `${endpoint.method.toUpperCase()} ${normalizeEndpoint(endpoint.path)}`;
}

function uniqueChecks<T extends { method: string; path: string }>(checks: T[]): T[] {
  const seen = new Set<string>();
  return checks.filter(check => {
    const key = `${check.method} ${check.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
