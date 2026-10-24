import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createEcomLocalGitService } from '../integrations/git.js';

test('local git CLI requires an explicit repository root', () => {
  assert.throws(
    () => execFileSync(process.execPath, ['../tools/git/local-git-service.js', 'list'], { cwd: import.meta.dirname, encoding: 'utf-8', stdio: 'pipe' }),
    /repository root is required/,
  );
});

test('local git service initializes remotes and syncs branch commits', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-git-service-'));
  const ecomRoot = path.join(root, 'ecom');
  const repoRoot = path.join(ecomRoot, 'ecom-product');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# Product\n', 'utf-8');
  git(repoRoot, ['init']);
  git(repoRoot, ['checkout', '-B', 'main']);
  git(repoRoot, ['add', '.']);
  git(repoRoot, ['-c', 'user.name=Test', '-c', 'user.email=test@example.local', 'commit', '-m', 'Initial commit']);

  const service = createEcomLocalGitService(ecomRoot);
  const init = service.initialize();
  const repo = service.getRepository('ecom-product');
  const status = service.status('ecom-product');

  assert.equal(init.repositories.length, 1);
  assert.equal(status.remoteConfigured, true);
  assert.equal(status.remoteHasBranch, true);
  assert.equal(fs.existsSync(repo.remotePath), true);

  const branch = service.createBranch({
    repoId: 'ecom-product',
    requirementId: 'REQ 1',
    appId: 'product',
  });
  assert.equal(branch.branchName, 'feature/req-1/product');

  fs.writeFileSync(path.join(repoRoot, 'feature.txt'), 'local change\n', 'utf-8');
  const commit = service.commit({
    repoId: 'ecom-product',
    message: 'Add feature file',
  });
  assert.equal(commit.committed, true);
  assert.ok(commit.headSha);

  const push = service.push({ repoId: 'ecom-product' });
  assert.equal(push.branchName, branch.branchName);

  const peerRoot = path.join(root, 'peer');
  git(root, ['clone', repo.remotePath, peerRoot]);
  git(peerRoot, ['checkout', branch.branchName]);
  assert.equal(fs.readFileSync(path.join(peerRoot, 'feature.txt'), 'utf-8'), 'local change\n');

  fs.writeFileSync(path.join(peerRoot, 'remote.txt'), 'remote change\n', 'utf-8');
  git(peerRoot, ['add', '.']);
  git(peerRoot, ['-c', 'user.name=Peer', '-c', 'user.email=peer@example.local', 'commit', '-m', 'Add remote file']);
  git(peerRoot, ['push', 'origin', branch.branchName]);

  const pull = service.pull({ repoId: 'ecom-product', branchName: branch.branchName });
  assert.equal(pull.branchName, branch.branchName);
  assert.equal(fs.readFileSync(path.join(repoRoot, 'remote.txt'), 'utf-8'), 'remote change\n');
});

test('local git service restores working git metadata from committed remotes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'local-git-service-restore-'));
  const ecomRoot = path.join(root, 'ecom');
  const repoRoot = path.join(ecomRoot, 'ecom-product');
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, 'README.md'), '# Product\n\nProduct service.\n', 'utf-8');

  const service = createEcomLocalGitService(ecomRoot);
  service.initialize();
  const repo = service.getRepository('ecom-product');
  const originalHead = git(repoRoot, ['rev-parse', 'HEAD']).trim();

  fs.rmSync(path.join(repoRoot, '.git'), { recursive: true, force: true });
  assert.equal(fs.existsSync(path.join(repoRoot, '.git')), false);

  const restored = createEcomLocalGitService(ecomRoot);
  restored.initialize();
  const status = restored.status('ecom-product');

  assert.equal(status.remoteConfigured, true);
  assert.equal(status.remoteHasBranch, true);
  assert.equal(status.headSha, originalHead);
  assert.equal(fs.existsSync(repo.remotePath), true);
});

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
