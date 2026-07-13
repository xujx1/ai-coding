/**
 * Main application entry point.
 * Hono HTTP server with API routes and WebSocket support.
 */
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import { readFileSync, existsSync, statSync } from 'fs';
import { nanoid } from 'nanoid';
import { getConfig, loadConfig } from '../config/index.js';
import {
  listModels,
  validateModel,
  listProviders,
  getModelForStage,
  registerCustomModelSet,
  listCustomModels,
  getCustomStageOverrides,
  getProvider,
} from '../models/registry.js';
import { getSessionManager } from '../session/SessionManager.js';
import { getPipeline } from '../workflows/engine/pipelineEngine.js';
import { getStateStore } from '../persistence/stateStore.js';
import { getEventLog } from '../events/EventLog.js';
import { ensureRunDirectories, getRunPaths, listFilesRecursive } from '../runtime/paths.js';
import { processUploads } from '../runtime/uploads.js';
import { getPermissionManager, PermissionMode } from '../tools/security/permissions.js';
import { getWebSocketHub } from './ws.js';
import { PIPELINE_NODES } from '../workflows/definitions/pipelineDefinition.js';
import { BUILTIN_MRD_TO_CODE_WORKFLOW_ID } from '../workflows/builtinDefinitions.js';
import { WorkflowConfigPatch } from '../workflows/storage.js';
import {
  getLangGraphRuntime,
  shouldUseLangGraphRuntime,
} from '../workflows/runtime/langgraph/runtime.js';
import { buildLifecycleReadModel } from '../lifecycle/readModel.js';
import { analyzeOps, analyzeOpsStream, getOpsWorkbench, listOpsApps } from './controllers/appOpsController.js';
import {
  downloadApplicationRepository,
  getManagementOverview,
} from './controllers/applicationController.js';
import {
  getKnowledgeBaseFileContent,
  getKnowledgeBaseFiles,
  initAllKnowledgeBases,
} from './controllers/knowledgeController.js';
import {
  getRequirementFileContent,
  getRequirementFiles,
} from './controllers/requirementController.js';
import {
  getDefaultWorkflow,
  listWorkflows,
  updateDefaultWorkflowConfig,
  validateWorkflow,
} from './controllers/requirementPiController.js';
import { getSettings, patchSettings } from './controllers/settingsController.js';
import {
  getTestingArtifact,
  getTestingDashboard,
  getTestingExecutionReport,
  getTestingWorkflowStatus,
  listTestingArtifacts,
  startTestingWorkflow,
  submitTestingReviewDecision,
} from './controllers/testingController.js';

interface UploadedFilePayload {
  name: string;
  data: Buffer;
  target?: 'input' | 'project';
}

// ── Initialize config ──────────────────────────────────────────────────────
loadConfig();
const config = getConfig();
const sessionManager = getSessionManager();
const wsHub = getWebSocketHub();
const FULL_FLOW_DEMO_VERSION = 17;
const FULL_FLOW_DEMO_SOURCE_RUN_ID = 'PDRbY_AI59';
const FULL_FLOW_DEMO_SOURCE_RUNTIME_DIR = '/Users/xu/IdeaProjects/ai-coding/runtime-projects';
// 默认启动时注入一个完整演示会话；部署方如需纯空白环境，可设置 AI_CODING_AUTO_DEMO=0。
if (process.env.AI_CODING_AUTO_DEMO !== '0') {
  ensureFullFlowDemoSession();
}

// ── Create Hono app ────────────────────────────────────────────────────────
const app = new Hono();

app.use('*', cors({ origin: '*' }));

// ── Static frontend ────────────────────────────────────────────────────────
app.get('/', (c) => {
  const htmlPath = path.join(process.cwd(), 'web', 'index.html');
  if (existsSync(htmlPath)) {
    c.header('Cache-Control', 'no-store');
    return c.html(readFileSync(htmlPath, 'utf-8'));
  }
  return c.text('AI Coding Pipeline - Frontend not built yet. Check web/ directory.');
});

app.get('/app.js', (c) => {
  const jsPath = path.join(process.cwd(), 'web', 'app.js');
  if (existsSync(jsPath)) {
    c.header('Cache-Control', 'no-store');
    return c.body(readFileSync(jsPath), 200, { 'Content-Type': 'application/javascript' });
  }
  return c.text('// app.js not found', 404);
});

app.get('/app.css', (c) => {
  const cssPath = path.join(process.cwd(), 'web', 'app.css');
  if (existsSync(cssPath)) {
    c.header('Cache-Control', 'no-store');
    return c.body(readFileSync(cssPath), 200, { 'Content-Type': 'text/css' });
  }
  return c.text('/* app.css not found */', 404);
});

// ── API: Models ────────────────────────────────────────────────────────────
app.get('/api/models', (c) => {
  return c.json({
    models: listModels(),
    customModels: listCustomModels(),
    providers: listProviders(),
    customStageOverrides: getCustomStageOverrides(),
    stageDefaults: {
      'mrd-render': getModelForStage('mrd-render').id,
      'implementation-plan': getModelForStage('implementation-plan').id,
      'spec-generate': getModelForStage('spec-generate').id,
      'java-impl': getModelForStage('java-impl').id,
      'frontend-impl': getModelForStage('frontend-impl').id,
      'java-review': getModelForStage('java-review').id,
      'similar-alert': getModelForStage('similar-alert').id,
      'local-log-trace': getModelForStage('local-log-trace').id,
      'code-context': getModelForStage('code-context').id,
      'app-knowledge': getModelForStage('app-knowledge').id,
      'global-impact': getModelForStage('global-impact').id,
      'repair-plan': getModelForStage('repair-plan').id,
      'testcode-generate': getModelForStage('testcode-generate').id,
      'maven-test-runner': getModelForStage('maven-test-runner').id,
      'archive': getModelForStage('archive').id,
    },
  });
});

app.get('/api/models/:id/validate', (c) => {
  const id = c.req.param('id');
  const result = validateModel(id);
  return c.json(result);
});

app.post('/api/models/custom', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const baseUrl = String(body.baseUrl || '').trim();
  const apiKey = body.apiKey ? String(body.apiKey) : undefined;
  const displayName = body.displayName ? String(body.displayName) : undefined;
  const fullModelUrl = body.fullModelUrl === true;

  if (!baseUrl) {
    return c.json({ error: 'baseUrl is required' }, 400);
  }

  try {
    const modelsUrl = buildModelsUrl(baseUrl, fullModelUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const resp = await fetch(modelsUrl, { method: 'GET', headers });
    if (!resp.ok) {
      const text = await resp.text();
      return c.json({ error: `Fetch models failed (${resp.status}): ${text.slice(0, 500)}` }, 400);
    }

    const payload = await resp.json();
    const modelIds = extractModelIds(payload);
    if (modelIds.length === 0) {
      return c.json({ error: 'No models returned from model endpoint' }, 400);
    }

    const registered = registerCustomModelSet({
      providerId: 'custom-openai-compatible',
      displayName,
      baseUrl: normalizeApiBaseUrl(baseUrl, fullModelUrl),
      apiKey,
      modelIds,
    });

    return c.json({
      registered: true,
      models: registered.models,
      providers: listProviders(),
      stageOverrides: registered.stageOverrides,
      defaultAlias: 'model90',
    });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

app.post('/api/models/custom/test', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const savedProvider = getProvider('custom-openai-compatible');
  const baseUrl = String(body.baseUrl || savedProvider?.baseUrl || '').trim();
  const apiKey = body.apiKey ? String(body.apiKey) : savedProvider?.apiKey;
  const fullModelUrl = body.fullModelUrl === true;

  if (!baseUrl) {
    return c.json({ ok: false, error: '请先填写或注册 API 请求地址' }, 400);
  }

  try {
    const startedAt = Date.now();
    const modelsUrl = buildModelsUrl(baseUrl, fullModelUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const resp = await fetch(modelsUrl, { method: 'GET', headers });
    const latencyMs = Date.now() - startedAt;
    if (!resp.ok) {
      const text = await resp.text();
      return c.json({
        ok: false,
        status: resp.status,
        latencyMs,
        error: `API 测试失败 (${resp.status}): ${text.slice(0, 500)}`,
      }, 400);
    }

    const payload = await resp.json();
    const modelIds = extractModelIds(payload);
    return c.json({
      ok: true,
      status: resp.status,
      latencyMs,
      modelCount: modelIds.length,
      sampleModels: modelIds.slice(0, 5),
    });
  } catch (err) {
    return c.json({ ok: false, error: (err as Error).message }, 400);
  }
});

// ── API: Settings ─────────────────────────────────────────────────────────
app.get('/api/settings', getSettings);

app.patch('/api/settings', patchSettings);

// ── API: Workflows ────────────────────────────────────────────────────────
app.get('/api/workflows', listWorkflows);

app.get('/api/workflows/default-mrd-to-code', getDefaultWorkflow);

app.get('/api/workflows/:workflowId/validate', validateWorkflow);

app.put('/api/workflows/default-mrd-to-code/config', updateDefaultWorkflowConfig);

// ── API: Sessions / Runs ──────────────────────────────────────────────────
app.get('/api/sessions', (c) => {
  const sessions = sessionManager.listSessions();
  return c.json({ sessions });
});

app.get('/api/management/overview', getManagementOverview);

app.post('/api/management/knowledge/init-all', initAllKnowledgeBases);

app.get('/api/ops/apps', listOpsApps);

app.get('/api/ops/workbench', getOpsWorkbench);

app.post('/api/ops/analyze', analyzeOps);
app.post('/api/ops/analyze/stream', analyzeOpsStream);

app.post('/api/testing/workflows/start', startTestingWorkflow);
app.get('/api/testing/:runId/dashboard', getTestingDashboard);
app.get('/api/testing/:runId/workflows/:workflowInstanceId/status', getTestingWorkflowStatus);
app.post('/api/testing/:runId/workflows/:workflowInstanceId/review', submitTestingReviewDecision);
app.get('/api/testing/:runId/artifacts', listTestingArtifacts);
app.get('/api/testing/:runId/artifacts/:artifactId', getTestingArtifact);
app.get('/api/testing/:runId/reports/:artifactId', getTestingExecutionReport);

app.get('/api/management/knowledge/:knowledgeId/files', getKnowledgeBaseFiles);

app.get('/api/management/knowledge/:knowledgeId/files/content', getKnowledgeBaseFileContent);

app.get('/api/management/requirements/:requirementId/files', getRequirementFiles);

app.get('/api/management/requirements/:requirementId/files/content', getRequirementFileContent);

app.post('/api/sessions', async (c) => {
  const body = await c.req.parseBody({ all: true });
  const name = firstString(body.name) || 'New MRD to Code Run';
  const description = firstString(body.description);

  // Handle file uploads in the same request
  const state = sessionManager.createRun(name, description);

  // Process any uploaded files
  const { files: uploadedFiles, projectFileName } = await collectUploadedFiles(body);

  if (uploadedFiles.length > 0) {
    processUploads(state.runId, uploadedFiles, projectFileName);
  }

  return c.json({ runId: state.runId, state });
});

app.get('/api/sessions/:runId', (c) => {
  const runId = c.req.param('runId');
  const session = sessionManager.getSession(runId);
  if (!session.state) return c.json({ error: 'Session not found' }, 404);
  return c.json({
    ...session,
    lifecycle: buildLifecycleReadModel(runId),
  });
});

app.post('/api/sessions/:runId/resume', (c) => {
  const runId = c.req.param('runId');
  const state = sessionManager.resumeSession(runId);
  if (!state) return c.json({ error: 'Cannot resume session' }, 400);
  return c.json({ state });
});

app.post('/api/sessions/:runId/suspend', (c) => {
  const runId = c.req.param('runId');
  const ok = sessionManager.suspendSession(runId);
  const pipeline = getPipeline(runId);
  if (pipeline) pipeline.suspend();
  return c.json({ suspended: ok });
});

app.post('/api/sessions/:runId/cancel', async (c) => {
  const runId = c.req.param('runId');
  if (shouldUseLangGraphRuntime()) {
    await getLangGraphRuntime().cancel(runId);
    return c.json({ cancelled: true });
  }
  const ok = sessionManager.cancelSession(runId);
  const pipeline = getPipeline(runId);
  if (pipeline) pipeline.abort();
  return c.json({ cancelled: ok });
});

app.post('/api/sessions/:runId/branches/:branchId/rerun', async (c) => {
  const runId = c.req.param('runId');
  const branchId = c.req.param('branchId');
  const body = await c.req.json().catch(() => ({}));
  const state = sessionManager.rerunBranch(runId, branchId, body.fromNodeId);
  if (!state) return c.json({ error: 'Branch not found' }, 404);
  return c.json({ state });
});

app.post('/api/sessions/:runId/branches/:branchId/cancel', (c) => {
  const runId = c.req.param('runId');
  const branchId = c.req.param('branchId');
  const state = sessionManager.cancelBranch(runId, branchId);
  if (!state) return c.json({ error: 'Branch not found' }, 404);
  return c.json({ state });
});

app.delete('/api/sessions/:runId', (c) => {
  const runId = c.req.param('runId');
  const ok = sessionManager.deleteSession(runId);
  return c.json({ deleted: ok, runId });
});

app.patch('/api/sessions/:runId', async (c) => {
  const runId = c.req.param('runId');
  const body = await c.req.json();
  if (body.name) {
    sessionManager.renameSession(runId, body.name);
  }
  if (body.permissionMode) {
    const permMgr = getPermissionManager(runId);
    permMgr.setMode(body.permissionMode as PermissionMode);
  }
  if (body.modelOverrides) {
    const store = getStateStore(runId);
    const state = store.loadExecutionState();
    if (state) {
      state.modelOverrides = { ...state.modelOverrides, ...body.modelOverrides };
      store.saveExecutionState(state);
    }
  }
  const session = sessionManager.getSession(runId);
  return c.json(session);
});

app.get('/api/sessions/:runId/transcript', (c) => {
  const runId = c.req.param('runId');
  const transcript = sessionManager.getTranscript(runId);
  return c.json({ transcript });
});

// ── API: Uploads ──────────────────────────────────────────────────────────
app.post('/api/sessions/:runId/upload', async (c) => {
  const runId = c.req.param('runId');
  const formData = await c.req.parseBody({ all: true });
  const { files, projectFileName } = await collectUploadedFiles(formData);

  const result = processUploads(runId, files, projectFileName);
  return c.json(result);
});

// ── API: Pipeline control ─────────────────────────────────────────────────
app.post('/api/sessions/:runId/pipeline/start', async (c) => {
  const runId = c.req.param('runId');
  const body = await c.req.json().catch(() => ({}));

  if (shouldUseLangGraphRuntime()) {
    wsHub.subscribeEventLog(runId);
    getLangGraphRuntime().start(runId, {
      workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    }).catch(err => {
      const eventLog = getEventLog(runId);
      eventLog.logEvent('error', { message: err.message });
      wsHub.broadcast(runId, { type: 'pipeline_failed', runId, error: err.message });
    });
    return c.json({ started: true, runId, runtime: 'langgraph' });
  }

  const pipeline = getPipeline(runId);
  wsHub.subscribePipeline(runId, pipeline);

  // Run pipeline asynchronously (don't await - events via WS)
  pipeline.start({
    fromNodeId: body.fromNodeId,
    skipConfirmations: body.skipConfirmations,
  }).catch(err => {
    const eventLog = getEventLog(runId);
    eventLog.logEvent('error', { message: err.message });
    wsHub.broadcast(runId, { type: 'pipeline_failed', runId, error: err.message });
  });

  return c.json({ started: true, runId });
});

app.post('/api/sessions/:runId/pipeline/confirm', async (c) => {
  const runId = c.req.param('runId');
  const body = await c.req.json();
  const nodeId = body.nodeId as string;
  const approved = body.approved !== false;
  const feedback = body.feedback as string | undefined;

  if (shouldUseLangGraphRuntime()) {
    await getLangGraphRuntime().resume(runId, { approved, feedback });
    return c.json({ confirmed: approved, runtime: 'langgraph' });
  }

  const pipeline = getPipeline(runId);
  pipeline.resolveConfirmation(nodeId, approved, feedback);

  return c.json({ confirmed: approved });
});

app.post('/api/sessions/:runId/pipeline/cancel', async (c) => {
  const runId = c.req.param('runId');
  const session = sessionManager.getSession(runId);
  if (!session.state) return c.json({ error: 'Session not found' }, 404);
  if (shouldUseLangGraphRuntime()) {
    await getLangGraphRuntime().cancel(runId);
    return c.json({ cancelled: true, runtime: 'langgraph' });
  }
  const pipeline = getPipeline(runId);
  pipeline.abort();
  sessionManager.cancelSession(runId);
  return c.json({ cancelled: true });
});

app.post('/api/sessions/:runId/pipeline/interrupt', async (c) => {
  const runId = c.req.param('runId');
  const session = sessionManager.getSession(runId);
  if (!session.state) return c.json({ error: 'Session not found' }, 404);
  if (shouldUseLangGraphRuntime()) {
    await getLangGraphRuntime().cancel(runId);
    return c.json({ interrupted: true, runId, runtime: 'langgraph' });
  }
  const pipeline = getPipeline(runId);
  pipeline.abort();
  sessionManager.cancelSession(runId);
  return c.json({ interrupted: true, runId });
});

// ── API: Permission resolution ────────────────────────────────────────────
app.post('/api/sessions/:runId/permissions/:requestId/resolve', async (c) => {
  const runId = c.req.param('runId');
  const requestId = c.req.param('requestId');
  const body = await c.req.json();
  const decision = body.decision as 'allow' | 'deny';
  const persistGrant = body.persist === true;

  const permMgr = getPermissionManager(runId);
  permMgr.resolvePermission(requestId, decision, persistGrant);

  return c.json({ resolved: true, decision });
});

app.get('/api/sessions/:runId/permissions', (c) => {
  const runId = c.req.param('runId');
  const permMgr = getPermissionManager(runId);
  return c.json(permMgr.getState());
});

// ── API: Files ────────────────────────────────────────────────────────────
app.get('/api/sessions/:runId/files', (c) => {
  const runId = c.req.param('runId');
  const paths = getRunPaths(runId);
  const scope = c.req.query('scope') || 'project';

  let targetDir: string;
  if (scope === 'artifacts') targetDir = paths.artifactsDir;
  else if (scope === 'input') targetDir = paths.inputDir;
  else targetDir = paths.projectDir;

  const tree = listFilesRecursive(targetDir, targetDir);
  return c.json({ scope, tree });
});

app.get('/api/sessions/:runId/files/content', (c) => {
  const runId = c.req.param('runId');
  const filePath = c.req.query('path');
  const scope = c.req.query('scope');
  if (!filePath) return c.json({ error: 'path query param required' }, 400);

  const paths = getRunPaths(runId);
  const scopedDirs: Record<string, string> = {
    project: paths.projectDir,
    workspace: paths.projectDir,
    artifacts: paths.artifactsDir,
    input: paths.inputDir,
  };
  const candidateDirs = scope && scopedDirs[scope]
    ? [scopedDirs[scope]]
    : [paths.projectDir, paths.artifactsDir, paths.inputDir];
  const candidates = candidateDirs.map(dir => path.resolve(dir, filePath));

  for (const fullPath of candidates) {
    try {
      // Security: ensure path is within run directory
      if (!fullPath.startsWith(paths.runDir)) continue;
      if (existsSync(fullPath) && statSync(fullPath).isFile()) {
        const content = readFileSync(fullPath, 'utf-8');
        const relPath = path.relative(paths.runDir, fullPath);
        return c.json({ path: relPath, content, size: statSync(fullPath).size });
      }
    } catch { /* try next */ }
  }

  return c.json({ error: 'File not found', path: filePath }, 404);
});

app.get('/api/sessions/:runId/download/project', (c) => {
  const runId = c.req.param('runId');
  const session = sessionManager.getSession(runId);
  if (!session.state) return c.json({ error: 'Session not found' }, 404);

  const paths = getRunPaths(runId);
  if (!existsSync(paths.projectDir)) {
    return c.json({ error: 'Project directory not found' }, 404);
  }

  const zip = new AdmZip();
  addDirectoryToZip(zip, paths.projectDir, '');
  const zipBuffer = zip.toBuffer();
  const fileName = `${safeDownloadName(session.state.name || runId)}-project.zip`;
  const encodedFileName = encodeURIComponent(fileName);

  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="ai-coding-project.zip"; filename*=UTF-8''${encodedFileName}`);
  c.header('Content-Length', String(zipBuffer.length));
  return c.body(zipBuffer);
});

app.get('/api/management/repositories/:appId/download', downloadApplicationRepository);

// ── API: Diff ─────────────────────────────────────────────────────────────
app.get('/api/sessions/:runId/diff', (c) => {
  const runId = c.req.param('runId');
  const paths = getRunPaths(runId);

  // Simple diff: list files in workspace/project with creation/modification info
  // A full git diff would require git init, this provides a simplified file change view
  const files = listFilesRecursive(paths.projectDir, paths.projectDir);
  const artifacts = listFilesRecursive(paths.artifactsDir, paths.artifactsDir);

  return c.json({
    project: files,
    artifacts,
    note: 'For full git diff, initialize a git repo in workspace/project. Showing file tree instead.',
  });
});

// ── API: Agents ───────────────────────────────────────────────────────────
app.get('/api/sessions/:runId/agents', (c) => {
  const runId = c.req.param('runId');
  const store = getStateStore(runId);
  const agents = store.listAgentStates();
  return c.json({ agents });
});

app.get('/api/sessions/:runId/agents/:agentId/plan', (c) => {
  const runId = c.req.param('runId');
  const agentId = c.req.param('agentId');
  const store = getStateStore(runId);
  const plan = store.loadPlan(agentId);
  if (!plan) return c.json({ error: 'Plan not found' }, 404);
  return c.json({ plan });
});

// ── API: Events (polling fallback for clients without WebSocket) ──────────
app.get('/api/sessions/:runId/events', (c) => {
  const runId = c.req.param('runId');
  const since = parseInt(c.req.query('since') || '0', 10);
  const eventLog = getEventLog(runId);
  eventLog.loadFromDisk();
  const events = eventLog.getEvents(since);
  return c.json({ events, latestTimestamp: events.length > 0 ? events[events.length - 1].timestamp : since });
});

// ── API: Pipeline definition ──────────────────────────────────────────────
app.get('/api/pipeline/definition', (c) => {
  return c.json({ nodes: PIPELINE_NODES });
});

// ── API: Demo data ────────────────────────────────────────────────────────
app.post('/api/demo/full-flow', (c) => {
  const demo = createFullFlowDemoSession(true);
  return c.json(demo);
});

function ensureFullFlowDemoSession(): void {
  const existing = findCurrentFullFlowDemoSession();
  if (!existing) {
    createFullFlowDemoSession(false);
  }
}

function listFullFlowDemoSessions(): Array<{ runId: string; state: any }> {
  const demos: Array<{ runId: string; state: any }> = [];
  for (const session of sessionManager.listSessions()) {
    const state = getStateStore(session.runId).loadExecutionState();
    if (state?.metadata?.demo === true && state?.metadata?.demoType === 'full-flow') {
      demos.push({ runId: session.runId, state });
    }
  }
  return demos;
}

function findCurrentFullFlowDemoSession(): { runId: string; state: any } | undefined {
  const demos = listFullFlowDemoSessions();
  const current = demos.find(
    demo => (demo.state?.metadata?.demoVersion as number | undefined) === FULL_FLOW_DEMO_VERSION
  );

  for (const demo of demos) {
    if (!current || demo.runId !== current.runId) {
      sessionManager.deleteSession(demo.runId);
    }
  }

  return current;
}

function fullFlowDemoFixtureDir(): string {
  return path.join(process.cwd(), 'fixtures', 'activity-hit-preview-demo');
}

function fullFlowDemoSnapshotRunDir(): string {
  return path.join(fullFlowDemoFixtureDir(), 'run');
}

function copyDirectoryContents(sourceDir: string, targetDir: string): void {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

function createFullFlowDemoSession(forceNew = false): { runId: string; state: unknown } {
  const existing = findCurrentFullFlowDemoSession();
  if (!forceNew && existing) {
    return { runId: existing.runId, state: existing.state };
  }
  if (forceNew) {
    for (const demo of listFullFlowDemoSessions()) {
      sessionManager.deleteSession(demo.runId);
    }
  }

  const snapshotRunDir = fullFlowDemoSnapshotRunDir();
  if (!fs.existsSync(path.join(snapshotRunDir, 'execution-state.json'))) {
    throw new Error(`Full flow demo snapshot is missing: ${snapshotRunDir}`);
  }

  // Demo 只来自真实跑通快照：保留原始事件、Agent 状态和产物，让新用户进来就能看完整执行轨迹。
  return createRecordedFullFlowDemoSession(snapshotRunDir);
}

function createRecordedFullFlowDemoSession(snapshotRunDir: string): { runId: string; state: unknown } {
  const runId = nanoid(10);
  const paths = ensureRunDirectories(runId);
  copyDirectoryContents(snapshotRunDir, paths.runDir);
  // 快照来自某一次真实运行，内部包含旧 runId 和旧绝对路径；克隆到当前 runtime 后必须统一改写。
  normalizeRecordedDemoRun(paths.runDir, runId);

  const storedState = getStateStore(runId).loadExecutionState();
  return { runId, state: storedState };
}

function normalizeRecordedDemoRun(runDir: string, runId: string): void {
  const sourceRunRoot = detectSnapshotRunRoot(runDir);
  const runtimeDir = path.dirname(path.dirname(runDir));
  // 先替换完整 run 根目录，再替换旧 runtime 根目录，最后替换 runId。
  // 真实事件流里有些模型文本会把绝对路径拆成多段，只替换完整 run 根目录会漏掉这些路径残片。
  const replacements = [
    [sourceRunRoot, runDir] as const,
    [FULL_FLOW_DEMO_SOURCE_RUNTIME_DIR, runtimeDir] as const,
    [FULL_FLOW_DEMO_SOURCE_RUN_ID, runId] as const,
  ].filter(([from, to]) => from && from !== to);

  rewriteTextFiles(runDir, replacements);
  renameRecordedDemoZip(runDir, runId);

  const statePath = path.join(runDir, 'execution-state.json');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
  state.runId = runId;
  state.name = '活动命中预览 Demo';
  state.description = '基于真实上传 MRD、marketing、marketing-admin 双项目的动态多应用完整流程演示';
  state.status = 'completed';
  state.metadata = {
    ...((state.metadata as Record<string, unknown> | undefined) || {}),
    demo: true,
    demoType: 'full-flow',
    demoVersion: FULL_FLOW_DEMO_VERSION,
    sourceSnapshot: 'activity-hit-preview',
  };
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
}

function renameRecordedDemoZip(runDir: string, runId: string): void {
  const downloadsDir = path.join(runDir, 'artifacts', 'downloads');
  const sourceZip = path.join(downloadsDir, `${FULL_FLOW_DEMO_SOURCE_RUN_ID}-projects.zip`);
  const targetZip = path.join(downloadsDir, `${runId}-projects.zip`);
  if (!fs.existsSync(sourceZip) || sourceZip === targetZip) return;
  fs.mkdirSync(downloadsDir, { recursive: true });
  fs.renameSync(sourceZip, targetZip);
}

function detectSnapshotRunRoot(runDir: string): string {
  const statePath = path.join(runDir, 'execution-state.json');
  const content = fs.existsSync(statePath) ? fs.readFileSync(statePath, 'utf-8') : '';
  const match = content.match(new RegExp(`(/[^"\\s\\)\\]\\}]+/runs/${FULL_FLOW_DEMO_SOURCE_RUN_ID})`));
  return match?.[1] || FULL_FLOW_DEMO_SOURCE_RUN_ID;
}

function rewriteTextFiles(rootDir: string, replacements: Array<readonly [string, string]>): void {
  if (!fs.existsSync(rootDir) || replacements.length === 0) return;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      rewriteTextFiles(fullPath, replacements);
      continue;
    }
    if (!entry.isFile() || !isDemoTextFile(fullPath)) continue;
    try {
      let content = fs.readFileSync(fullPath, 'utf-8');
      let changed = false;
      for (const [from, to] of replacements) {
        if (!from || from === to || !content.includes(from)) continue;
        content = content.split(from).join(to);
        changed = true;
      }
      if (changed) fs.writeFileSync(fullPath, content, 'utf-8');
    } catch {
      // Skip non-UTF8 files in the recorded demo snapshot.
    }
  }
}

function isDemoTextFile(filePath: string): boolean {
  return [
    '.json', '.ndjson', '.md', '.log', '.txt',
    '.java', '.xml', '.yml', '.yaml', '.properties', '.sql',
  ].includes(path.extname(filePath));
}

// ── API: Health ───────────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    version: '1.0.0',
    config: {
      port: config.port,
      runtimeDir: config.runtimeDir,
      javaHome: config.java.javaHome,
      mavenHome: config.java.mavenHome,
    },
  });
});

function buildModelsUrl(baseUrl: string, fullModelUrl: boolean): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (fullModelUrl || normalized.endsWith('/models')) return normalized;
  return `${normalized}/models`;
}

function normalizeApiBaseUrl(baseUrl: string, fullModelUrl: boolean): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  if (fullModelUrl && normalized.endsWith('/models')) {
    return normalized.slice(0, -'/models'.length);
  }
  return normalized;
}

function extractModelIds(payload: unknown): string[] {
  const data = payload as {
    data?: Array<{ id?: unknown; name?: unknown }>;
    models?: Array<string | { id?: unknown; name?: unknown }>;
  };

  const rawModels = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(payload) ? payload : [];
  const modelIds = rawModels
    .map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const candidate = (item as { id?: unknown; name?: unknown }).id ?? (item as { id?: unknown; name?: unknown }).name;
        return typeof candidate === 'string' ? candidate : '';
      }
      return '';
    })
    .filter(Boolean);

  return Array.from(new Set(modelIds));
}

function firstString(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'string' ? first : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeWorkflowNodePatch(
  nodes: Record<string, unknown>
): WorkflowConfigPatch['nodes'] {
  const normalized: WorkflowConfigPatch['nodes'] = {};
  for (const [nodeId, patch] of Object.entries(nodes)) {
    if (isRecord(patch)) {
      normalized[nodeId] = patch;
    }
  }
  return normalized;
}

async function collectUploadedFiles(formData: Record<string, unknown>): Promise<{
  files: UploadedFilePayload[];
  projectFileName?: string;
}> {
  const files: UploadedFilePayload[] = [];
  let projectFileName: string | undefined;

  for (const [key, rawValue] of Object.entries(formData)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];

    for (const value of values) {
      if (!isFileLike(value)) continue;

      const uploadPath = decodeUploadPathFromField(key);
      const fallbackName = value.name || 'upload.bin';
      const name = uploadPath.path || fallbackName;
      const target = uploadPath.target;
      const data = Buffer.from(await value.arrayBuffer());

      files.push({ name, data, target });

      if (key === 'project' || (!target && fallbackName.toLowerCase().endsWith('.zip'))) {
        projectFileName = name;
      }
    }
  }

  return { files, projectFileName };
}

function isFileLike(value: unknown): value is { name: string; arrayBuffer: () => Promise<ArrayBuffer> } {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'arrayBuffer' in value &&
    typeof (value as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

function decodeUploadPathFromField(key: string): { path?: string; target?: 'input' | 'project' } {
  if (key.startsWith('projectPath:')) {
    return { target: 'project', path: safeDecodeURIComponent(key.slice('projectPath:'.length)) };
  }
  if (key.startsWith('filesPath:')) {
    return { target: 'input', path: safeDecodeURIComponent(key.slice('filesPath:'.length)) };
  }
  if (key === 'project-folder' || key === 'project') {
    return { target: 'project' };
  }
  if (key === 'files-folder' || key === 'files') {
    return { target: 'input' };
  }
  return {};
}

function safeDecodeURIComponent(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

function resolveApplicationCodeRoot(appId: string, preferredRoot: string | undefined, paths: ReturnType<typeof getRunPaths>): string {
  const candidates = [
    preferredRoot,
    path.join(process.cwd(), 'example', appId),
    path.join(paths.projectDir, appId),
    paths.projectDir,
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (existsSync(resolved) && statSync(resolved).isDirectory()) return resolved;
  }
  return path.resolve(preferredRoot ?? path.join(paths.projectDir, appId));
}

function isDownloadableCodeRoot(root: string): boolean {
  if (!existsSync(root) || !statSync(root).isDirectory()) return false;
  const allowedRoots = [
    path.resolve(process.cwd()),
    path.resolve(config.runtimeDir),
  ];
  return allowedRoots.some(allowed => root === allowed || root.startsWith(`${allowed}${path.sep}`));
}

function addDirectoryToZip(zip: AdmZip, dir: string, zipPrefix: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || ['node_modules', 'target'].includes(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, zipPath);
    } else if (entry.isFile()) {
      zip.addFile(zipPath, fs.readFileSync(fullPath));
    }
  }
}

function safeDownloadName(name: string): string {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-').slice(0, 80) || 'ai-coding-run';
}

// ── Start server ──────────────────────────────────────────────────────────
const server = serve({
  fetch: app.fetch,
  port: config.port,
  hostname: config.host,
});

// Attach WebSocket server
wsHub.attach(server);

console.log(`
╔══════════════════════════════════════════════════════════╗
║         AI Coding Pipeline - MRD to Code Workbench       ║
║                                                          ║
║  Server running at: http://localhost:${config.port}               ║
║  Runtime directory: ${config.runtimeDir.padEnd(40)}║
║  WebSocket: ws://localhost:${config.port}/api/ws                 ║
╚══════════════════════════════════════════════════════════╝
`);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  // Suspend all running sessions
  const sessions = sessionManager.listSessions();
  for (const s of sessions) {
    if (s.status === 'running') {
      sessionManager.suspendSession(s.runId);
    }
  }
  server.close();
  process.exit(0);
});
