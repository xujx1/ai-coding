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
import { getConfig, loadConfig, updateJavaConfig } from '../config/index.js';
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
import { getPipeline } from '../pipeline/engine.js';
import { getStateStore } from '../persistence/stateStore.js';
import { getEventLog } from '../events/EventLog.js';
import { ensureRunDirectories, getRunPaths, listFilesRecursive, type FileNode } from '../runtime/paths.js';
import { processUploads } from '../runtime/uploads.js';
import { getPermissionManager, PermissionMode } from '../tools/security/permissions.js';
import { getWebSocketHub } from './ws.js';
import { PIPELINE_NODES } from '../pipeline/definition.js';
import { BUILTIN_MRD_TO_CODE_WORKFLOW_ID } from '../workflows/builtinDefinitions.js';
import {
  getDefaultWorkflowDefinition,
  listWorkflowDefinitions,
  updateDefaultWorkflowConfig,
  WorkflowConfigPatch,
} from '../workflows/storage.js';
import { validateWorkflowDefinition } from '../workflows/validation.js';
import {
  getLangGraphRuntime,
  shouldUseLangGraphRuntime,
} from '../langgraph/runtime.js';
import { buildLifecycleReadModel } from '../lifecycle/readModel.js';
import { loadLifecycleState } from '../lifecycle/store.js';
import { createEcomLocalGitService } from '../integrations/localGitService.js';
import { initAllAppKnowledge } from '../knowledge/initAllAppKnowledge.js';
import { analyzeOpsAlert, listOpsApplications } from '../integrations/app-ops.js';

interface UploadedFilePayload {
  name: string;
  data: Buffer;
  target?: 'input' | 'project';
}

interface ManagedRepositoryOverview {
  appId: string;
  name: string;
  description?: string;
  root: string;
  provider: string;
  isGitRepo: boolean;
  gitAddress: string;
  gitRoot?: string;
  remoteUrl?: string;
  currentBranch?: string;
  headSha?: string;
  shortHeadSha?: string;
  dirty: boolean;
  changedFiles: string[];
  changedFileCount: number;
  lastCommitAt?: string;
  gitError?: string;
  downloadUrl: string;
  requirementIds: string[];
}

interface ManagedKnowledgeBaseOverview {
  id: string;
  runId: string;
  requirementId: string;
  scope: string;
  type: 'global' | 'application';
  level: '全局' | '应用';
  status: string;
  artifactCount: number;
  description?: string;
  updatedAt?: string;
  versionId?: string;
  knowledgeRoot?: string;
  kbPath?: string;
  fileRoot?: string;
  paths: string[];
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
      'java-review': getModelForStage('java-review').id,
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
app.get('/api/settings', (c) => {
  const latestConfig = getConfig();
  return c.json({
    java: {
      javaHome: latestConfig.java.javaHome,
      mavenPath: latestConfig.java.mavenHome,
    },
  });
});

app.patch('/api/settings', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const javaHome = typeof body.javaHome === 'string' ? body.javaHome.trim() : undefined;
  const mavenPath = typeof body.mavenPath === 'string'
    ? body.mavenPath.trim()
    : typeof body.mavenHome === 'string'
      ? body.mavenHome.trim()
      : undefined;

  const next = updateJavaConfig({
    ...(javaHome !== undefined ? { javaHome } : {}),
    ...(mavenPath !== undefined ? { mavenHome: mavenPath } : {}),
  });

  return c.json({
    saved: true,
    java: {
      javaHome: next.java.javaHome,
      mavenPath: next.java.mavenHome,
    },
  });
});

// ── API: Workflows ────────────────────────────────────────────────────────
app.get('/api/workflows', (c) => {
  return c.json({ workflows: listWorkflowDefinitions() });
});

app.get('/api/workflows/default-mrd-to-code', (c) => {
  return c.json({ workflow: getDefaultWorkflowDefinition() });
});

app.get('/api/workflows/:workflowId/validate', (c) => {
  const workflowId = c.req.param('workflowId');
  if (workflowId !== BUILTIN_MRD_TO_CODE_WORKFLOW_ID) {
    return c.json({ error: `Workflow '${workflowId}' not found` }, 404);
  }
  const workflow = getDefaultWorkflowDefinition();
  return c.json({ validation: validateWorkflowDefinition(workflow) });
});

app.put('/api/workflows/default-mrd-to-code/config', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  try {
    const workflow = updateDefaultWorkflowConfig({
      globalConfig: isRecord(body.globalConfig) ? body.globalConfig : undefined,
      nodes: isRecord(body.nodes) ? normalizeWorkflowNodePatch(body.nodes) : undefined,
    });
    return c.json({ workflow });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
});

// ── API: Sessions / Runs ──────────────────────────────────────────────────
app.get('/api/sessions', (c) => {
  const sessions = sessionManager.listSessions();
  return c.json({ sessions });
});

app.get('/api/management/overview', (c) => {
  return c.json(buildManagementOverview());
});

app.post('/api/management/knowledge/init-all', async (c) => {
  try {
    return c.json(await initAllAppKnowledge());
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.get('/api/ops/apps', (c) => {
  return c.json({ apps: listOpsApplications() });
});

app.post('/api/ops/analyze', async (c) => {
  try {
    const body = await c.req.json();
    const appId = typeof body.appId === 'string' ? body.appId : '';
    const alert = typeof body.alert === 'string' ? body.alert : '';
    if (!appId) return c.json({ error: 'appId is required' }, 400);
    if (!alert.trim()) return c.json({ error: 'alert is required' }, 400);
    return c.json({ analysis: analyzeOpsAlert({ appId, alert }) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

app.get('/api/management/knowledge/:knowledgeId/files', (c) => {
  const knowledgeId = c.req.param('knowledgeId');
  const knowledgeBase = findKnowledgeBaseOverview(knowledgeId);
  if (!knowledgeBase) return c.json({ error: 'Knowledge base not found' }, 404);

  const root = resolveKnowledgeFileRoot(knowledgeBase);
  if (!root || !existsSync(root)) return c.json({ error: 'Knowledge files not found' }, 404);

  const tree = knowledgeBase.runId === 'init-all-app-knowledge'
    ? (knowledgeBase.type === 'global' ? listGlobalKnowledgeFiles(root) : listFilesRecursive(root, root))
    : buildFileTreeFromRelativePaths(root, knowledgeBase.paths);
  return c.json({ knowledgeId, tree });
});

app.get('/api/management/knowledge/:knowledgeId/files/content', (c) => {
  const knowledgeId = c.req.param('knowledgeId');
  const filePath = c.req.query('path');
  if (!filePath) return c.json({ error: 'path query param required' }, 400);

  const knowledgeBase = findKnowledgeBaseOverview(knowledgeId);
  if (!knowledgeBase) return c.json({ error: 'Knowledge base not found' }, 404);

  const root = resolveKnowledgeFileRoot(knowledgeBase);
  if (!root) return c.json({ error: 'Knowledge files not found' }, 404);

  const fullPath = path.resolve(root, filePath);
  if (!isPathInside(root, fullPath) || !existsSync(fullPath) || !statSync(fullPath).isFile()) {
    return c.json({ error: 'File not found', path: filePath }, 404);
  }

  const content = readFileSync(fullPath, 'utf-8');
  return c.json({ path: filePath, content, size: statSync(fullPath).size });
});

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

app.get('/api/management/repositories/:appId/download', (c) => {
  const appId = c.req.param('appId');
  const overview = buildManagementOverview();
  const repo = (overview.repositories as ManagedRepositoryOverview[])
    .find(item => item.appId === appId || item.name === appId);
  if (!repo) return c.json({ error: 'Repository not found' }, 404);
  const root = path.resolve(repo.root);
  if (!isDownloadableCodeRoot(root)) {
    return c.json({ error: 'Repository root is not downloadable', root }, 400);
  }

  const zip = new AdmZip();
  addDirectoryToZip(zip, root, path.basename(root));
  const zipBuffer = zip.toBuffer();
  const fileName = `${safeDownloadName(repo.name || appId)}-code.zip`;
  const encodedFileName = encodeURIComponent(fileName);

  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="repository-code.zip"; filename*=UTF-8''${encodedFileName}`);
  c.header('Content-Length', String(zipBuffer.length));
  return c.body(zipBuffer);
});

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

function buildManagementOverview(): {
  repositories: ManagedRepositoryOverview[];
  knowledgeBases: ManagedKnowledgeBaseOverview[];
  requirements: unknown[];
  pipelines: unknown[];
  generatedAt: string;
} {
  const repositoriesByApp = buildEcomRepositoryOverview();
  const knowledgeBases: ManagedKnowledgeBaseOverview[] = [];
  const requirements: unknown[] = [];
  const pipelines: unknown[] = [];

  for (const session of sessionManager.listSessions()) {
    const execution = getStateStore(session.runId).loadExecutionState();
    const lifecycle = loadLifecycleState(session.runId);
    const paths = getRunPaths(session.runId);
    const apps = lifecycle?.apps?.length
      ? lifecycle.apps.map(app => ({
        appId: app.appId,
        root: app.repoRef,
        branchName: app.branchName,
        status: app.status,
        role: app.role,
      }))
      : (execution?.projects ?? []).map(project => ({
        appId: project.name,
        root: project.root,
        branchName: project.branchId,
        status: project.status,
        role: 'primary',
      }));

    const knowledgeArtifacts = lifecycle?.artifacts?.filter(artifact =>
      artifact.type.startsWith('app-knowledge')
      || artifact.type === 'knowledge-vector-index'
      || artifact.type === 'knowledge-delta'
    ) ?? [];
    const knowledgeByKey = new Map<string, typeof knowledgeArtifacts>();
    for (const artifact of knowledgeArtifacts) {
      const key = artifact.appId ?? (artifact.type === 'knowledge-vector-index' ? 'global' : 'global');
      knowledgeByKey.set(key, [...(knowledgeByKey.get(key) ?? []), artifact]);
    }
    for (const [key, artifacts] of knowledgeByKey) {
      const runPaths = getRunPaths(session.runId);
      const artifactPaths = artifacts.map(artifactPath).filter((item): item is string => Boolean(item));
      const updatedAt = latestArtifactTimestamp(artifactPaths, runPaths.runDir);
      const requirementId = typeof execution?.metadata?.requirementId === 'string'
        ? execution.metadata.requirementId
        : session.runId;
      knowledgeBases.push({
        id: `session:${session.runId}:${key}`,
        runId: session.runId,
        requirementId: lifecycle?.requirementId ?? requirementId,
        scope: key,
        type: key === 'global' ? 'global' : 'application',
        level: key === 'global' ? '全局' : '应用',
        status: artifacts.length ? 'available' : 'missing',
        artifactCount: artifacts.length,
        description: apps.find(app => app.appId === key)?.role,
        updatedAt,
        fileRoot: runPaths.runDir,
        paths: artifactPaths.slice(0, 8),
      });
    }

    requirements.push({
      runId: session.runId,
      requirementId: lifecycle?.requirementId ?? execution?.metadata?.requirementId ?? session.runId,
      name: execution?.name ?? session.name,
      status: lifecycle?.status ?? execution?.status ?? session.status,
      phase: lifecycle?.phase ?? execution?.currentNodeId ?? 'created',
      appCount: apps.length,
      artifactCount: lifecycle?.artifacts.length ?? Object.values(execution?.artifactIndex ?? {}).flat().length,
      waitingApprovals: lifecycle?.approvals.filter(approval => approval.status === 'waiting').length ?? 0,
      completedApprovals: lifecycle?.approvals.filter(approval => approval.status === 'resolved').length ?? 0,
    });

    pipelines.push({
      runId: session.runId,
      requirementId: lifecycle?.requirementId ?? execution?.metadata?.requirementId ?? session.runId,
      name: execution?.name ?? session.name,
      status: execution?.status ?? session.status,
      currentNodeId: execution?.currentNodeId,
      nodeCount: execution?.nodes.length ?? 0,
      completedNodeCount: execution?.nodes.filter(node => node.status === 'completed').length ?? 0,
      branchCount: execution?.workflowInstance?.branches?.length ?? execution?.projects?.length ?? 0,
      deploymentSetCount: lifecycle?.deploymentSets.length ?? 0,
      testRunCount: lifecycle?.testRuns.length ?? 0,
      diagnosisCount: lifecycle?.diagnoses.length ?? 0,
      fixCycleCount: lifecycle?.fixCycles.length ?? 0,
      artifactDir: paths.artifactsDir,
    });
  }
  appendKnowledgeRepositoryOverview(knowledgeBases, repositoriesByApp);

  return {
    repositories: [...repositoriesByApp.values()].sort((a, b) => a.name.localeCompare(b.name)),
    knowledgeBases,
    requirements,
    pipelines,
    generatedAt: new Date().toISOString(),
  };
}

function appendKnowledgeRepositoryOverview(
  knowledgeBases: ManagedKnowledgeBaseOverview[],
  repositoriesByApp: Map<string, ManagedRepositoryOverview>
): void {
  const knowledgeRoot = path.join(process.cwd(), 'demo', 'ecom', 'spaces', 'knowledge', 'knowledge-base');
  const reportPath = path.join(knowledgeRoot, 'global', 'init-report.json');
  const appsPath = path.join(knowledgeRoot, 'registry', 'apps.json');
  if (!existsSync(reportPath) || !statSync(reportPath).isFile()) return;
  const report = readJsonFile<{
    versionId?: string;
    appCount?: number;
    gitNexusIndexed?: number;
    generatedAt?: string;
    generatedFiles?: string[];
    apps?: Array<{
      appId?: string;
      generatedFiles?: string[];
    }>;
  }>(reportPath);
  const appsRegistry = readJsonFile<{
    generatedAt?: string;
    apps?: Array<{
      appId?: string;
      knowledgeRepo?: { kbPath?: string };
      freshness?: { status?: string; lastGeneratedAt?: string };
    }>;
  }>(appsPath);
  const generatedFilesByApp = new Map(
    (report?.apps ?? [])
      .filter(app => app.appId)
      .map(app => [app.appId as string, app.generatedFiles ?? []] as const)
  );
  knowledgeBases.push({
    id: 'repository:init-all-app-knowledge:global',
    runId: 'init-all-app-knowledge',
    requirementId: report?.versionId ?? 'knowledge-base',
    scope: 'global',
    type: 'global',
    level: '全局',
    status: 'available',
    artifactCount: report?.generatedFiles?.length ?? countFiles(knowledgeRoot),
    description: '全局上下文、应用注册表、依赖图谱和跨应用索引',
    updatedAt: report?.generatedAt ?? appsRegistry?.generatedAt ?? latestFileTimestamp(knowledgeRoot),
    versionId: report?.versionId,
    knowledgeRoot,
    fileRoot: knowledgeRoot,
    paths: [
      'global/GLOBAL_CONTEXT.md',
      'global/init-report.md',
      'registry/apps.json',
      'global/gitnexus-graph/graph-summary.md',
      'global/gitnexus-indexes',
    ],
  });
  for (const app of appsRegistry?.apps ?? []) {
    const appId = app.appId;
    if (!appId) continue;
    const kbPath = app.knowledgeRepo?.kbPath ?? `apps/${appId}/app-knowledge-base`;
    const kbRoot = path.join(knowledgeRoot, kbPath);
    knowledgeBases.push({
      id: `repository:init-all-app-knowledge:${appId}`,
      runId: 'init-all-app-knowledge',
      requirementId: report?.versionId ?? 'knowledge-base',
      scope: appId,
      type: 'application',
      level: '应用',
      status: app.freshness?.status ?? 'available',
      artifactCount: countFiles(kbRoot),
      description: repositoriesByApp.get(appId)?.description,
      updatedAt: app.freshness?.lastGeneratedAt ?? report?.generatedAt ?? latestFileTimestamp(kbRoot),
      versionId: report?.versionId,
      knowledgeRoot,
      kbPath,
      fileRoot: kbRoot,
      paths: [
        ...(generatedFilesByApp.get(appId) ?? [
          `${kbPath}/CONTEXT.md`,
          `${kbPath}/api-index.md`,
          `${kbPath}/gitnexus/graph-summary.md`,
        ]),
      ],
    });
  }
}

function readJsonFile<T>(file: string): T | undefined {
  try {
    if (!existsSync(file) || !statSync(file).isFile()) return undefined;
    return JSON.parse(readFileSync(file, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

function countFiles(root: string): number {
  if (!existsSync(root) || !statSync(root).isDirectory()) return 0;
  let count = 0;
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) count += 1;
    }
  };
  visit(root);
  return count;
}

function listGlobalKnowledgeFiles(knowledgeRoot: string): unknown[] {
  return ['global', 'registry', 'vector-index']
    .map(name => {
      const fullPath = path.join(knowledgeRoot, name);
      if (!existsSync(fullPath)) return undefined;
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        return {
          name,
          path: name,
          type: 'directory',
          children: prefixFileTreePaths(listFilesRecursive(fullPath, fullPath), name),
        };
      }
      if (stat.isFile()) {
        return {
          name,
          path: name,
          type: 'file',
          size: stat.size,
          modified: stat.mtimeMs,
        };
      }
      return undefined;
    })
    .filter(Boolean);
}

function prefixFileTreePaths(nodes: unknown[], prefix: string): unknown[] {
  return (nodes as Array<Record<string, unknown>>).map(node => ({
    ...node,
    path: `${prefix}/${String(node.path)}`,
    children: Array.isArray(node.children)
      ? prefixFileTreePaths(node.children, prefix)
      : node.children,
  }));
}

function latestFileTimestamp(root: string): string | undefined {
  if (!existsSync(root)) return undefined;
  let latest = 0;
  const visit = (item: string): void => {
    const stat = statSync(item);
    if (stat.isFile()) {
      latest = Math.max(latest, stat.mtimeMs);
      return;
    }
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(item, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      visit(path.join(item, entry.name));
    }
  };
  visit(root);
  return latest ? new Date(latest).toISOString() : undefined;
}

function latestArtifactTimestamp(paths: Array<string | undefined>, root: string): string | undefined {
  let latest = 0;
  for (const relPath of paths) {
    if (!relPath) continue;
    const fullPath = path.resolve(root, relPath);
    if (!isPathInside(root, fullPath) || !existsSync(fullPath)) continue;
    const stat = statSync(fullPath);
    latest = Math.max(latest, stat.mtimeMs);
  }
  return latest ? new Date(latest).toISOString() : undefined;
}

function findKnowledgeBaseOverview(knowledgeId: string): ManagedKnowledgeBaseOverview | undefined {
  return buildManagementOverview().knowledgeBases.find(item => item.id === knowledgeId);
}

function resolveKnowledgeFileRoot(knowledgeBase: ManagedKnowledgeBaseOverview): string | undefined {
  if (knowledgeBase.fileRoot) return path.resolve(knowledgeBase.fileRoot);
  if (knowledgeBase.knowledgeRoot && knowledgeBase.kbPath) {
    return path.resolve(knowledgeBase.knowledgeRoot, knowledgeBase.kbPath);
  }
  if (knowledgeBase.knowledgeRoot) return path.resolve(knowledgeBase.knowledgeRoot);
  if (knowledgeBase.runId && knowledgeBase.runId !== 'init-all-app-knowledge') {
    return getRunPaths(knowledgeBase.runId).runDir;
  }
  return undefined;
}

function buildFileTreeFromRelativePaths(root: string, relativePaths: string[]): unknown[] {
  const nodes: Array<Record<string, unknown>> = [];
  for (const relPath of relativePaths) {
    const fullPath = path.resolve(root, relPath);
    if (!isPathInside(root, fullPath) || !existsSync(fullPath)) continue;
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      addDirectoryNodes(nodes, relPath, listFilesRecursive(fullPath, fullPath));
    } else if (stat.isFile()) {
      addFileNode(nodes, relPath, stat.size, stat.mtimeMs);
    }
  }
  return sortFileTree(nodes);
}

function addDirectoryNodes(nodes: Array<Record<string, unknown>>, relPath: string, children: unknown[]): void {
  const cleanPath = relPath.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanPath) return;
  const parts = cleanPath.split('/');
  let cursor = nodes;
  let currentPath = '';
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let dir = cursor.find(node => node.type === 'directory' && node.name === part) as Record<string, unknown> | undefined;
    if (!dir) {
      dir = { name: part, path: currentPath, type: 'directory', children: [] };
      cursor.push(dir);
    }
    cursor = dir.children as Array<Record<string, unknown>>;
  }
  cursor.push(...children as Array<Record<string, unknown>>);
}

function addFileNode(nodes: Array<Record<string, unknown>>, relPath: string, size: number, modified: number): void {
  const cleanPath = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = cleanPath.split('/').filter(Boolean);
  if (!parts.length) return;
  let cursor = nodes;
  let currentPath = '';
  for (const part of parts.slice(0, -1)) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    let dir = cursor.find(node => node.type === 'directory' && node.name === part) as Record<string, unknown> | undefined;
    if (!dir) {
      dir = { name: part, path: currentPath, type: 'directory', children: [] };
      cursor.push(dir);
    }
    cursor = dir.children as Array<Record<string, unknown>>;
  }
  cursor.push({ name: parts[parts.length - 1], path: cleanPath, type: 'file', size, modified });
}

function sortFileTree(nodes: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  for (const node of nodes) {
    if (Array.isArray(node.children)) node.children = sortFileTree(node.children as Array<Record<string, unknown>>);
  }
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
}

function artifactPath(artifact: { path?: unknown; uri?: unknown; artifactId?: unknown }): string | undefined {
  for (const value of [artifact.path, artifact.uri, artifact.artifactId]) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return undefined;
}

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function buildEcomRepositoryOverview(): Map<string, ManagedRepositoryOverview> {
  const repositoriesByApp = new Map<string, ManagedRepositoryOverview>();
  const ecomRoot = path.join(process.cwd(), 'demo', 'ecom');
  if (!existsSync(ecomRoot) || !statSync(ecomRoot).isDirectory()) return repositoriesByApp;

  const service = createEcomLocalGitService(ecomRoot);
  for (const repo of service.listRepositories()) {
    const hasServiceRemote = existsSync(path.join(repo.remotePath, 'HEAD'));
    repositoriesByApp.set(repo.appId ?? repo.repoId, {
      appId: repo.appId ?? repo.repoId,
      name: repo.name,
      description: readRepositoryDescription(repo.root, repo.repoId),
      root: repo.root,
      provider: repo.provider,
      isGitRepo: hasServiceRemote,
      gitAddress: repo.remoteUrl,
      remoteUrl: repo.remoteUrl,
      currentBranch: repo.defaultBranch,
      dirty: false,
      changedFiles: [],
      changedFileCount: 0,
      gitError: hasServiceRemote ? undefined : '未初始化本地 Git 服务',
      downloadUrl: `/api/management/repositories/${encodeURIComponent(repo.appId ?? repo.repoId)}/download`,
      requirementIds: [],
    });
  }
  return repositoriesByApp;
}

function readRepositoryDescription(root: string, repoId?: string): string | undefined {
  if (repoId === 'console') {
    return '电商领域后台管理页面，负责演示联调和业务操作入口';
  }
  const knowledgeDescription = readDomainKnowledgeDescription(root);
  if (knowledgeDescription) return knowledgeDescription;
  for (const name of ['README.md', 'README.MD', 'readme.md']) {
    const readmePath = path.join(root, name);
    if (!existsSync(readmePath) || !statSync(readmePath).isFile()) continue;
    const description = extractReadmeDescription(readFileSync(readmePath, 'utf-8'));
    if (description) return toChineseOnlySummary(description);
  }
  return undefined;
}

function readDomainKnowledgeDescription(root: string): string | undefined {
  const knowledgePath = path.join(root, 'knowledge', 'domain-context.json');
  if (!existsSync(knowledgePath) || !statSync(knowledgePath).isFile()) return undefined;
  try {
    const data = JSON.parse(readFileSync(knowledgePath, 'utf-8')) as {
      domainName?: unknown;
      requirementKeywords?: unknown;
    };
    const domainName = typeof data.domainName === 'string' ? data.domainName.trim() : '';
    const keywords = Array.isArray(data.requirementKeywords)
      ? data.requirementKeywords.filter((item): item is string => typeof item === 'string')
      : [];
    const scenes = keywords
      .map(item => item.trim())
      .filter(item => item && !/[A-Za-z]/.test(item))
      .slice(0, 4);
    if (!domainName || scenes.length === 0) return undefined;
    return limitChineseDescription(`${domainName}，主要负责的业务场景：${scenes.join('、')}`);
  } catch {
    return undefined;
  }
}

function extractReadmeDescription(content: string): string | undefined {
  const paragraph: string[] = [];
  let inCodeBlock = false;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock || line.startsWith('#') || line.startsWith('![')) continue;
    if (!line) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(line);
  }

  const text = paragraph.join(' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? truncateText(text, 180) : undefined;
}

function toChineseOnlySummary(text: string): string | undefined {
  const chineseText = text
    .replace(/[A-Za-z0-9._:/-]+/g, '')
    .replace(/\s+/g, '')
    .replace(/[，。；、]+$/g, '')
    .trim();
  return chineseText ? limitChineseDescription(chineseText) : undefined;
}

function limitChineseDescription(text: string): string {
  if (text.length <= 50) return text;
  return `${text.slice(0, 49)}等`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
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
