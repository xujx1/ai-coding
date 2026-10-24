import { createEcomLocalGitService, LocalGitService } from '../../integrations/git.js';

interface ParsedArgs {
  root?: string;
  command: string;
  values: string[];
}

const parsed = parseArgs(process.argv.slice(2));

try {
  requireValue(parsed.root, 'A repository root is required. Pass --root <directory>.');
  const service = createEcomLocalGitService(parsed.root);
  run(service, parsed);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function run(service: LocalGitService, parsed: ParsedArgs): void {
  switch (parsed.command) {
    case 'init': {
      const result = service.initialize();
      console.log(`initialized local git service: ${result.serviceRoot}`);
      console.log(`registry: ${result.registryPath}`);
      for (const repo of result.repositories) {
        console.log(`${repo.repoId}: remote=${repo.remotePath} seeded=${repo.seeded}`);
      }
      return;
    }
    case 'list': {
      for (const repo of service.listRepositories()) {
        console.log(`${repo.repoId}\t${repo.root}\t${repo.remotePath}`);
      }
      return;
    }
    case 'status': {
      for (const repoId of selectRepoIds(service, parsed.values[0] ?? 'all')) {
        const status = service.status(repoId);
        console.log(`${status.repoId}\tbranch=${status.currentBranch ?? '-'}\tdirty=${status.dirty}\tremote=${status.remoteConfigured}`);
        if (status.changedFiles.length) {
          for (const file of status.changedFiles) console.log(`  ${file}`);
        }
      }
      return;
    }
    case 'branch': {
      const [target, branchName] = parsed.values;
      requireValue(target, 'branch requires <repo|all> <branch>');
      requireValue(branchName, 'branch requires <repo|all> <branch>');
      for (const repoId of selectRepoIds(service, target)) {
        const result = service.createBranch({ repoId, branchName });
        console.log(`${repoId}: ${result.branchName} ${result.headSha ?? ''}`.trimEnd());
      }
      return;
    }
    case 'feature': {
      const [target, requirementId] = parsed.values;
      requireValue(target, 'feature requires <repo|all> <requirementId>');
      requireValue(requirementId, 'feature requires <repo|all> <requirementId>');
      for (const repo of service.listRepositories().filter(item => target === 'all' || item.repoId === target)) {
        const result = service.createBranch({ repoId: repo.repoId, requirementId, appId: repo.appId ?? repo.name });
        console.log(`${repo.repoId}: ${result.branchName} ${result.headSha ?? ''}`.trimEnd());
      }
      return;
    }
    case 'commit': {
      const [target, message, ...paths] = parsed.values;
      requireValue(target, 'commit requires <repo|all> <message> [paths...]');
      requireValue(message, 'commit requires <repo|all> <message> [paths...]');
      for (const repoId of selectRepoIds(service, target)) {
        const result = service.commit({ repoId, message, paths });
        console.log(`${repoId}: committed=${result.committed} ${result.headSha ?? ''}`.trimEnd());
      }
      return;
    }
    case 'push': {
      const [target, branchName] = parsed.values;
      requireValue(target, 'push requires <repo|all> [branch]');
      for (const repoId of selectRepoIds(service, target)) {
        const result = service.push({ repoId, branchName });
        console.log(`${repoId}: pushed ${result.remoteName}/${result.branchName} ${result.headSha ?? ''}`.trimEnd());
      }
      return;
    }
    case 'pull': {
      const [target, branchName] = parsed.values;
      requireValue(target, 'pull requires <repo|all> [branch]');
      for (const repoId of selectRepoIds(service, target)) {
        const result = service.pull({ repoId, branchName });
        console.log(`${repoId}: pulled ${result.remoteName}/${result.branchName} ${result.headSha ?? ''}`.trimEnd());
      }
      return;
    }
    default:
      printUsage();
  }
}

function parseArgs(args: string[]): ParsedArgs {
  let root: string | undefined;
  const values = [...args];
  const rootIndex = values.indexOf('--root');
  if (rootIndex >= 0) {
    root = values[rootIndex + 1];
    values.splice(rootIndex, 2);
  }
  return {
    root,
    command: values[0] ?? 'help',
    values: values.slice(1),
  };
}

function selectRepoIds(service: LocalGitService, target: string): string[] {
  const repos = service.listRepositories();
  if (target === 'all') return repos.map(repo => repo.repoId);
  const repo = repos.find(item => item.repoId === target);
  if (!repo) throw new Error(`Unknown repository: ${target}`);
  return [repo.repoId];
}

function requireValue(value: string | undefined, message: string): asserts value is string {
  if (!value) throw new Error(message);
}

function printUsage(): void {
  console.log([
    'Usage: npm run ecom:git -- <command> [args]',
    '       npm run ecom:git -- --root <directory> <command> [args]',
    '',
    'Commands:',
    '  init',
    '  list',
    '  status [repo|all]',
    '  branch <repo|all> <branch>',
    '  feature <repo|all> <requirementId>',
    '  commit <repo|all> <message> [paths...]',
    '  push <repo|all> [branch]',
    '  pull <repo|all> [branch]',
  ].join('\n'));
}
