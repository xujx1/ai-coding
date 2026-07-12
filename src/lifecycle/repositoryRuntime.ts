import * as fs from 'fs';
import * as path from 'path';
import type {
  ArtifactRef,
  EnvironmentRef,
  LifecycleState,
  PipelineRunRef,
} from './types.js';
import { registerArtifact } from './artifacts.js';
import { LocalGitProvider, type LocalGitRepositoryStatus } from '../integrations/harness.js';

export interface RepositoryRef {
  repoId: string;
  name: string;
  root: string;
  provider: 'harness' | 'internal' | 'local' | string;
  appId?: string;
  accessRef?: string;
}

export type GitRepositoryStatus = LocalGitRepositoryStatus;

export interface BranchRef {
  branchId: string;
  repoId: string;
  branchName: string;
  baseBranch?: string;
  requirementId?: string;
  appId?: string;
}

export interface CheckoutRef {
  checkoutId: string;
  repoId: string;
  branchName: string;
  localPath: string;
}

export interface RepoUpdateRef {
  updateId: string;
  repoId: string;
  branchName: string;
  changedPaths: string[];
}

export interface RepositoryManager {
  listRepositories(): Promise<RepositoryRef[]>;
  getRepository(repoId: string): Promise<RepositoryRef>;
  findRepositoryByApp(appId: string): Promise<RepositoryRef | undefined>;
  getGitStatus?(repoId: string): Promise<GitRepositoryStatus>;
  ensureBranch(input: EnsureBranchInput): Promise<BranchRef>;
  checkout(input: CheckoutInput): Promise<CheckoutRef>;
  updateFiles(input: UpdateFilesInput): Promise<RepoUpdateRef>;
}

export interface EnsureBranchInput {
  repoId: string;
  requirementId: string;
  appId: string;
  baseBranch?: string;
}

export interface CheckoutInput {
  repoId: string;
  branchName: string;
  localPath: string;
}

export interface UpdateFilesInput {
  repoId: string;
  branchName: string;
  files: Array<{ path: string; content: string }>;
}

export interface StartPipelineInput {
  requirementId: string;
  runId: string;
  appId: string;
  repoRef: RepositoryRef;
  branchRef: BranchRef;
  command?: string;
  environmentMode?: EnvironmentRef['mode'];
}

export interface PipelineRuntime {
  startPipeline(input: StartPipelineInput): Promise<PipelineRunRef>;
  getPipelineRun(id: string): Promise<PipelineRunRef | undefined>;
  collectLogs(id: string, state: LifecycleState): Promise<ArtifactRef[]>;
  resolveEnvironment(id: string): Promise<EnvironmentRef | undefined>;
  rerunPipeline(id: string): Promise<PipelineRunRef>;
}

export function createFeatureBranchName(requirementId: string, appId: string): string {
  return `feature/${safeSegment(requirementId)}/${safeSegment(appId)}`;
}

export function ensureReferenceImportLayout(rootDir: string): string[] {
  void rootDir;
  return [
    'src/tools/testing/dataPlan.ts',
    'src/tools/testing/opsFailureClassifier.ts',
    'src/integrations/harness.ts',
  ];
}

export function validateReferenceImportsAreIsolated(rootDir: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const referencePath = path.join(rootDir, 'reference');
  if (fs.existsSync(referencePath)) {
    issues.push(`Reference source directory should not be required after TS integration migration: ${referencePath}`);
  }
  return { valid: issues.length === 0, issues };
}

export class LocalRepositoryManager implements RepositoryManager {
  constructor(private repositories: RepositoryRef[]) {}

  async listRepositories(): Promise<RepositoryRef[]> {
    return [...this.repositories];
  }

  async getRepository(repoId: string): Promise<RepositoryRef> {
    const repo = this.repositories.find(item => item.repoId === repoId);
    if (!repo) throw new Error(`Repository not found: ${repoId}`);
    return repo;
  }

  async findRepositoryByApp(appId: string): Promise<RepositoryRef | undefined> {
    return this.repositories.find(item => item.appId === appId || item.name === appId);
  }

  async ensureBranch(input: EnsureBranchInput): Promise<BranchRef> {
    const repo = await this.getRepository(input.repoId);
    const branchName = createFeatureBranchName(input.requirementId, input.appId);
    return {
      branchId: `${repo.repoId}:${branchName}`,
      repoId: repo.repoId,
      branchName,
      baseBranch: input.baseBranch,
      requirementId: input.requirementId,
      appId: input.appId,
    };
  }

  async checkout(input: CheckoutInput): Promise<CheckoutRef> {
    fs.mkdirSync(input.localPath, { recursive: true });
    return {
      checkoutId: `${input.repoId}:${input.branchName}:${input.localPath}`,
      repoId: input.repoId,
      branchName: input.branchName,
      localPath: input.localPath,
    };
  }

  async updateFiles(input: UpdateFilesInput): Promise<RepoUpdateRef> {
    const repo = await this.getRepository(input.repoId);
    const changedPaths: string[] = [];
    for (const file of input.files) {
      const target = path.join(repo.root, file.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, file.content, 'utf-8');
      changedPaths.push(file.path);
    }
    return {
      updateId: `${input.repoId}:${Date.now()}`,
      repoId: input.repoId,
      branchName: input.branchName,
      changedPaths,
    };
  }
}

export interface HarnessReferenceRepositoryManagerOptions {
  referenceRoot: string;
  repositories: Array<{
    appId: string;
    name: string;
    root: string;
    defaultBranch?: string;
  }>;
}

export class HarnessReferenceRepositoryManager implements RepositoryManager {
  private gitProvider: LocalGitProvider;

  constructor(private options: HarnessReferenceRepositoryManagerOptions) {
    this.gitProvider = new LocalGitProvider(options.repositories.map(repo => ({
      repoId: `harness-ts-${safeSegment(repo.appId)}`,
      name: repo.name,
      root: repo.root,
      appId: repo.appId,
      defaultBranch: repo.defaultBranch,
    })));
  }

  async listRepositories(): Promise<RepositoryRef[]> {
    return this.gitProvider.listRepositories();
  }

  async getRepository(repoId: string): Promise<RepositoryRef> {
    return this.gitProvider.getRepository(repoId);
  }

  async findRepositoryByApp(appId: string): Promise<RepositoryRef | undefined> {
    return this.gitProvider.findRepositoryByApp(appId);
  }

  async getGitStatus(repoId: string): Promise<GitRepositoryStatus> {
    return this.gitProvider.status(repoId);
  }

  async ensureBranch(input: EnsureBranchInput): Promise<BranchRef> {
    const branch = this.gitProvider.ensureBranch(input);
    return {
      branchId: `${input.repoId}:${branch.branchName}`,
      repoId: input.repoId,
      branchName: branch.branchName,
      baseBranch: branch.baseBranch,
      requirementId: input.requirementId,
      appId: input.appId,
    };
  }

  async checkout(input: CheckoutInput): Promise<CheckoutRef> {
    return this.gitProvider.checkout(input);
  }

  async updateFiles(input: UpdateFilesInput): Promise<RepoUpdateRef> {
    return this.gitProvider.updateFiles(input);
  }
}

export class LocalScriptPipelineRuntime implements PipelineRuntime {
  private runs = new Map<string, PipelineRunRef>();
  private environments = new Map<string, EnvironmentRef>();

  async startPipeline(input: StartPipelineInput): Promise<PipelineRunRef> {
    const pipelineRunId = `local-pipeline-${input.runId}-${safeSegment(input.appId)}-${this.runs.size + 1}`;
    const run: PipelineRunRef = {
      pipelineRunId,
      requirementId: input.requirementId,
      runId: input.runId,
      appId: input.appId,
      branchName: input.branchRef.branchName,
      status: 'succeeded',
      provider: 'local-script',
      artifactIds: [],
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
    const environmentId = `local-env-${input.runId}-${safeSegment(input.appId)}`;
    this.environments.set(environmentId, {
      environmentId,
      requirementId: input.requirementId,
      runId: input.runId,
      mode: input.environmentMode ?? 'local-simulated',
      pipelineRunId,
      baseUrl: `local://${input.appId}`,
    });
    this.runs.set(pipelineRunId, run);
    return run;
  }

  async getPipelineRun(id: string): Promise<PipelineRunRef | undefined> {
    return this.runs.get(id);
  }

  async collectLogs(id: string, state: LifecycleState): Promise<ArtifactRef[]> {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Pipeline run not found: ${id}`);
    return [
      registerArtifact(state, {
        type: 'ci-log',
        path: `artifacts/runtime/${id}/ci-log.txt`,
        appId: run.appId,
        sourceType: 'runtime',
        sourceId: id,
        summary: 'Local-script pipeline log reference',
      }),
    ];
  }

  async resolveEnvironment(id: string): Promise<EnvironmentRef | undefined> {
    return this.environments.get(id) ?? [...this.environments.values()].find(item => item.pipelineRunId === id);
  }

  async rerunPipeline(id: string): Promise<PipelineRunRef> {
    const run = this.runs.get(id);
    if (!run) throw new Error(`Pipeline run not found: ${id}`);
    const next: PipelineRunRef = {
      ...run,
      pipelineRunId: `${id}-rerun-${this.runs.size + 1}`,
      startedAt: Date.now(),
      completedAt: Date.now(),
    };
    this.runs.set(next.pipelineRunId, next);
    return next;
  }
}

function safeSegment(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
