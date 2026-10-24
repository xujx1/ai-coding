import * as fs from 'fs';
import * as path from 'path';
import { getSessionManager } from '../session/SessionManager.js';
import type { SessionSummary } from '../session/SessionManager.js';
import { getStateStore } from '../persistence/stateStore.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { getRunPaths, listFilesRecursive, type FileNode } from '../runtime/paths.js';
import type { RunPaths } from '../runtime/paths.js';
import { buildFileTreeFromRelativePaths, isPathInside } from '../runtime/fileTree.js';
import { loadLifecycleState } from '../lifecycle/store.js';
import type { LifecycleState } from '../lifecycle/types.js';
import type {
  ManagedRequirementOverview,
  ManagedSessionApplication,
} from '../application/managementTypes.js';
import { InMemoryRequirementSource, type RequirementSource } from '../platform-sources/requirementSource.js';

export interface RequirementManagementServiceInfo {
  module: 'requirements';
  responsibility: string;
}

export function describeRequirementManagementService(): RequirementManagementServiceInfo {
  return {
    module: 'requirements',
    responsibility: 'Requirement inventory, MRD source browsing, approval state, and requirement artifacts.',
  };
}

export function buildSessionRequirementOverview(args: {
  session: SessionSummary;
  execution?: ExecutionState | null;
  lifecycle?: LifecycleState | null;
  apps: ManagedSessionApplication[];
  paths: RunPaths;
  exposeRequirement?: (requirement: ManagedRequirementOverview) => boolean;
}): ManagedRequirementOverview | undefined {
  const sessionRequirementId = typeof args.lifecycle?.requirementId === 'string'
    ? args.lifecycle.requirementId
    : typeof args.execution?.metadata?.requirementId === 'string'
      ? args.execution.metadata.requirementId
      : args.session.runId;
  const requirementOverview: ManagedRequirementOverview = {
    id: `session:${args.session.runId}`,
    runId: args.session.runId,
    requirementId: sessionRequirementId,
    name: args.execution?.name ?? args.session.name,
    status: args.execution?.status ?? args.lifecycle?.status ?? args.session.status,
    phase: args.execution?.currentNodeId ?? args.lifecycle?.phase ?? 'created',
    appCount: args.apps.length,
    artifactCount: args.lifecycle?.artifacts.length ?? Object.values(args.execution?.artifactIndex ?? {}).flat().length,
    waitingApprovals: args.lifecycle?.approvals.filter(approval => approval.status === 'waiting').length ?? 0,
    completedApprovals: args.lifecycle?.approvals.filter(approval => approval.status === 'resolved').length ?? 0,
    type: 'session',
    source: 'runtime-projects',
    updatedAt: args.execution?.updatedAt ? new Date(args.execution.updatedAt).toISOString() : undefined,
    fileRoot: args.paths.runDir,
    paths: listRunMrdInputPaths(args.paths),
  };
  return args.exposeRequirement && !args.exposeRequirement(requirementOverview)
    ? undefined
    : requirementOverview;
}

export function appendMrdRepositoryRequirements(requirements: ManagedRequirementOverview[], source: RequirementSource = new InMemoryRequirementSource()): void {
  if (!source.availability().available) return;

  const startedMrdRuns = listStartedMrdRuns();
  for (const requirement of source.list()) {
    const linkedRun = findLinkedMrdRun(startedMrdRuns, requirement.name, requirement.id);
    requirements.push({
      id: `mrd:${requirement.id}`,
      runId: linkedRun?.runId,
      requirementId: requirement.id,
      name: requirement.name,
      status: linkedRun?.status ?? 'available',
      phase: linkedRun?.phase ?? 'mrd-ready',
      appCount: linkedRun?.appCount ?? 0,
      artifactCount: Math.max(1, linkedRun?.artifactCount ?? 1),
      waitingApprovals: linkedRun?.waitingApprovals ?? 0,
      completedApprovals: linkedRun?.completedApprovals ?? 0,
      type: 'mrd',
      source: 'configured-requirement-source',
      updatedAt: linkedRun?.updatedAt ?? requirement.updatedAt,
      fileRoot: requirement.root,
      paths: requirement.paths,
    });
  }
}

export type RequirementFileTreeResult =
  | { ok: true; requirementId: string; tree: unknown[] }
  | { ok: false; status: 404; error: string };

export function getRequirementFiles(
  requirementId: string,
  source: RequirementSource = new InMemoryRequirementSource(),
): RequirementFileTreeResult {
  const requirement = findRequirementOverview(requirementId, source);
  if (!requirement) return { ok: false, status: 404, error: 'Requirement not found' };

  // Repository requirements are owned by their configured source. Do not
  // recover a missing source by inspecting a repository-local example path.
  if (requirement.type === 'mrd') {
    const sourced = source.list().find(item => item.id === requirement.requirementId);
    if (!sourced) return { ok: false, status: 404, error: 'Requirement files not found' };
    return { ok: true, requirementId, tree: buildSourcedRequirementTree(source, sourced.id, sourced.paths) };
  }

  const root = resolveRequirementFileRoot(requirement);
  if (!root || !fs.existsSync(root)) return { ok: false, status: 404, error: 'Requirement files not found' };

  return {
    ok: true,
    requirementId,
    tree: buildFileTreeFromRelativePaths(root, requirement.paths),
  };
}

export type RequirementFileContentResult =
  | { ok: true; path: string; content: string; size: number }
  | { ok: false; status: 400 | 404; error: string; path?: string };

export function getRequirementFileContent(
  requirementId: string,
  filePath?: string,
  source: RequirementSource = new InMemoryRequirementSource(),
): RequirementFileContentResult {
  if (!filePath) return { ok: false, status: 400, error: 'path query param required' };

  const requirement = findRequirementOverview(requirementId, source);
  if (!requirement) return { ok: false, status: 404, error: 'Requirement not found' };

  if (requirement.type === 'mrd') {
    const content = source.read(requirement.requirementId, filePath);
    if (content === undefined) return { ok: false, status: 404, error: 'File not found', path: filePath };
    return { ok: true, path: filePath, content, size: Buffer.byteLength(content, 'utf8') };
  }

  const root = resolveRequirementFileRoot(requirement);
  if (!root) return { ok: false, status: 404, error: 'Requirement files not found' };

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

function findRequirementOverview(requirementId: string, source: RequirementSource): ManagedRequirementOverview | undefined {
  const requirements: ManagedRequirementOverview[] = [];
  for (const session of getSessionManager().listSessions()) {
    const execution = getStateStore(session.runId).loadExecutionState();
    const lifecycle = loadLifecycleState(session.runId);
    const paths = getRunPaths(session.runId);
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
    const overview = buildSessionRequirementOverview({ session, execution, lifecycle, apps, paths });
    if (overview) requirements.push(overview);
  }
  appendMrdRepositoryRequirements(requirements, source);
  return requirements.find(item => item.id === requirementId || item.requirementId === requirementId);
}

function buildSourcedRequirementTree(source: RequirementSource, requirementId: string, paths: string[]): unknown[] {
  const nodes: Array<Record<string, unknown>> = [];
  for (const filePath of paths) {
    if (!isSafeSourcePath(filePath)) continue;
    const content = source.read(requirementId, filePath);
    if (content === undefined) continue;
    const parts = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
    if (!parts.length) continue;
    let cursor = nodes;
    let currentPath = '';
    for (const part of parts.slice(0, -1)) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let directory = cursor.find(item => item.type === 'directory' && item.name === part);
      if (!directory) {
        directory = { name: part, path: currentPath, type: 'directory', children: [] };
        cursor.push(directory);
      }
      cursor = directory.children as Array<Record<string, unknown>>;
    }
    cursor.push({ name: parts.at(-1), path: parts.join('/'), type: 'file', size: Buffer.byteLength(content, 'utf8'), modified: Date.now() });
  }
  return sortSourceTree(nodes);
}

function isSafeSourcePath(value: string): boolean {
  return value.length > 0 && !path.isAbsolute(value) && !value.split(/[\\/]+/).includes('..');
}

function sortSourceTree(nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  for (const node of nodes) {
    if (Array.isArray(node.children)) node.children = sortSourceTree(node.children as Array<Record<string, unknown>>);
  }
  return nodes.sort((a, b) => a.type !== b.type
    ? (a.type === 'directory' ? -1 : 1)
    : String(a.name).localeCompare(String(b.name)));
}

function resolveRequirementFileRoot(requirement: ManagedRequirementOverview): string | undefined {
  if (requirement.fileRoot) return path.resolve(requirement.fileRoot);
  if (requirement.runId) return getRunPaths(requirement.runId).runDir;
  return undefined;
}

function listRunMrdInputPaths(paths: RunPaths): string[] {
  if (!fs.existsSync(paths.inputDir) || !fs.statSync(paths.inputDir).isDirectory()) return [];
  const files: string[] = [];
  const collect = (nodes: FileNode[]): void => {
    for (const node of nodes) {
      if (node.type === 'directory') collect(node.children ?? []);
      if (node.type === 'file' && /\.(md|markdown|txt)$/i.test(node.name)) {
        files.push(`input/${node.path.replace(/\\/g, '/')}`);
      }
    }
  };
  collect(listFilesRecursive(paths.inputDir, paths.inputDir));
  return files.sort((a, b) => {
    const score = (item: string) => (/mrd/i.test(item) ? 0 : 1);
    return score(a) - score(b) || a.localeCompare(b);
  });
}

function listStartedMrdRuns(): ManagedRequirementOverview[] {
  const runs: ManagedRequirementOverview[] = [];
  for (const session of getSessionManager().listSessions()) {
    const execution = getStateStore(session.runId).loadExecutionState();
    const lifecycle = loadLifecycleState(session.runId);
    const paths = getRunPaths(session.runId);
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
    const overview = buildSessionRequirementOverview({ session, execution, lifecycle, apps, paths });
    if (overview?.runId) runs.push(overview);
  }
  return runs.sort((a, b) => timestampOf(b.updatedAt) - timestampOf(a.updatedAt));
}

function findLinkedMrdRun(
  runs: ManagedRequirementOverview[],
  title: string,
  fileName: string,
): ManagedRequirementOverview | undefined {
  const normalizedTitle = normalizeRequirementIdentity(title);
  const normalizedFileName = normalizeRequirementIdentity(fileName);
  return runs.find(run => {
    const runName = normalizeRequirementIdentity(run.name);
    if (runName === normalizedTitle || runName.includes(normalizedTitle) || normalizedTitle.includes(runName)) {
      return true;
    }
    return run.paths.some(inputPath => {
      const inputFileName = path.basename(inputPath);
      return normalizeRequirementIdentity(inputFileName) === normalizedFileName;
    });
  });
}

function normalizeRequirementIdentity(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '');
}

function timestampOf(value?: string): number {
  return value ? new Date(value).getTime() || 0 : 0;
}
