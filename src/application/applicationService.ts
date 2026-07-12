import * as fs from 'fs';
import * as path from 'path';
import { createEcomLocalGitService } from '../integrations/git.js';

export interface ApplicationManagementServiceInfo {
  module: 'application';
  responsibility: string;
}

export interface ManagedApplication {
  appId: string;
  repoId: string;
  name: string;
  root: string;
  description?: string;
  dependencies: string[];
  apiCount: number;
  codeSignals: string[];
  provider: 'local-git-service';
  remoteUrl: string;
  defaultBranch?: string;
}

export function describeApplicationManagementService(): ApplicationManagementServiceInfo {
  return {
    module: 'application',
    responsibility: 'Application repository inventory, application metadata, Git status, and application code downloads.',
  };
}

export function listManagedApplications(workspaceRoot = process.cwd()): ManagedApplication[] {
  const ecomRoot = path.join(workspaceRoot, 'demo', 'ecom');
  if (!fs.existsSync(ecomRoot) || !fs.statSync(ecomRoot).isDirectory()) return [];

  const dependencyMap = readDependencyMap(ecomRoot);
  const registry = readAppsRegistry(ecomRoot);
  const service = createEcomLocalGitService(ecomRoot);

  return service.listRepositories()
    .filter(repo => fs.existsSync(repo.root))
    .map(repo => {
      const appId = repo.appId ?? repo.repoId;
      const registryApp = registry.get(appId);
      return {
        appId,
        repoId: repo.repoId,
        name: registryApp?.name ?? repo.name,
        root: registryApp?.localPath
          ? resolveAppRoot(ecomRoot, registryApp.localPath)
          : repo.root,
        description: registryApp?.description ?? readApplicationDescription(repo.root, appId),
        dependencies: dependencyMap.get(appId) ?? [],
        apiCount: countApiRoutes(repo.root),
        codeSignals: detectCodeSignals(repo.root),
        provider: repo.provider,
        remoteUrl: repo.remoteUrl,
        defaultBranch: repo.defaultBranch,
      };
    })
    .sort((a, b) => a.appId.localeCompare(b.appId));
}

export function getManagementOverview(): never {
  throw new Error('Application management overview is still served by src/server/app.ts during the staged migration.');
}

export function downloadApplicationRepository(): never {
  throw new Error('Application repository download is still served by src/server/app.ts during the staged migration.');
}

function resolveAppRoot(ecomRoot: string, localPath: string): string {
  return path.isAbsolute(localPath) ? localPath : path.join(ecomRoot, localPath);
}

function readAppsRegistry(ecomRoot: string): Map<string, { name?: string; description?: string; localPath?: string }> {
  const registryPath = path.join(ecomRoot, 'spaces', 'knowledge', 'knowledge-base', 'registry', 'apps.json');
  const result = new Map<string, { name?: string; description?: string; localPath?: string }>();
  const registry = readJson<{ apps?: Array<{ appId?: string; name?: string; description?: string; domains?: string[]; tags?: string[]; codeRepo?: { localPath?: string; repoPath?: string } }> }>(registryPath);
  for (const app of registry?.apps ?? []) {
    if (!app.appId) continue;
    result.set(app.appId, {
      name: app.name,
      description: app.description ?? describeApplicationFromMetadata(app.appId, app.domains, app.tags),
      localPath: app.codeRepo?.localPath ?? app.codeRepo?.repoPath,
    });
  }
  return result;
}

function describeApplicationFromMetadata(appId: string, domains?: string[], tags?: string[]): string {
  return [domains?.join('/'), tags?.join('、')].filter(Boolean).join(' · ') || `${appId} 应用`;
}

function readDependencyMap(ecomRoot: string): Map<string, string[]> {
  const mapPath = path.join(ecomRoot, 'spaces', 'knowledge', 'knowledge-base', 'registry', 'dependency-map.json');
  const raw = readJson<Record<string, unknown>>(mapPath);
  const result = new Map<string, string[]>();
  const edges = Array.isArray(raw?.edges) ? raw.edges : [];
  for (const edge of edges) {
    if (!isRecord(edge)) continue;
    const from = firstString(edge.from, edge.fromAppId, edge.source, edge.sourceApp, edge.appId);
    const to = firstString(edge.to, edge.toAppId, edge.target, edge.targetApp, edge.dependsOn);
    if (!from || !to) continue;
    result.set(from, Array.from(new Set([...(result.get(from) ?? []), to])));
  }
  const dependencies = isRecord(raw?.dependencies) ? raw.dependencies : undefined;
  if (dependencies) {
    for (const [appId, value] of Object.entries(dependencies)) {
      if (Array.isArray(value)) {
        result.set(appId, Array.from(new Set([...value.map(String), ...(result.get(appId) ?? [])])));
      }
    }
  }
  return result;
}

function readApplicationDescription(root: string, appId: string): string | undefined {
  const knowledgeDescription = readDomainKnowledgeDescription(root);
  if (knowledgeDescription) return knowledgeDescription;
  for (const name of ['README.md', 'README.MD', 'readme.md']) {
    const readmePath = path.join(root, name);
    if (!fs.existsSync(readmePath) || !fs.statSync(readmePath).isFile()) continue;
    const paragraph = fs.readFileSync(readmePath, 'utf-8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .find(line => line && !line.startsWith('#') && !line.startsWith('```'));
    if (paragraph) return paragraph;
  }
  return `${appId} 应用`;
}

function readDomainKnowledgeDescription(root: string): string | undefined {
  const knowledgePath = path.join(root, 'knowledge', 'domain-context.json');
  if (!fs.existsSync(knowledgePath) || !fs.statSync(knowledgePath).isFile()) return undefined;
  try {
    const data = JSON.parse(fs.readFileSync(knowledgePath, 'utf-8')) as {
      domainName?: unknown;
      requirementKeywords?: unknown;
    };
    const domainName = typeof data.domainName === 'string' ? data.domainName.trim() : '';
    const keywords = Array.isArray(data.requirementKeywords)
      ? data.requirementKeywords.filter((item): item is string => typeof item === 'string')
      : [];
    const scenes = keywords.map(item => item.trim()).filter(Boolean).slice(0, 4);
    if (!domainName && scenes.length === 0) return undefined;
    return [domainName, scenes.length ? `主要负责的业务场景：${scenes.join('、')}` : undefined]
      .filter(Boolean)
      .join('，');
  } catch {
    return undefined;
  }
}

function countApiRoutes(root: string): number {
  let count = 0;
  for (const file of listSourceFiles(root, 200)) {
    const content = safeRead(file);
    if (!content) continue;
    const matches = content.match(/@(GetMapping|PostMapping|PutMapping|DeleteMapping|RequestMapping)|app\.(get|post|put|delete)\(/g);
    count += matches?.length ?? 0;
  }
  return count;
}

function detectCodeSignals(root: string): string[] {
  const signals = new Set<string>();
  for (const file of listSourceFiles(root, 260)) {
    const content = safeRead(file)?.toLowerCase() ?? '';
    if (!content) continue;
    if (content.includes('dubbo')) signals.add('Dubbo');
    if (content.includes('jdbc') || content.includes('datasource') || content.includes('mysql')) signals.add('MySQL/JDBC');
    if (content.includes('redis')) signals.add('Redis');
    if (content.includes('kafka') || content.includes('rocketmq') || content.includes('rabbit')) signals.add('MQ');
    if (content.includes('@getmapping') || content.includes('@postmapping') || content.includes('app.get(')) signals.add('HTTP API');
    if (content.includes('schedule') || content.includes('cron')) signals.add('定时任务');
  }
  return Array.from(signals).sort();
}

function listSourceFiles(root: string, limit: number): string[] {
  const result: string[] = [];
  const stack = [root];
  while (stack.length && result.length < limit) {
    const current = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (['.git', 'node_modules', 'target', 'dist', 'build', '.next'].includes(entry.name)) continue;
        stack.push(full);
      } else if (['.java', '.xml', '.yml', '.yaml', '.properties', '.sql', '.md', '.json', '.js', '.ts'].includes(path.extname(entry.name))) {
        result.push(full);
        if (result.length >= limit) break;
      }
    }
  }
  return result;
}

function safeRead(file: string): string | undefined {
  try {
    if (!fs.statSync(file).isFile()) return undefined;
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function readJson<T>(file: string): T | undefined {
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}
