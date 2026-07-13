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

export function appendMrdRepositoryRequirements(requirements: ManagedRequirementOverview[]): void {
  const mrdRoot = path.join(process.cwd(), 'demo', 'mrd');
  if (!fs.existsSync(mrdRoot) || !fs.statSync(mrdRoot).isDirectory()) return;

  const startedMrdRuns = listStartedMrdRuns();
  for (const entry of fs.readdirSync(mrdRoot, { withFileTypes: true })) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;
    const fullPath = path.join(mrdRoot, entry.name);
    const content = fs.readFileSync(fullPath, 'utf-8');
    const title = extractMarkdownTitle(content) || entry.name.replace(/\.md$/i, '');
    if (!isTargetDemoMrd(title, entry.name)) continue;
    const stat = fs.statSync(fullPath);
    const linkedRun = findLinkedMrdRun(startedMrdRuns, title, entry.name);
    requirements.push({
      id: `mrd:${entry.name}`,
      runId: linkedRun?.runId,
      requirementId: entry.name.replace(/\.md$/i, ''),
      name: title,
      status: linkedRun?.status ?? 'available',
      phase: linkedRun?.phase ?? 'mrd-ready',
      appCount: linkedRun?.appCount ?? 0,
      artifactCount: Math.max(1, linkedRun?.artifactCount ?? 1),
      waitingApprovals: linkedRun?.waitingApprovals ?? 0,
      completedApprovals: linkedRun?.completedApprovals ?? 0,
      type: 'mrd',
      source: 'demo/mrd',
      updatedAt: linkedRun?.updatedAt ?? stat.mtime.toISOString(),
      fileRoot: mrdRoot,
      paths: [entry.name],
    });
  }
}

export type RequirementFileTreeResult =
  | { ok: true; requirementId: string; tree: unknown[] }
  | { ok: false; status: 404; error: string };

export function getRequirementFiles(requirementId: string): RequirementFileTreeResult {
  const requirement = findRequirementOverview(requirementId);
  if (!requirement) return { ok: false, status: 404, error: 'Requirement not found' };

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

export function getRequirementFileContent(requirementId: string, filePath?: string): RequirementFileContentResult {
  if (!filePath) return { ok: false, status: 400, error: 'path query param required' };

  const requirement = findRequirementOverview(requirementId);
  if (!requirement) return { ok: false, status: 404, error: 'Requirement not found' };

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

function findRequirementOverview(requirementId: string): ManagedRequirementOverview | undefined {
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
  appendMrdRepositoryRequirements(requirements);
  return requirements.find(item => item.id === requirementId || item.requirementId === requirementId);
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

function isTargetDemoMrd(title: string, fileName: string): boolean {
  return title.includes('定向营销活动创建时增加商品上架与库存保护校验')
    || fileName === 'targeted-campaign-stock-guard-mrd.md';
}

function extractMarkdownTitle(content: string): string | undefined {
  const line = content.split(/\r?\n/).find(item => item.trim().startsWith('# '));
  return line?.replace(/^#\s+/, '').trim();
}
