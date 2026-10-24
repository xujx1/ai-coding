import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { WorkspaceManager } from '../storage/workspaceManager.js';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';

test('expired workspace cleanup leaves formal state outside the workspace untouched', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-manager-'));
  const formalState = path.join(root, '..', `${path.basename(root)}-formal-state.json`);
  fs.writeFileSync(formalState, 'durable state');
  let now = 100;
  const manager = new WorkspaceManager({ root, retentionMs: 10, now: () => now });
  const workspace = manager.create('run/1', 'worker-a', ['artifact:a']);
  fs.writeFileSync(path.join(workspace.directory, 'build-cache'), 'temporary');
  now = 111;
  assert.deepEqual(manager.cleanup({ dryRun: true }).map(item => item.runId), ['run/1']);
  assert.equal(fs.existsSync(workspace.directory), true);
  assert.equal(manager.cleanup()[0]?.deleted, true);
  assert.equal(fs.existsSync(workspace.directory), false);
  assert.equal(fs.readFileSync(formalState, 'utf8'), 'durable state');
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(formalState, { force: true });
});

test('workspace takeover reconstruction receives durable source references', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-manager-'));
  const manager = new WorkspaceManager({ root, retentionMs: 100 });
  let restored: readonly string[] = [];
  const workspace = await manager.reconstruct('run-2', 'worker-b', ['scm:abc', 'artifact:input'], async (directory, references) => {
    restored = references;
    fs.writeFileSync(path.join(directory, 'restored'), 'ok');
  });
  assert.deepEqual(restored, ['scm:abc', 'artifact:input']);
  assert.equal(fs.readFileSync(path.join(workspace.directory, 'restored'), 'utf8'), 'ok');
  fs.rmSync(root, { recursive: true, force: true });
});

test('workspace takeover restores SCM, uploaded input, and committed artifacts without using prior workspace files', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-manager-'));
  const artifacts = new LocalArtifactStore(path.join(root, 'object-store'));
  const ctx = { tenantId: 'tenant-workspace' };
  const input = await artifacts.commit(ctx, await artifacts.putTemporary(ctx, {
    artifactId: 'upload-1', runId: 'run-3', kind: 'upload', contentType: 'text/plain', body: Buffer.from('MRD'),
  }));
  const report = await artifacts.commit(ctx, await artifacts.putTemporary(ctx, {
    artifactId: 'report-1', runId: 'run-3', kind: 'report', contentType: 'text/plain', body: Buffer.from('report'),
  }));
  const manager = new WorkspaceManager({ root: path.join(root, 'workspaces'), retentionMs: 100 });
  let cloned: string | undefined;
  const workspace = await manager.reconstructDurable('run-3', 'worker-b', {
    scm: { repositoryUrl: 'https://example.invalid/project.git', ref: 'abc123' },
    uploadedInputs: [{ artifact: input, destination: 'requirements/input.mrd' }],
    committedArtifacts: [{ artifact: report, destination: 'reports/test.txt' }],
  }, {
    artifacts,
    async restoreScm(source, destination) {
      cloned = `${source.repositoryUrl}#${source.ref}`;
      fs.writeFileSync(path.join(destination, 'README.md'), 'cloned');
    },
  });
  assert.equal(cloned, 'https://example.invalid/project.git#abc123');
  assert.equal(fs.readFileSync(path.join(workspace.directory, 'input/requirements/input.mrd'), 'utf8'), 'MRD');
  assert.equal(fs.readFileSync(path.join(workspace.directory, 'artifacts/reports/test.txt'), 'utf8'), 'report');
  assert.equal(fs.readFileSync(path.join(workspace.directory, 'project/README.md'), 'utf8'), 'cloned');
  fs.rmSync(root, { recursive: true, force: true });
});
