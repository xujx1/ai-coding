import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { createEcomLocalGitService } from '../integrations/git.js';
import { getStateStore } from '../persistence/stateStore.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { getRunPaths } from '../runtime/paths.js';
import { loadLifecycleState } from '../lifecycle/store.js';
import type { LifecycleState } from '../lifecycle/types.js';
import { getSessionManager } from '../session/SessionManager.js';
import {
  appendKnowledgeRepositoryOverview,
  buildSessionKnowledgeBaseOverviews,
} from '../knowledge/knowledgeService.js';
import {
  appendMrdRepositoryRequirements,
  buildSessionRequirementOverview,
} from '../requirements/requirementService.js';
import type {
  ManagedRepositoryOverview,
  ManagedKnowledgeBaseOverview,
  ManagedRequirementOverview,
  ManagedSessionApplication,
  ManagementOverview,
} from './managementTypes.js';

const FULL_FLOW_DEMO_SOURCE_RUN_ID = 'PDRbY_AI59';

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

export function getManagementOverview(): ManagementOverview {
  const repositoriesByApp = buildEcomRepositoryOverview();
  const knowledgeBases: ManagedKnowledgeBaseOverview[] = [];
  const requirements: ManagedRequirementOverview[] = [];
  const pipelines: unknown[] = [];

  for (const session of getSessionManager().listSessions()) {
    const execution = getStateStore(session.runId).loadExecutionState();
    const lifecycle = loadLifecycleState(session.runId);
    const paths = getRunPaths(session.runId);
    const apps = buildSessionApplications(execution, lifecycle);

    knowledgeBases.push(...buildSessionKnowledgeBaseOverviews({
      session,
      execution,
      lifecycle,
      apps,
    }));

    const requirementOverview = buildSessionRequirementOverview({
      session,
      execution,
      lifecycle,
      apps,
      paths,
      exposeRequirement: shouldExposeRequirement,
    });
    if (requirementOverview) requirements.push(requirementOverview);

    const sessionRequirementId = lifecycle?.requirementId
      ?? (typeof execution?.metadata?.requirementId === 'string' ? execution.metadata.requirementId : session.runId);
    pipelines.push({
      runId: session.runId,
      requirementId: sessionRequirementId,
      name: execution?.name ?? session.name,
      status: execution?.status ?? session.status,
      currentNodeId: execution?.currentNodeId,
      nodeCount: execution?.nodes.length ?? 0,
      completedNodeCount: execution?.nodes.filter(node => node.status === 'completed').length ?? 0,
      branchCount: execution?.workflowInstance?.branches?.length ?? execution?.projects?.length ?? 0,
      deploymentSetCount: lifecycle?.deploymentSets.length ?? 0,
      testRunCount: lifecycle?.testRuns.length ?? 0,
      diagnosisCount: lifecycle?.diagnoses.length ?? 0,
      fixCycleCount: lifecycle?.fixCycles.length ?? 0,
      artifactDir: paths.artifactsDir,
    });
  }

  appendMrdRepositoryRequirements(requirements);
  appendKnowledgeRepositoryOverview(knowledgeBases, repositoriesByApp);

  return {
    repositories: [...repositoriesByApp.values()].sort((a, b) => a.name.localeCompare(b.name)),
    knowledgeBases,
    requirements,
    pipelines,
    generatedAt: new Date().toISOString(),
  };
}

export type ApplicationRepositoryDownloadResult =
  | {
    ok: true;
    fileName: string;
    zipBuffer: Buffer;
  }
  | {
    ok: false;
    status: 400 | 404;
    error: string;
    root?: string;
  };

export function downloadApplicationRepository(appId: string): ApplicationRepositoryDownloadResult {
  const repo = [...buildEcomRepositoryOverview().values()]
    .find(item => item.appId === appId || item.name === appId);
  if (!repo) return { ok: false, status: 404, error: 'Repository not found' };
  const root = path.resolve(repo.root);
  if (!isDownloadableCodeRoot(root)) {
    return { ok: false, status: 400, error: 'Repository root is not downloadable', root };
  }

  const zip = new AdmZip();
  addDirectoryToZip(zip, root, path.basename(root));
  return {
    ok: true,
    fileName: `${safeDownloadName(repo.name || appId)}-code.zip`,
    zipBuffer: zip.toBuffer(),
  };
}

export function buildEcomRepositoryOverview(): Map<string, ManagedRepositoryOverview> {
  const repositoriesByApp = new Map<string, ManagedRepositoryOverview>();
  const ecomRoot = path.join(process.cwd(), 'demo', 'ecom');
  if (!fs.existsSync(ecomRoot) || !fs.statSync(ecomRoot).isDirectory()) return repositoriesByApp;

  const service = createEcomLocalGitService(ecomRoot);
  for (const repo of service.listRepositories()) {
    const hasServiceRemote = fs.existsSync(path.join(repo.remotePath, 'HEAD'));
    repositoriesByApp.set(repo.appId ?? repo.repoId, {
      appId: repo.appId ?? repo.repoId,
      name: repo.name,
      description: readRepositoryDescription(repo.root, repo.repoId),
      root: repo.root,
      provider: repo.provider,
      isGitRepo: hasServiceRemote,
      gitAddress: repo.remoteUrl,
      remoteUrl: repo.remoteUrl,
      currentBranch: repo.defaultBranch,
      dirty: false,
      changedFiles: [],
      changedFileCount: 0,
      gitError: hasServiceRemote ? undefined : '未初始化本地 Git 服务',
      downloadUrl: `/api/management/repositories/${encodeURIComponent(repo.appId ?? repo.repoId)}/download`,
      requirementIds: [],
    });
  }
  return repositoriesByApp;
}

function buildSessionApplications(
  execution: ExecutionState | null | undefined,
  lifecycle: LifecycleState | null | undefined,
): ManagedSessionApplication[] {
  return lifecycle?.apps?.length
    ? lifecycle.apps.map(app => ({
      appId: app.appId,
      root: app.repoRef,
      branchName: app.branchName,
      status: app.status,
      role: app.role,
    }))
    : (execution?.projects ?? []).map(project => ({
      appId: project.name,
      root: project.root,
      branchName: project.branchId,
      status: project.status,
      role: 'primary',
    }));
}

function shouldExposeRequirement(requirement: { runId?: string; name: string }): boolean {
  return requirement.runId === FULL_FLOW_DEMO_SOURCE_RUN_ID
    || requirement.name.includes('真实上传活动命中预览 04:33:51');
}

function readRepositoryDescription(root: string, repoId?: string): string | undefined {
  if (repoId === 'console') {
    return '电商领域后台管理页面，负责演示联调和业务操作入口';
  }
  const knowledgeDescription = readDomainKnowledgeDescription(root);
  if (knowledgeDescription) return knowledgeDescription;
  for (const name of ['README.md', 'README.MD', 'readme.md']) {
    const readmePath = path.join(root, name);
    if (!fs.existsSync(readmePath) || !fs.statSync(readmePath).isFile()) continue;
    const description = extractReadmeDescription(fs.readFileSync(readmePath, 'utf-8'));
    if (description) return toChineseOnlySummary(description);
  }
  return undefined;
}

function extractReadmeDescription(content: string): string | undefined {
  const paragraph: string[] = [];
  let inCodeBlock = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || line.startsWith('#') || line.startsWith('![')) continue;
    if (!line) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line);
  }

  const text = paragraph.join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? truncateText(text, 180) : undefined;
}

function toChineseOnlySummary(text: string): string | undefined {
  const chineseText = text
    .replace(/[A-Za-z0-9._:/-]+/g, '')
    .replace(/\s+/g, '')
    .replace(/[，。；、]+$/g, '')
    .trim();
  return chineseText ? limitChineseDescription(chineseText) : undefined;
}

function limitChineseDescription(text: string): string {
  if (text.length <= 50) return text;
  return `${text.slice(0, 49)}等`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function isDownloadableCodeRoot(root: string): boolean {
  const resolved = path.resolve(root);
  const workspaceRoot = path.resolve(process.cwd());
  const demoRoot = path.join(workspaceRoot, 'demo');
  if (!resolved.startsWith(`${demoRoot}${path.sep}`)) return false;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return false;
  const forbidden = ['node_modules', '.git', 'dist', 'target'];
  return !forbidden.some(part => resolved.split(path.sep).includes(part));
}

function addDirectoryToZip(zip: AdmZip, dir: string, zipPrefix: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'target' || entry.name === 'dist') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const entryPath = zipPrefix ? path.join(zipPrefix, entry.name) : entry.name;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, entryPath);
    } else if (entry.isFile()) {
      zip.addLocalFile(fullPath, path.dirname(entryPath), path.basename(entryPath));
    }
  }
}

function safeDownloadName(name: string): string {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'download';
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
