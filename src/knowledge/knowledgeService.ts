import * as fs from 'fs';
import * as path from 'path';
import { initAllAppKnowledge } from './initAllAppKnowledge.js';
import { listKnowledgeBaseWorkflowTemplates } from '../workflows/definitions/knowledgeBaseWorkflow.js';
import { getSessionManager } from '../session/SessionManager.js';
import type { SessionSummary } from '../session/SessionManager.js';
import { getStateStore } from '../persistence/stateStore.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { getRunPaths, listFilesRecursive } from '../runtime/paths.js';
import { buildFileTreeFromRelativePaths, isPathInside } from '../runtime/fileTree.js';
import { loadLifecycleState } from '../lifecycle/store.js';
import type { ArtifactRef, LifecycleState } from '../lifecycle/types.js';
import type {
  ManagedKnowledgeBaseOverview,
  ManagedRepositoryOverview,
  ManagedSessionApplication,
} from '../application/managementTypes.js';

export interface KnowledgeManagementServiceInfo {
  module: 'knowledge';
  responsibility: string;
}

export function describeKnowledgeManagementService(): KnowledgeManagementServiceInfo {
  return {
    module: 'knowledge',
    responsibility: 'Knowledge-base generation, listing, browsing, and content access.',
  };
}

export async function initAllKnowledgeBases(options: { appIds?: string[] } = {}) {
  return initAllAppKnowledge({
    appIds: options.appIds,
    updateGlobalKnowledge: !options.appIds?.length,
  });
}

export function listKnowledgeWorkflows() {
  return listKnowledgeBaseWorkflowTemplates();
}

export function buildSessionKnowledgeBaseOverviews(args: {
  session: SessionSummary;
  execution?: ExecutionState | null;
  lifecycle?: LifecycleState | null;
  apps: ManagedSessionApplication[];
}): ManagedKnowledgeBaseOverview[] {
  const knowledgeBases: ManagedKnowledgeBaseOverview[] = [];
  const knowledgeArtifacts = args.lifecycle?.artifacts?.filter(artifact => {
    const artifactType = String(artifact.type ?? '');
    return artifactType.startsWith('app-knowledge')
      || artifactType === 'knowledge-vector-index'
      || artifactType === 'knowledge-delta';
  }) ?? [];
  const knowledgeByKey = new Map<string, ArtifactRef[]>();
  for (const artifact of knowledgeArtifacts) {
    const artifactType = String(artifact.type ?? '');
    const key = artifact.appId ?? (artifactType === 'knowledge-vector-index' ? 'global' : 'global');
    knowledgeByKey.set(key, [...(knowledgeByKey.get(key) ?? []), artifact]);
  }
  for (const [key, artifacts] of knowledgeByKey) {
    const runPaths = getRunPaths(args.session.runId);
    const artifactPaths = artifacts.map(artifactPath).filter((item): item is string => Boolean(item));
    const updatedAt = latestArtifactTimestamp(artifactPaths, runPaths.runDir);
    const requirementId = typeof args.execution?.metadata?.requirementId === 'string'
      ? args.execution.metadata.requirementId
      : args.session.runId;
    knowledgeBases.push({
      id: `session:${args.session.runId}:${key}`,
      runId: args.session.runId,
      requirementId: args.lifecycle?.requirementId ?? requirementId,
      scope: key,
      type: key === 'global' ? 'global' : 'application',
      level: key === 'global' ? '全局' : '应用',
      status: artifacts.length ? 'available' : 'missing',
      artifactCount: artifacts.length,
      description: args.apps.find(app => app.appId === key)?.role,
      updatedAt,
      fileRoot: runPaths.runDir,
      paths: artifactPaths.slice(0, 8),
    });
  }
  return knowledgeBases;
}

export function appendKnowledgeRepositoryOverview(
  knowledgeBases: ManagedKnowledgeBaseOverview[],
  repositoriesByApp: Map<string, Pick<ManagedRepositoryOverview, 'description'>>,
): void {
  const knowledgeRoot = path.join(process.cwd(), 'demo', 'ecom', 'spaces', 'knowledge', 'knowledge-base');
  const reportPath = path.join(knowledgeRoot, 'global', 'init-report.json');
  const appsPath = path.join(knowledgeRoot, 'registry', 'apps.json');
  if (!fs.existsSync(reportPath) || !fs.statSync(reportPath).isFile()) return;
  const report = readJsonFile<{
    versionId?: string;
    appCount?: number;
    gitNexusIndexed?: number;
    generatedAt?: string;
    generatedFiles?: string[];
    apps?: Array<{
      appId?: string;
      generatedFiles?: string[];
    }>;
  }>(reportPath);
  const appsRegistry = readJsonFile<{
    generatedAt?: string;
    apps?: Array<{
      appId?: string;
      knowledgeRepo?: { kbPath?: string };
      freshness?: { status?: string; lastGeneratedAt?: string };
    }>;
  }>(appsPath);
  const generatedFilesByApp = new Map(
    (report?.apps ?? [])
      .filter(app => app.appId)
      .map(app => [app.appId as string, app.generatedFiles ?? []] as const)
  );
  knowledgeBases.push({
    id: 'repository:init-all-app-knowledge:global',
    runId: 'init-all-app-knowledge',
    requirementId: report?.versionId ?? 'knowledge-base',
    scope: 'global',
    type: 'global',
    level: '全局',
    status: 'available',
    artifactCount: report?.generatedFiles?.length ?? countFiles(knowledgeRoot),
    description: '全局上下文、应用注册表、依赖图谱和跨应用索引',
    updatedAt: report?.generatedAt ?? appsRegistry?.generatedAt ?? latestFileTimestamp(knowledgeRoot),
    versionId: report?.versionId,
    knowledgeRoot,
    fileRoot: knowledgeRoot,
    paths: [
      'global/GLOBAL_CONTEXT.md',
      'global/init-report.md',
      'registry/apps.json',
      'global/gitnexus-graph/graph-summary.md',
      'global/gitnexus-indexes',
    ],
  });
  for (const app of appsRegistry?.apps ?? []) {
    const appId = app.appId;
    if (!appId) continue;
    const kbPath = app.knowledgeRepo?.kbPath ?? `apps/${appId}/app-knowledge-base`;
    const kbRoot = path.join(knowledgeRoot, kbPath);
    knowledgeBases.push({
      id: `repository:init-all-app-knowledge:${appId}`,
      runId: 'init-all-app-knowledge',
      requirementId: report?.versionId ?? 'knowledge-base',
      scope: appId,
      type: 'application',
      level: '应用',
      status: app.freshness?.status ?? 'available',
      artifactCount: countFiles(kbRoot),
      description: repositoriesByApp.get(appId)?.description,
      updatedAt: app.freshness?.lastGeneratedAt ?? report?.generatedAt ?? latestFileTimestamp(kbRoot),
      versionId: report?.versionId,
      knowledgeRoot,
      kbPath,
      fileRoot: kbRoot,
      paths: [
        ...(generatedFilesByApp.get(appId) ?? [
          `${kbPath}/CONTEXT.md`,
          `${kbPath}/api-index.md`,
          `${kbPath}/gitnexus/graph-summary.md`,
        ]),
      ],
    });
  }
}

export type KnowledgeFileTreeResult =
  | { ok: true; knowledgeId: string; tree: unknown[] }
  | { ok: false; status: 404; error: string };

export function getKnowledgeBaseFiles(knowledgeId: string): KnowledgeFileTreeResult {
  const knowledgeBase = findKnowledgeBaseOverview(knowledgeId);
  if (!knowledgeBase) return { ok: false, status: 404, error: 'Knowledge base not found' };

  const root = resolveKnowledgeFileRoot(knowledgeBase);
  if (!root || !fs.existsSync(root)) return { ok: false, status: 404, error: 'Knowledge files not found' };

  const tree = knowledgeBase.runId === 'init-all-app-knowledge'
    ? (knowledgeBase.type === 'global' ? listGlobalKnowledgeFiles(root) : listFilesRecursive(root, root))
    : buildFileTreeFromRelativePaths(root, knowledgeBase.paths);
  return { ok: true, knowledgeId, tree };
}

export type KnowledgeFileContentResult =
  | { ok: true; path: string; content: string; size: number }
  | { ok: false; status: 400 | 404; error: string; path?: string };

export function getKnowledgeBaseFileContent(knowledgeId: string, filePath?: string): KnowledgeFileContentResult {
  if (!filePath) return { ok: false, status: 400, error: 'path query param required' };

  const knowledgeBase = findKnowledgeBaseOverview(knowledgeId);
  if (!knowledgeBase) return { ok: false, status: 404, error: 'Knowledge base not found' };

  const root = resolveKnowledgeFileRoot(knowledgeBase);
  if (!root) return { ok: false, status: 404, error: 'Knowledge files not found' };

  const fullPath = path.resolve(root, filePath);
  if (!isPathInside(root, fullPath) || !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    return { ok: false, status: 404, error: 'File not found', path: filePath };
  }

  return {
    ok: true,
    path: filePath,
    content: fs.readFileSync(fullPath, 'utf-8'),
    size: fs.statSync(fullPath).size,
  };
}

function findKnowledgeBaseOverview(knowledgeId: string): ManagedKnowledgeBaseOverview | undefined {
  const knowledgeBases: ManagedKnowledgeBaseOverview[] = [];
  for (const session of getSessionManager().listSessions()) {
    const execution = getStateStore(session.runId).loadExecutionState();
    const lifecycle = loadLifecycleState(session.runId);
    const apps = lifecycle?.apps?.length
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
    knowledgeBases.push(...buildSessionKnowledgeBaseOverviews({ session, execution, lifecycle, apps }));
  }
  appendKnowledgeRepositoryOverview(knowledgeBases, new Map());
  return knowledgeBases.find(item => item.id === knowledgeId);
}

function resolveKnowledgeFileRoot(knowledgeBase: ManagedKnowledgeBaseOverview): string | undefined {
  if (knowledgeBase.fileRoot) return path.resolve(knowledgeBase.fileRoot);
  if (knowledgeBase.knowledgeRoot && knowledgeBase.kbPath) {
    return path.resolve(knowledgeBase.knowledgeRoot, knowledgeBase.kbPath);
  }
  if (knowledgeBase.knowledgeRoot) return path.resolve(knowledgeBase.knowledgeRoot);
  if (knowledgeBase.runId && knowledgeBase.runId !== 'init-all-app-knowledge') {
    return getRunPaths(knowledgeBase.runId).runDir;
  }
  return undefined;
}

function listGlobalKnowledgeFiles(knowledgeRoot: string): unknown[] {
  return ['global', 'registry', 'vector-index']
    .map(name => {
      const fullPath = path.join(knowledgeRoot, name);
      if (!fs.existsSync(fullPath)) return undefined;
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        return {
          name,
          path: name,
          type: 'directory',
          children: prefixFileTreePaths(listFilesRecursive(fullPath, fullPath), name),
        };
      }
      if (stat.isFile()) {
        return {
          name,
          path: name,
          type: 'file',
          size: stat.size,
          modified: stat.mtimeMs,
        };
      }
      return undefined;
    })
    .filter(Boolean);
}

function prefixFileTreePaths(nodes: unknown[], prefix: string): unknown[] {
  return (nodes as Array<Record<string, unknown>>).map(node => ({
    ...node,
    path: `${prefix}/${String(node.path)}`,
    children: Array.isArray(node.children)
      ? prefixFileTreePaths(node.children, prefix)
      : node.children,
  }));
}

function latestArtifactTimestamp(paths: Array<string | undefined>, root: string): string | undefined {
  let latest = 0;
  for (const relPath of paths) {
    if (!relPath) continue;
    const fullPath = path.resolve(root, relPath);
    if (!isPathInside(root, fullPath) || !fs.existsSync(fullPath)) continue;
    const stat = fs.statSync(fullPath);
    latest = Math.max(latest, stat.mtimeMs);
  }
  return latest ? new Date(latest).toISOString() : undefined;
}

function latestFileTimestamp(root: string): string | undefined {
  if (!fs.existsSync(root)) return undefined;
  let latest = 0;
  const visit = (item: string): void => {
    const stat = fs.statSync(item);
    if (stat.isFile()) {
      latest = Math.max(latest, stat.mtimeMs);
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(item, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      visit(path.join(item, entry.name));
    }
  };
  visit(root);
  return latest ? new Date(latest).toISOString() : undefined;
}

function countFiles(root: string): number {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return 0;
  let count = 0;
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) count += 1;
    }
  };
  visit(root);
  return count;
}

function readJsonFile<T>(file: string): T | undefined {
  try {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

function artifactPath(artifact: { path?: unknown; uri?: unknown; artifactId?: unknown }): string | undefined {
  for (const value of [artifact.path, artifact.uri, artifact.artifactId]) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}
