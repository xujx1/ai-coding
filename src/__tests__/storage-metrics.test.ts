import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { createStorageDependencies } from '../storage/factory.js';
import { ConcurrentModificationError } from '../storage/contracts/common.js';
import { getStorageMetrics, observeStorageOperation } from '../storage/metrics.js';
import { WorkspaceManager } from '../storage/workspaceManager.js';

test('storage metrics capture adapter latency, errors, conflicts, artifacts, workspaces, and the Demo-fallback invariant', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-metrics-'));
  const metrics = getStorageMetrics();
  metrics.reset();
  try {
    await assert.rejects(
      observeStorageOperation('runs', 'save', async () => { throw new ConcurrentModificationError('run', 'run-1'); }),
      ConcurrentModificationError,
    );
    const storage = createStorageDependencies({
      ...DEFAULT_CONFIG,
      storage: {
        ...DEFAULT_CONFIG.storage,
        profile: 'local', driver: 'file', eventBus: 'memory', artifactStore: 'local', databaseSsl: false,
        artifactLocalDir: path.join(root, 'artifacts'), workspaceRoot: path.join(root, 'workspaces'),
      },
    });
    await storage.artifactStore.putTemporary({ tenantId: 'tenant-a' }, {
      artifactId: 'artifact-a', runId: 'run-a', kind: 'report', contentType: 'text/plain', body: Buffer.from('report'),
    });
    let now = 10;
    const workspace = new WorkspaceManager({ root: path.join(root, 'workspaces'), retentionMs: 1, now: () => now });
    workspace.create('run-a', 'worker-a');
    now = 20;
    workspace.cleanup();
    await storage.close();

    const snapshot = metrics.snapshot();
    assert.equal(snapshot.counters.storage_runs_save_errors_total, 1);
    assert.equal(snapshot.counters.storage_version_conflicts_total, 1);
    assert.equal(snapshot.counters.storage_artifact_putTemporary_total, 1);
    assert.equal(snapshot.counters.storage_workspace_created_total, 1);
    assert.equal(snapshot.counters.storage_workspace_deleted_total, 1);
    assert.ok(snapshot.latencyMs.storage_runs_save_latency_ms.count >= 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    metrics.reset();
  }
});
