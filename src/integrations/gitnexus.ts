import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';

export interface GitNexusStats {
  files?: number;
  nodes?: number;
  edges?: number;
  communities?: number;
  processes?: number;
  embeddings?: number;
}

export interface GitNexusAnalyzeResult {
  repoName: string;
  repoRoot: string;
  indexPath: string;
  registryPath: string;
  status: 'indexed' | 'failed';
  stats?: GitNexusStats;
  indexedAt?: string;
  stdout: string;
  stderr: string;
  error?: string;
}

export interface GitNexusAnalyzeInput {
  repoRoot: string;
  repoName: string;
  gitNexusHome: string;
  indexOutputRoot?: string;
  binPath?: string;
  timeoutMs?: number;
}

interface GitNexusMeta {
  indexedAt?: string;
  stats?: GitNexusStats;
}

export function analyzeGitNexusRepository(input: GitNexusAnalyzeInput): GitNexusAnalyzeResult {
  const repoRoot = path.resolve(input.repoRoot);
  const gitNexusHome = path.resolve(input.gitNexusHome);
  const binPath = input.binPath ?? resolveGitNexusBin(process.cwd());
  fs.mkdirSync(gitNexusHome, { recursive: true });
  const args = [
    'analyze',
    '--index-only',
    '--skip-skills',
    '--skip-agents-md',
    '--skip-git',
    '--allow-duplicate-name',
    '--name',
    input.repoName,
    repoRoot,
  ];
  const result = spawnSync(binPath, args, {
    cwd: repoRoot,
    encoding: 'utf-8',
    timeout: input.timeoutMs ?? 120_000,
    env: {
      ...process.env,
      GITNEXUS_HOME: gitNexusHome,
      GITNEXUS_LBUG_EXTENSION_INSTALL: process.env.GITNEXUS_LBUG_EXTENSION_INSTALL ?? 'never',
    },
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const localIndexPath = path.join(repoRoot, '.gitnexus');
  const indexPath = relocateIndex(localIndexPath, input.indexOutputRoot, input.repoName);
  const registryPath = path.join(gitNexusHome, 'registry.json');
  const meta = readGitNexusMeta(path.join(indexPath, 'gitnexus.json'));
  if (result.status === 0 && meta) {
    return {
      repoName: input.repoName,
      repoRoot,
      indexPath,
      registryPath,
      status: 'indexed',
      stats: meta.stats,
      indexedAt: meta.indexedAt,
      stdout,
      stderr,
    };
  }
  return {
    repoName: input.repoName,
    repoRoot,
    indexPath,
    registryPath,
    status: 'failed',
    stats: meta?.stats,
    indexedAt: meta?.indexedAt,
    stdout,
    stderr,
    error: result.error?.message ?? exitError(result.status, stderr, stdout),
  };
}

function relocateIndex(localIndexPath: string, indexOutputRoot: string | undefined, repoName: string): string {
  if (!indexOutputRoot) return localIndexPath;
  if (!fs.existsSync(localIndexPath)) return path.join(path.resolve(indexOutputRoot), repoName);

  const globalIndexPath = path.join(path.resolve(indexOutputRoot), repoName);
  fs.mkdirSync(path.dirname(globalIndexPath), { recursive: true });
  fs.rmSync(globalIndexPath, { recursive: true, force: true });
  try {
    fs.renameSync(localIndexPath, globalIndexPath);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: string }).code : undefined;
    if (code !== 'EXDEV') throw error;
    fs.cpSync(localIndexPath, globalIndexPath, { recursive: true });
    fs.rmSync(localIndexPath, { recursive: true, force: true });
  }
  return globalIndexPath;
}

export function resolveGitNexusBin(projectDir: string): string {
  const localBin = path.join(
    projectDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'gitnexus.cmd' : 'gitnexus',
  );
  return fs.existsSync(localBin) ? localBin : 'gitnexus';
}

function readGitNexusMeta(file: string): GitNexusMeta | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as GitNexusMeta;
  } catch {
    return undefined;
  }
}

function exitError(status: number | null, stderr: string, stdout: string): string {
  const details = `${stderr}\n${stdout}`.trim().split('\n').slice(-8).join('\n');
  return `gitnexus analyze exited with ${status ?? 'signal/timeout'}${details ? `: ${details}` : ''}`;
}
