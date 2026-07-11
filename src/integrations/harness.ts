import * as path from 'path';
import * as fs from 'fs';
import { execFileSync } from 'child_process';
import type { RunPaths } from '../runtime/paths.js';
import type { LifecycleState } from '../lifecycle/types.js';
import type { RepositoryRef } from '../lifecycle/repositoryRuntime.js';

export const HARNESS_SOURCE_FILES = [
  'src/integrations/harness.ts',
];

export interface LocalGitRepositoryStatus {
  isGitRepo: boolean;
  root: string;
  gitRoot?: string;
  currentBranch?: string;
  headSha?: string;
  shortHeadSha?: string;
  dirty: boolean;
  changedFiles: string[];
  remoteUrl?: string;
  lastCommitAt?: string;
  error?: string;
}

export interface LocalGitProviderRepository {
  repoId: string;
  name: string;
  root: string;
  appId?: string;
  defaultBranch?: string;
}

export interface LocalGitBranchRef {
  branchName: string;
  baseBranch?: string;
  gitRoot: string;
  headSha?: string;
}

export class LocalGitProvider {
  constructor(private readonly repositories: LocalGitProviderRepository[]) {}

  listRepositories(): RepositoryRef[] {
    return this.repositories.map(repo => this.toRepositoryRef(repo));
  }

  getRepository(repoId: string): RepositoryRef {
    const repo = this.repositories.find(item => item.repoId === repoId);
    if (!repo) throw new Error(`Local Git repository not found: ${repoId}`);
    return this.toRepositoryRef(repo);
  }

  findRepositoryByApp(appId: string): RepositoryRef | undefined {
    const repo = this.repositories.find(item => item.appId === appId || item.name === appId);
    return repo ? this.toRepositoryRef(repo) : undefined;
  }

  status(repoId: string): LocalGitRepositoryStatus {
    const repo = this.getRepository(repoId);
    return inspectLocalGitRepository(repo.root);
  }

  ensureBranch(input: {
    repoId: string;
    requirementId: string;
    appId: string;
    baseBranch?: string;
  }): LocalGitBranchRef {
    const repo = this.getRepository(input.repoId);
    const status = assertGitRepository(repo.root);
    const branchName = createFeatureBranchName(input.requirementId, input.appId);
    const baseBranch = input.baseBranch ?? this.defaultBranchFor(repo, status);
    if (branchExists(status.gitRoot, branchName)) {
      git(status.gitRoot, ['checkout', branchName]);
    } else if (baseBranch && refExists(status.gitRoot, baseBranch)) {
      git(status.gitRoot, ['checkout', '-B', branchName, baseBranch]);
    } else {
      git(status.gitRoot, ['checkout', '-B', branchName]);
    }
    const next = inspectLocalGitRepository(status.gitRoot);
    return {
      branchName,
      baseBranch,
      gitRoot: status.gitRoot,
      headSha: next.headSha,
    };
  }

  checkout(input: {
    repoId: string;
    branchName: string;
    localPath: string;
  }): { checkoutId: string; repoId: string; branchName: string; localPath: string } {
    const repo = this.getRepository(input.repoId);
    const status = assertGitRepository(repo.root);
    const target = path.resolve(input.localPath);
    if (path.resolve(status.gitRoot) === target) {
      git(status.gitRoot, ['checkout', input.branchName]);
    } else if (isExistingGitRepository(target)) {
      git(target, ['checkout', input.branchName]);
    } else {
      if (fsExists(target) && fs.readdirSync(target).length > 0) {
        throw new Error(`Checkout target exists and is not an empty Git worktree path: ${target}`);
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      git(status.gitRoot, ['worktree', 'add', '--force', target, input.branchName]);
    }
    return {
      checkoutId: `${input.repoId}:${input.branchName}:${target}`,
      repoId: input.repoId,
      branchName: input.branchName,
      localPath: target,
    };
  }

  updateFiles(input: {
    repoId: string;
    branchName: string;
    files: Array<{ path: string; content: string }>;
  }): { updateId: string; repoId: string; branchName: string; changedPaths: string[] } {
    const repo = this.getRepository(input.repoId);
    const status = assertGitRepository(repo.root);
    git(status.gitRoot, ['checkout', input.branchName]);
    for (const file of input.files) {
      const target = resolveInside(status.gitRoot, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, 'utf-8');
    }
    const next = inspectLocalGitRepository(status.gitRoot);
    return {
      updateId: `${input.repoId}:${safeSegment(input.branchName)}:${Date.now()}`,
      repoId: input.repoId,
      branchName: input.branchName,
      changedPaths: next.changedFiles,
    };
  }

  commit(input: {
    repoId: string;
    message: string;
    paths?: string[];
  }): { repoId: string; headSha?: string; committed: boolean } {
    const repo = this.getRepository(input.repoId);
    const status = assertGitRepository(repo.root);
    const paths = input.paths?.length ? input.paths : ['.'];
    git(status.gitRoot, ['add', ...paths]);
    if (!inspectLocalGitRepository(status.gitRoot).dirty) {
      return { repoId: input.repoId, headSha: status.headSha, committed: false };
    }
    git(status.gitRoot, [
      '-c', 'user.name=AI Coding',
      '-c', 'user.email=ai-coding@example.local',
      'commit',
      '-m',
      input.message,
    ]);
    const next = inspectLocalGitRepository(status.gitRoot);
    return { repoId: input.repoId, headSha: next.headSha, committed: true };
  }

  private toRepositoryRef(repo: LocalGitProviderRepository): RepositoryRef {
    return {
      repoId: repo.repoId,
      name: repo.name,
      root: repo.root,
      provider: 'local-git',
      appId: repo.appId,
      accessRef: 'src/integrations/harness.ts#LocalGitProvider',
    };
  }

  private defaultBranchFor(repo: RepositoryRef, status: LocalGitRepositoryStatus): string | undefined {
    const configured = this.repositories.find(item => item.repoId === repo.repoId)?.defaultBranch;
    return configured ?? status.currentBranch ?? 'main';
  }
}

export function createFeatureBranchName(requirementId: string, appId: string): string {
  return `feature/${safeSegment(requirementId)}/${safeSegment(appId)}`;
}

export function createHarnessManagedRepositoryRefs(args: {
  paths: RunPaths;
  state: LifecycleState;
}): RepositoryRef[] {
  return args.state.apps.map(app => ({
    repoId: `harness-ts-${safeSegment(app.appId)}`,
    name: app.appId,
    root: app.repoRef ?? path.join(args.paths.projectDir, app.appId),
    provider: 'local-git',
    appId: app.appId,
    accessRef: 'src/integrations/harness.ts#LocalGitProvider',
  }));
}

export function createLocalGitProviderFromLifecycle(args: {
  paths: RunPaths;
  state: LifecycleState;
}): LocalGitProvider {
  return new LocalGitProvider(args.state.apps.map(app => ({
    repoId: `harness-ts-${safeSegment(app.appId)}`,
    name: app.appId,
    root: app.repoRef ?? path.join(args.paths.projectDir, app.appId),
    appId: app.appId,
    defaultBranch: app.branchName,
  })));
}

export function inspectLocalGitRepository(root: string): LocalGitRepositoryStatus {
  const resolvedRoot = path.resolve(root || '.');
  if (!fsExists(resolvedRoot)) {
    return {
      isGitRepo: false,
      root: resolvedRoot,
      dirty: false,
      changedFiles: [],
      error: 'Repository path does not exist.',
    };
  }
  const gitRoot = tryGit(resolvedRoot, ['rev-parse', '--show-toplevel'])?.trim();
  if (!gitRoot) {
    return {
      isGitRepo: false,
      root: resolvedRoot,
      dirty: false,
      changedFiles: [],
      error: 'Repository path is not inside a Git working tree.',
    };
  }
  const porcelain = tryGit(gitRoot, ['status', '--porcelain=v1', '-uall']) ?? '';
  const changedFiles = parsePorcelainChangedFiles(porcelain);
  const headSha = tryGit(gitRoot, ['rev-parse', 'HEAD'])?.trim();
  return {
    isGitRepo: true,
    root: resolvedRoot,
    gitRoot,
    currentBranch: tryGit(gitRoot, ['branch', '--show-current'])?.trim() || undefined,
    headSha,
    shortHeadSha: headSha?.slice(0, 8),
    dirty: changedFiles.length > 0,
    changedFiles,
    remoteUrl: tryGit(gitRoot, ['config', '--get', 'remote.origin.url'])?.trim() || undefined,
    lastCommitAt: tryGit(gitRoot, ['log', '-1', '--format=%cI'])?.trim() || undefined,
  };
}

export function assertGitRepository(root: string): LocalGitRepositoryStatus & { gitRoot: string } {
  const status = inspectLocalGitRepository(root);
  if (!status.isGitRepo || !status.gitRoot) {
    throw new Error(status.error ?? `Not a Git repository: ${root}`);
  }
  return status as LocalGitRepositoryStatus & { gitRoot: string };
}

function safeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function tryGit(cwd: string, args: string[]): string | undefined {
  try {
    return git(cwd, args);
  } catch {
    return undefined;
  }
}

function branchExists(cwd: string, branchName: string): boolean {
  return refExists(cwd, `refs/heads/${branchName}`);
}

function refExists(cwd: string, ref: string): boolean {
  try {
    git(cwd, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function isExistingGitRepository(root: string): boolean {
  return fsExists(root) && Boolean(tryGit(root, ['rev-parse', '--show-toplevel']));
}

function fsExists(target: string): boolean {
  return fs.existsSync(target);
}

function resolveInside(root: string, relativePath: string): string {
  const target = path.resolve(root, relativePath);
  const normalizedRoot = path.resolve(root);
  if (target !== normalizedRoot && !target.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error(`Git file update path escapes repository root: ${relativePath}`);
  }
  return target;
}

function parsePorcelainChangedFiles(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const file = line.slice(3);
      const renameMarker = ' -> ';
      return file.includes(renameMarker) ? file.slice(file.indexOf(renameMarker) + renameMarker.length) : file;
    });
}
