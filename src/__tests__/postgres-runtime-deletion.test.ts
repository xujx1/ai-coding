import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { DEFAULT_STORAGE_CONFIG } from '../config/storage.js';
import type { AgentState } from '../persistence/agentTypes.js';
import type { ExecutionState } from '../persistence/executionTypes.js';
import { createEmptyLifecycleState } from '../lifecycle/store.js';
import { ArtifactManager } from '../storage/artifactManager.js';
import { LocalArtifactStore } from '../storage/artifacts/localArtifactStore.js';
import { PostgresDatabase, runStorageMigrations } from '../storage/postgres/database.js';
import { postgresRepositories, PostgresUnitOfWork } from '../storage/postgres/postgresUnitOfWork.js';

const databaseUrl = process.env.DATABASE_URL;

test('PostgreSQL history and committed artifacts survive deletion of the local run workspace', { skip: !databaseUrl }, async () => {
  const database = new PostgresDatabase({ ...DEFAULT_STORAGE_CONFIG, databaseUrl, databaseSsl: false });
  const repositories = postgresRepositories(database);
  const unitOfWork = new PostgresUnitOfWork(database);
  const suffix = `${Date.now()}-${process.pid}`;
  const context = { tenantId: `runtime-deletion-${suffix}` };
  const runId = `run-${suffix}`;
  const agentRunId = `agent-${suffix}`;
  const artifactId = `artifact-${suffix}`;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-coding-runtime-deletion-'));
  const localRunDirectory = path.join(temporaryRoot, 'runtime-projects', 'runs', runId);
  const artifactStore = new LocalArtifactStore(path.join(temporaryRoot, 'artifact-store'));
  const artifacts = new ArtifactManager(artifactStore, unitOfWork);
  const now = Date.now();
  const execution: ExecutionState = {
    runId,
    name: 'Durable run',
    status: 'completed',
    currentNodeIndex: 0,
    currentNodeId: 'archive',
    nodes: [{ id: 'archive', name: 'Archive', status: 'completed', completedAt: now, failureCount: 0 }],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: now - 100,
    updatedAt: now,
    completedAt: now,
  };
  const agent: AgentState = {
    agentRunId,
    runId,
    nodeId: 'archive',
    status: 'completed',
    currentModelId: 'model',
    currentProviderId: 'provider',
    intelligenceLevel: 1,
    modelSwitchHistory: [],
    turnCount: 1,
    tokenUsage: { input: 1, output: 1 },
    compactCount: 0,
    toolCallCount: 0,
    inputArtifacts: [],
    outputArtifacts: [artifactId],
    transcriptPath: 'logs/events.ndjson',
    startedAt: now - 50,
    completedAt: now,
    updatedAt: now,
  };

  await runStorageMigrations(database);
  try {
    await unitOfWork.transaction(context, async tx => {
      await tx.runs.create(context, execution);
      await tx.agents.create(context, agent);
      await tx.lifecycle.create(context, createEmptyLifecycleState({
        requirementId: `requirement-${suffix}`,
        runId,
        phase: 'completed',
        status: 'completed',
        now,
      }));
      await tx.events.append(context, {
        id: `event-${suffix}`,
        type: 'pipeline_completed',
        runId,
        nodeId: 'archive',
        timestamp: now,
      });
    });
    const artifact = await artifacts.uploadAndCommit(context, {
      artifactId,
      runId,
      kind: 'report',
      contentType: 'text/plain',
      body: Buffer.from('durable report'),
      retentionClass: 'archive',
    });

    fs.mkdirSync(localRunDirectory, { recursive: true });
    fs.writeFileSync(path.join(localRunDirectory, 'execution-state.json'), '{"disposable":true}');
    fs.rmSync(localRunDirectory, { recursive: true, force: true });

    assert.equal(fs.existsSync(localRunDirectory), false);
    assert.equal((await repositories.runs.findById(context, runId))?.value.status, 'completed');
    assert.equal((await repositories.agents.findById(context, agentRunId))?.value.status, 'completed');
    assert.equal((await repositories.lifecycle.findByRunId(context, runId))?.value.status, 'completed');
    assert.deepEqual((await repositories.events.listByRun(context, runId)).items.map(event => event.type), ['pipeline_completed']);
    assert.equal((await repositories.artifacts.findById(context, artifactId))?.committed, true);
    assert.equal(await readText(await artifactStore.read(context, artifact.storageKey)), 'durable report');
  } finally {
    await database.query('DELETE FROM runs WHERE tenant_id = $1 AND run_id = $2', [context.tenantId, runId]);
    await database.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

async function readText(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
