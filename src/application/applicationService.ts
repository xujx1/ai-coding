import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { InMemoryApplicationCatalog, type ApplicationCatalog } from '../platform-sources/applicationCatalog.js';
import { InMemoryRequirementSource, type RequirementSource } from '../platform-sources/requirementSource.js';
import { getStateStore } from '../persistence/stateStore.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { getRunPaths } from '../runtime/paths.js';
import { loadLifecycleState } from '../lifecycle/store.js';
import type { LifecycleState } from '../lifecycle/types.js';
import { getSessionManager } from '../session/SessionManager.js';
import type { SessionSummary } from '../session/SessionManager.js';
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

export interface ManagementRunSnapshot {
  session: SessionSummary;
  execution: ExecutionState | null;
  lifecycle: LifecycleState | null;
}

export interface ManagementRunSource {
  list(): Promise<ManagementRunSnapshot[]>;
}

export function describeApplicationManagementService(): ApplicationManagementServiceInfo {
  return {
    module: 'application',
    responsibility: 'Application repository inventory, application metadata, Git status, and application code downloads.',
  };
}

export function listManagedApplications(catalog: ApplicationCatalog = new InMemoryApplicationCatalog()): ManagedApplication[] {
  return catalog.list()
    .filter(application => fs.existsSync(application.root) && fs.statSync(application.root).isDirectory())
    .map(application => {
      return {
        appId: application.appId,
        repoId: application.repoId,
        name: application.name,
        root: application.root,
        description: application.description ?? readApplicationDescription(application.root, application.appId),
        dependencies: application.dependencies,
        apiCount: countApiRoutes(application.root),
        codeSignals: detectCodeSignals(application.root),
        provider: 'local-git-service' as const,
        remoteUrl: application.remoteUrl ?? application.root,
        defaultBranch: application.defaultBranch,
      };
    })
    .sort((a, b) => a.appId.localeCompare(b.appId));
}

export function getManagementOverview(
  catalog: ApplicationCatalog = new InMemoryApplicationCatalog(),
  requirementSource: RequirementSource = new InMemoryRequirementSource(),
  knowledgeRoot?: string,
): ManagementOverview {
  const snapshots = getSessionManager().listSessions().map(session => ({
    session,
    execution: getStateStore(session.runId).loadExecutionState(),
    lifecycle: loadLifecycleState(session.runId),
  }));
  return buildManagementOverview(catalog, requirementSource, knowledgeRoot, snapshots);
}

export async function getManagementOverviewFromSource(
  catalog: ApplicationCatalog,
  requirementSource: RequirementSource,
  knowledgeRoot: string | undefined,
  runs: ManagementRunSource,
): Promise<ManagementOverview> {
  return buildManagementOverview(catalog, requirementSource, knowledgeRoot, await runs.list());
}

function buildManagementOverview(
  catalog: ApplicationCatalog,
  requirementSource: RequirementSource,
  knowledgeRoot: string | undefined,
  snapshots: ManagementRunSnapshot[],
): ManagementOverview {
  const repositoriesByApp = buildRepositoryOverview(catalog);
  const knowledgeBases: ManagedKnowledgeBaseOverview[] = [];
  const requirements: ManagedRequirementOverview[] = [];
  const pipelines: unknown[] = [];

  for (const snapshot of snapshots) {
    const { session, execution, lifecycle } = snapshot;
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

  appendMrdRepositoryRequirements(requirements, requirementSource);
  appendKnowledgeRepositoryOverview(knowledgeBases, repositoriesByApp, knowledgeRoot);

  return {
    repositories: [...repositoriesByApp.values()].sort((a, b) => a.name.localeCompare(b.name)),
    knowledgeBases: dedupeKnowledgeBasesForManagement(knowledgeBases),
    requirements,
    pipelines,
    generatedAt: new Date().toISOString(),
  };
}

function dedupeKnowledgeBasesForManagement(
  knowledgeBases: ManagedKnowledgeBaseOverview[],
): ManagedKnowledgeBaseOverview[] {
  const byScope = new Map<string, ManagedKnowledgeBaseOverview>();
  for (const knowledgeBase of knowledgeBases) {
    const key = `${knowledgeBase.type}:${knowledgeBase.scope}`;
    const existing = byScope.get(key);
    if (!existing || shouldPreferKnowledgeBase(knowledgeBase, existing)) {
      byScope.set(key, knowledgeBase);
    }
  }
  return [...byScope.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'global' ? -1 : 1;
    return a.scope.localeCompare(b.scope);
  });
}

function shouldPreferKnowledgeBase(
  candidate: ManagedKnowledgeBaseOverview,
  existing: ManagedKnowledgeBaseOverview,
): boolean {
  const candidateRepositoryGenerated = candidate.runId === 'init-all-app-knowledge';
  const existingRepositoryGenerated = existing.runId === 'init-all-app-knowledge';
  if (candidateRepositoryGenerated !== existingRepositoryGenerated) {
    return candidateRepositoryGenerated;
  }
  return timestampOf(candidate.updatedAt) > timestampOf(existing.updatedAt);
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

export function downloadApplicationRepository(appId: string, catalog: ApplicationCatalog = new InMemoryApplicationCatalog()): ApplicationRepositoryDownloadResult {
  const repo = [...buildRepositoryOverview(catalog).values()]
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

export function buildRepositoryOverview(catalog: ApplicationCatalog = new InMemoryApplicationCatalog()): Map<string, ManagedRepositoryOverview> {
  const repositoriesByApp = new Map<string, ManagedRepositoryOverview>();
  for (const application of catalog.list()) {
    const exists = fs.existsSync(application.root);
    repositoriesByApp.set(application.appId, {
      appId: application.appId,
      name: application.name,
      repositoryType: 'application',
      implementationApp: true,
      description: application.description ?? readRepositoryDescription(application.root, application.repoId),
      root: application.root,
      provider: 'catalog',
      isGitRepo: exists && fs.existsSync(path.join(application.root, '.git')),
      gitAddress: application.remoteUrl ?? application.root,
      remoteUrl: application.remoteUrl ?? application.root,
      currentBranch: application.defaultBranch,
      dirty: false,
      changedFiles: [],
      changedFileCount: 0,
      gitError: exists ? undefined : 'Configured repository root is unavailable',
      downloadUrl: `/api/management/repositories/${encodeURIComponent(application.appId)}/download`,
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

function timestampOf(value?: string): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}
