import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface LocalGitServiceRepository {
  repoId: string;
  name: string;
  root: string;
  appId?: string;
  defaultBranch?: string;
}

export interface LocalGitServiceOptions {
  serviceRoot: string;
  repositories: LocalGitServiceRepository[];
  remoteName?: string;
  userName?: string;
  userEmail?: string;
}

export interface LocalGitServiceRepositoryRef extends LocalGitServiceRepository {
  provider: 'local-git-service';
  remoteName: string;
  remotePath: string;
  remoteUrl: string;
}

export interface LocalGitServiceStatus {
  repoId: string;
  root: string;
  remotePath: string;
  remoteName: string;
  currentBranch?: string;
  headSha?: string;
  dirty: boolean;
  changedFiles: string[];
  remoteConfigured: boolean;
  remoteHasBranch: boolean;
}

export interface LocalGitServiceInitResult {
  serviceRoot: string;
  registryPath: string;
  repositories: Array<{
    repoId: string;
    root: string;
    remotePath: string;
    remoteConfigured: boolean;
    seeded: boolean;
  }>;
}

export interface LocalGitBranchResult {
  repoId: string;
  branchName: string;
  baseBranch?: string;
  headSha?: string;
}

export interface LocalGitCommitResult {
  repoId: string;
  committed: boolean;
  headSha?: string;
  changedFiles: string[];
}

export interface LocalGitPushPullResult {
  repoId: string;
  branchName: string;
  remoteName: string;
  headSha?: string;
}

export class LocalGitService {
  private readonly serviceRoot: string;
  private readonly remotesRoot: string;
  private readonly registryPath: string;
  private readonly remoteName: string;
  private readonly userName: string;
  private readonly userEmail: string;

  constructor(private readonly options: LocalGitServiceOptions) {
    this.serviceRoot = path.resolve(options.serviceRoot);
    this.remotesRoot = path.join(this.serviceRoot, 'remotes');
    this.registryPath = path.join(this.serviceRoot, 'repositories.json');
    this.remoteName = options.remoteName ?? 'local';
    this.userName = options.userName ?? 'AI Coding';
    this.userEmail = options.userEmail ?? 'ai-coding@example.local';
  }

  listRepositories(): LocalGitServiceRepositoryRef[] {
    return this.options.repositories.map(repo => this.toRepositoryRef(repo));
  }

  getRepository(repoId: string): LocalGitServiceRepositoryRef {
    const repo = this.options.repositories.find(item => item.repoId === repoId);
    if (!repo) throw new Error(`Local Git service repository not found: ${repoId}`);
    return this.toRepositoryRef(repo);
  }

  initialize(): LocalGitServiceInitResult {
    fs.mkdirSync(this.remotesRoot, { recursive: true });
    const repositories = this.options.repositories.map(repo => {
      const ref = this.getRepository(repo.repoId);
      const remoteCreated = this.ensureBareRemote(ref);
      this.ensureWorkingRepository(ref);
      this.ensureRemote(ref);
      const seeded = this.seedRemoteIfEmpty(ref);
      return {
        repoId: ref.repoId,
        root: ref.root,
        remotePath: ref.remotePath,
        remoteConfigured: true,
        seeded: remoteCreated || seeded,
      };
    });
    fs.writeFileSync(this.registryPath, `${JSON.stringify({
      remoteName: this.remoteName,
      serviceRoot: this.serviceRoot,
      remotesRoot: this.remotesRoot,
      repositories: this.listRepositories(),
    }, null, 2)}\n`, 'utf-8');
    return {
      serviceRoot: this.serviceRoot,
      registryPath: this.registryPath,
      repositories,
    };
  }

  status(repoId: string): LocalGitServiceStatus {
    const ref = this.getRepository(repoId);
    const root = this.assertWorkingRepository(ref.root);
    const branchName = currentBranch(root) ?? ref.defaultBranch ?? 'main';
    return {
      repoId,
      root,
      remotePath: ref.remotePath,
      remoteName: this.remoteName,
      currentBranch: currentBranch(root),
      headSha: headSha(root),
      dirty: changedFiles(root).length > 0,
      changedFiles: changedFiles(root),
      remoteConfigured: remoteUrl(root, this.remoteName) === ref.remoteUrl,
      remoteHasBranch: refExists(ref.remotePath, `refs/heads/${branchName}`),
    };
  }

  createBranch(input: {
    repoId: string;
    branchName?: string;
    requirementId?: string;
    appId?: string;
    baseBranch?: string;
  }): LocalGitBranchResult {
    const ref = this.getRepository(input.repoId);
    const root = this.assertWorkingRepository(ref.root);
    this.ensureRemote(ref);
    const branchName = input.branchName ?? createFeatureBranchName(
      input.requirementId ?? 'requirement',
      input.appId ?? ref.appId ?? ref.name
    );
    const baseBranch = input.baseBranch ?? ref.defaultBranch ?? currentBranch(root) ?? 'main';
    git(root, ['fetch', this.remoteName, '--prune']);
    if (refExists(root, `refs/heads/${branchName}`)) {
      git(root, ['checkout', branchName]);
    } else if (refExists(root, `refs/remotes/${this.remoteName}/${baseBranch}`)) {
      git(root, ['checkout', '-B', branchName, `${this.remoteName}/${baseBranch}`]);
    } else if (refExists(root, `refs/heads/${baseBranch}`)) {
      git(root, ['checkout', '-B', branchName, baseBranch]);
    } else {
      git(root, ['checkout', '-B', branchName]);
    }
    return {
      repoId: ref.repoId,
      branchName,
      baseBranch,
      headSha: headSha(root),
    };
  }

  commit(input: {
    repoId: string;
    message: string;
    paths?: string[];
  }): LocalGitCommitResult {
    const ref = this.getRepository(input.repoId);
    const root = this.assertWorkingRepository(ref.root);
    const addPaths = input.paths?.length ? input.paths : ['.'];
    git(root, ['add', ...addPaths]);
    const pending = changedFiles(root);
    if (pending.length === 0) {
      return {
        repoId: ref.repoId,
        committed: false,
        headSha: headSha(root),
        changedFiles: [],
      };
    }
    git(root, [
      '-c', `user.name=${this.userName}`,
      '-c', `user.email=${this.userEmail}`,
      'commit',
      '-m',
      input.message,
    ]);
    return {
      repoId: ref.repoId,
      committed: true,
      headSha: headSha(root),
      changedFiles: pending,
    };
  }

  push(input: { repoId: string; branchName?: string }): LocalGitPushPullResult {
    const ref = this.getRepository(input.repoId);
    const root = this.assertWorkingRepository(ref.root);
    this.ensureBareRemote(ref);
    this.ensureRemote(ref);
    const branchName = input.branchName ?? currentBranch(root) ?? ref.defaultBranch ?? 'main';
    git(root, ['push', '-u', this.remoteName, branchName]);
    return {
      repoId: ref.repoId,
      branchName,
      remoteName: this.remoteName,
      headSha: headSha(root),
    };
  }

  pull(input: { repoId: string; branchName?: string; rebase?: boolean }): LocalGitPushPullResult {
    const ref = this.getRepository(input.repoId);
    const root = this.assertWorkingRepository(ref.root);
    this.ensureRemote(ref);
    const branchName = input.branchName ?? currentBranch(root) ?? ref.defaultBranch ?? 'main';
    const args = input.rebase === false
      ? ['pull', this.remoteName, branchName]
      : ['pull', '--rebase', this.remoteName, branchName];
    git(root, args);
    return {
      repoId: ref.repoId,
      branchName,
      remoteName: this.remoteName,
      headSha: headSha(root),
    };
  }

  private toRepositoryRef(repo: LocalGitServiceRepository): LocalGitServiceRepositoryRef {
    const remotePath = path.join(this.remotesRoot, `${safeSegment(repo.repoId)}.git`);
    return {
      ...repo,
      root: path.resolve(repo.root),
      provider: 'local-git-service',
      remoteName: this.remoteName,
      remotePath,
      remoteUrl: remotePath,
    };
  }

  private ensureWorkingRepository(ref: LocalGitServiceRepositoryRef): void {
    const branchName = ref.defaultBranch ?? 'main';
    fs.mkdirSync(ref.root, { recursive: true });
    if (!isIndependentGitRepository(ref.root)) {
      git(ref.root, ['init']);
      git(ref.root, ['checkout', '-B', branchName]);
      if (refExists(ref.remotePath, `refs/heads/${branchName}`)) {
        this.ensureRemote(ref);
        git(ref.root, ['fetch', this.remoteName, branchName]);
        git(ref.root, ['reset', '--hard', `${this.remoteName}/${branchName}`]);
      }
    }
    if (!headSha(ref.root) && changedFiles(ref.root).length > 0) {
      git(ref.root, ['add', '.']);
      git(ref.root, [
        '-c', `user.name=${this.userName}`,
        '-c', `user.email=${this.userEmail}`,
        'commit',
        '-m',
        `Initialize ${ref.name}`,
      ]);
    }
  }

  private assertWorkingRepository(root: string): string {
    const gitRoot = tryGit(root, ['rev-parse', '--show-toplevel'])?.trim();
    if (!gitRoot) throw new Error(`Not a Git working repository: ${root}`);
    if (!samePath(gitRoot, root)) {
      throw new Error(`Git working repository root mismatch: expected ${path.resolve(root)}, got ${gitRoot}`);
    }
    return gitRoot;
  }

  private ensureBareRemote(ref: LocalGitServiceRepositoryRef): boolean {
    if (fs.existsSync(path.join(ref.remotePath, 'HEAD'))) return false;
    fs.mkdirSync(path.dirname(ref.remotePath), { recursive: true });
    git(path.dirname(ref.remotePath), ['init', '--bare', ref.remotePath]);
    git(ref.remotePath, ['symbolic-ref', 'HEAD', `refs/heads/${ref.defaultBranch ?? 'main'}`]);
    return true;
  }

  private ensureRemote(ref: LocalGitServiceRepositoryRef): void {
    const root = this.assertWorkingRepository(ref.root);
    const existing = remoteUrl(root, this.remoteName);
    if (!existing) {
      git(root, ['remote', 'add', this.remoteName, ref.remoteUrl]);
    } else if (existing !== ref.remoteUrl) {
      git(root, ['remote', 'set-url', this.remoteName, ref.remoteUrl]);
    }
  }

  private seedRemoteIfEmpty(ref: LocalGitServiceRepositoryRef): boolean {
    const root = this.assertWorkingRepository(ref.root);
    const branchName = ref.defaultBranch ?? currentBranch(root) ?? 'main';
    if (!headSha(root) || refExists(ref.remotePath, `refs/heads/${branchName}`)) return false;
    git(root, ['push', '-u', this.remoteName, branchName]);
    return true;
  }
}

export function createEcomLocalGitService(ecomRoot: string): LocalGitService {
  const root = path.resolve(ecomRoot);
  const repositories = fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && (entry.name === 'console' || entry.name.startsWith('ecom-')))
    .map(entry => ({
      repoId: entry.name,
      name: entry.name,
      appId: entry.name,
      root: path.join(root, entry.name),
      defaultBranch: 'main',
    }))
    .sort((a, b) => a.repoId.localeCompare(b.repoId));
  return new LocalGitService({
    serviceRoot: path.join(root, '.git-service'),
    repositories,
  });
}

export function createFeatureBranchName(requirementId: string, appId: string): string {
  return `feature/${safeSegment(requirementId)}/${safeSegment(appId)}`;
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

function currentBranch(cwd: string): string | undefined {
  return tryGit(cwd, ['branch', '--show-current'])?.trim() || undefined;
}

function headSha(cwd: string): string | undefined {
  return tryGit(cwd, ['rev-parse', 'HEAD'])?.trim() || undefined;
}

function remoteUrl(cwd: string, remoteName: string): string | undefined {
  return tryGit(cwd, ['remote', 'get-url', remoteName])?.trim() || undefined;
}

function isIndependentGitRepository(root: string): boolean {
  const gitRoot = tryGit(root, ['rev-parse', '--show-toplevel'])?.trim();
  return Boolean(gitRoot && samePath(gitRoot, root));
}

function samePath(a: string, b: string): boolean {
  return realPathOrResolved(a) === realPathOrResolved(b);
}

function realPathOrResolved(value: string): string {
  try {
    return fs.realpathSync.native(value);
  } catch {
    return path.resolve(value);
  }
}

function refExists(cwd: string, ref: string): boolean {
  try {
    git(cwd, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function changedFiles(cwd: string): string[] {
  const output = tryGit(cwd, ['status', '--porcelain=v1', '-uall']) ?? '';
  return output
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .map(line => {
      const file = line.slice(3);
      const marker = ' -> ';
      return file.includes(marker) ? file.slice(file.indexOf(marker) + marker.length) : file;
    });
}
