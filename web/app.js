/**
 * AI Coding Pipeline - Frontend Application
 * Vanilla JS single-page app for the MRD-to-Code workbench.
 */

// ── Global State ────────────────────────────────────────────────────────
const state = {
  runId: null,
  ws: null,
  pipeline: null,
  events: [],
  agents: [],
  selectedNodeId: null,
  currentModel: 'claude-sonnet-4-6',
  models: [],
  dynamicModels: [],
  stageDefaults: {},
  pendingUploads: [],
  creatingNewRun: false,
  modelOverrides: {},
  modelApiStatus: 'unknown',
  modelApiMessage: '未测试',
  runtimeSettings: { javaHome: '', mavenPath: '' },
  pendingConfirmation: null,
  confirmationWizard: null,
  confirmationWizardKey: '',
  pendingDeleteRunId: null,
  deleteConfirmTimer: null,
  expandedTools: new Set(),
  activeTab: 'artifacts',
  fileTreeCache: {},
  lastEventTimestamp: 0,
};

const PIPELINE_STAGES = [
  { id: 'upload-init', name: '上传/初始化', icon: '📁' },
  { id: 'mrd-render', name: '需求拆解', icon: '📋' },
  { id: 'implementation-plan', name: '实施方案', icon: '🧭' },
  { id: 'spec-generate', name: 'SPEC生成', icon: '📐' },
  { id: 'java-impl', name: 'Java 实现', icon: '☕' },
  { id: 'testcode-generate', name: '测试代码', icon: '✓' },
  { id: 'archive', name: '归档', icon: '📦' },
];

const STAGE_NAMES = Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, s.name]));
const STATUS_LABELS = {
  idle: '空闲',
  pending: '待处理',
  running: '运行中',
  waiting_confirmation: '等待确认',
  completed: '已完成',
  failed: '失败',
  suspended: '已暂停',
  cancelled: '已取消',
  skipped: '已跳过',
  created: '已创建',
  waking: '唤醒中',
  waiting_tool: '等待工具',
  compacting: '压缩上下文',
};

const ACTIVE_PIPELINE_STATUSES = new Set(['running', 'waiting_confirmation']);

const TOOL_ICONS = {
  read_file: '📖', write_file: '✏️', edit_file: '🔧', bash: '▶️',
  glob: '🔍', grep: '🔎', maven_compile: '🔨', maven_test: '🧪',
  jdk_java: '☕', jdk_javac: '⚙️', maven_dependency_tree: '🌳',
  maven_effective_pom: '📄',
};

// ── Initialization ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadPipelineDefinition();
  loadSessions();
  loadModels();
  loadRuntimeSettings();
  setupDragDrop();
  renderPipelineBar();
  pollEvents();
});

function loadPipelineDefinition() {
  fetch('/api/pipeline/definition').then(r => r.json()).then(data => {
    state.pipelineNodes = (data.nodes || PIPELINE_STAGES).map(node => ({
      ...node,
      name: stageName(node.id, node.name),
    }));
    renderPipelineBar();
  }).catch(() => {
    state.pipelineNodes = PIPELINE_STAGES;
  });
}

function loadModels() {
  fetch('/api/models').then(r => r.json()).then(data => {
    state.models = data.models || [];
    state.dynamicModels = data.customModels || state.models.filter(m => m.providerId === 'custom-openai-compatible');
    state.stageDefaults = data.stageDefaults || {};
    if (data.customStageOverrides && Object.keys(data.customStageOverrides).length) {
      state.modelOverrides = data.customStageOverrides;
    }
    if (data.models?.length) {
      const current = state.dynamicModels.find(m => m.id === state.currentModel) ||
        state.models.find(m => m.id === state.currentModel) ||
        state.dynamicModels[0] ||
        data.models[0];
      state.currentModel = current.id;
      updateModelSettingBadge(current.displayName);
    } else {
      updateModelSettingBadge();
    }
    if (state.dynamicModels.length) testCustomModelApi({ useSaved: true, silent: true });
  }).catch(() => {});
}

function updateModelSettingBadge(currentDisplayName) {
  const label = document.getElementById('current-model');
  const badge = document.getElementById('model-badge');
  const dot = document.getElementById('model-status-dot');
  if (label) label.textContent = '设置';
  if (dot) dot.className = `model-status-dot ${state.modelApiStatus || 'unknown'}`;
  if (badge) {
    const current = currentDisplayName || state.models.find(m => m.id === state.currentModel)?.displayName || state.currentModel || '未选择模型';
    const statusText = {
      ok: 'API 测试通过',
      error: 'API 测试失败',
      testing: 'API 测试中',
      unknown: 'API 未测试',
    }[state.modelApiStatus] || 'API 未测试';
    badge.title = `${statusText}；当前模型：${current}${state.modelApiMessage ? `；${state.modelApiMessage}` : ''}`;
  }
}

async function loadRuntimeSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    state.runtimeSettings = {
      javaHome: data.java?.javaHome || '',
      mavenPath: data.java?.mavenPath || '',
    };
    fillRuntimeSettingsForm();
  } catch {
    // Settings are optional; the server can still fall back to PATH.
  }
}

function fillRuntimeSettingsForm() {
  const javaHome = document.getElementById('settings-java-home');
  const mavenPath = document.getElementById('settings-maven-path');
  if (javaHome) javaHome.value = state.runtimeSettings.javaHome || '';
  if (mavenPath) mavenPath.value = state.runtimeSettings.mavenPath || '';
}

function setModelApiStatus(status, message = '') {
  state.modelApiStatus = status;
  state.modelApiMessage = message;
  updateModelSettingBadge();
}

// ── Pipeline Bar ────────────────────────────────────────────────────────
function renderPipelineBar() {
  const container = document.getElementById('pipeline-nodes');
  const nodes = state.pipeline?.nodes || state.pipelineNodes || PIPELINE_STAGES;
  const pipelineStatus = state.pipeline?.status || 'idle';
  const statusBadge = document.getElementById('pipeline-status-badge');
  if (statusBadge) {
    statusBadge.className = `pipeline-status-badge ${pipelineStatus}`;
    statusBadge.textContent = statusLabel(pipelineStatus);
  }
  renderInterruptButton();
  renderProjectDownloadButton();

  let html = '';
  nodes.forEach((node, i) => {
    const status = getNodeStatus(node.id);
    const displayName = stageName(node.id, node.name);
    const retryButton = canRerunFromNode(node)
      ? `<button class="node-rerun-btn" type="button" title="从此节点重跑" onclick="retryPipelineFromNode('${escAttr(node.id)}', event)">↻</button>`
      : '';
    html += `<div class="pipeline-node ${status} ${state.selectedNodeId === node.id ? 'selected' : ''}" data-node="${node.id}" title="${esc(displayName)}" onclick="openPipelineNode('${node.id}')">
      ${retryButton}
      <div class="node-icon">${statusIcon(status)}</div>
      <span>${esc(displayName)}</span>
      <small>${statusLabel(status)}</small>
    </div>`;
    if (i < nodes.length - 1) {
      html += `<span class="pipeline-arrow">→</span>`;
    }
  });
  container.innerHTML = html;
}

function openPipelineNode(nodeId) {
  state.selectedNodeId = nodeId;
  renderPipelineBar();
  renderExecutionTrace();
  loadFileTree('artifacts');
  loadAgents();
  const artifact = getStageArtifacts(nodeId)[0];
  if (artifact && state.runId && state.activeTab === 'preview') {
    previewFile('artifacts', artifact);
  } else if (state.activeTab === 'preview' && !artifact) {
    clearPreviewForSelectedNode();
  }
}

function stageName(id, fallback) {
  return STAGE_NAMES[id] || fallback || id;
}

function statusLabel(status) {
  return STATUS_LABELS[status] || status || '';
}

function statusIcon(status) {
  return {
    pending: '○',
    running: '●',
    waiting_confirmation: '⚠',
    completed: '✓',
    failed: '✕',
    skipped: '⊘',
  }[status] || '○';
}

function getNodeStatus(nodeId) {
  if (!state.pipeline) return 'pending';
  const node = state.pipeline.nodes?.find(n => n.id === nodeId);
  return node?.status || 'pending';
}

function isActivePipelineStatus(status = state.pipeline?.status) {
  return ACTIVE_PIPELINE_STATUSES.has(status);
}

// ── Sessions ────────────────────────────────────────────────────────────
function loadSessions() {
  fetch('/api/sessions').then(r => r.json()).then(data => {
    const sessions = data.sessions || [];
    renderSessionList(sessions);
    if (!state.runId && sessions.length) {
      loadSession(sessions[0].runId);
    }
  });
}

function renderSessionList(sessions) {
  const container = document.getElementById('session-list');
  if (!sessions.length) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px">暂无会话</div>';
    return;
  }
  container.innerHTML = sessions.map(s => `
    <div class="session-item ${s.runId === state.runId ? 'active' : ''}" data-run-id="${esc(s.runId)}" role="button" tabindex="0">
      <div class="session-main">
        <div class="session-name">${esc(s.name)}</div>
        <div class="session-meta">
          <span class="status-badge ${s.status}">${statusLabel(s.status)}</span>
          ${s.currentNodeId || s.currentNodeName ? ' @ ' + stageName(s.currentNodeId, s.currentNodeName) : ''}
          <span style="margin-left:auto">${Math.round(s.progress * 100)}%</span>
        </div>
      </div>
      <button class="session-delete ${state.pendingDeleteRunId === s.runId ? 'confirming' : ''}" title="${state.pendingDeleteRunId === s.runId ? '再次点击确认删除' : '删除会话'}" data-delete-run-id="${esc(s.runId)}" aria-label="${state.pendingDeleteRunId === s.runId ? '确认删除会话' : '删除会话'}">
        ${state.pendingDeleteRunId === s.runId ? '<span>确认</span>' : trashIcon()}
      </button>
    </div>
  `).join('');
  bindSessionListEvents(container);
}

function bindSessionListEvents(container) {
  container.querySelectorAll('.session-item').forEach(item => {
    item.addEventListener('click', () => selectSession(item.dataset.runId));
    item.addEventListener('keydown', event => handleSessionKey(event, item.dataset.runId));
  });
  container.querySelectorAll('.session-delete').forEach(btn => {
    btn.addEventListener('click', event => requestDeleteSession(event, btn.dataset.deleteRunId));
  });
}

function trashIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6h18"></path>
    <path d="M8 6V4h8v2"></path>
    <path d="M19 6l-1 14H6L5 6"></path>
    <path d="M10 11v5"></path>
    <path d="M14 11v5"></path>
  </svg>`;
}

function handleSessionKey(event, runId) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    selectSession(runId);
  }
}

async function selectSession(runId) {
  if (!runId) return;
  const clearedDeleteConfirmation = clearPendingDeleteSession();
  if (runId === state.runId) {
    updateSessionActiveState();
    if (clearedDeleteConfirmation) loadSessions();
    return;
  }
  await loadSession(runId);
  if (clearedDeleteConfirmation) loadSessions();
}

function requestDeleteSession(event, runId) {
  event.stopPropagation();
  if (!runId) return;
  if (state.pendingDeleteRunId !== runId) {
    state.pendingDeleteRunId = runId;
    resetDeleteConfirmTimer();
    loadSessions();
    return;
  }
  deleteSession(runId);
}

function resetDeleteConfirmTimer() {
  if (state.deleteConfirmTimer) clearTimeout(state.deleteConfirmTimer);
  state.deleteConfirmTimer = setTimeout(() => {
    state.pendingDeleteRunId = null;
    state.deleteConfirmTimer = null;
    loadSessions();
  }, 5000);
}

function clearPendingDeleteSession() {
  const hadPending = Boolean(state.pendingDeleteRunId || state.deleteConfirmTimer);
  if (state.deleteConfirmTimer) clearTimeout(state.deleteConfirmTimer);
  state.pendingDeleteRunId = null;
  state.deleteConfirmTimer = null;
  return hadPending;
}

async function deleteSession(runId) {
  clearPendingDeleteSession();
  await fetch(`/api/sessions/${runId}`, { method: 'DELETE' });
  if (state.runId === runId) {
    if (state.ws) state.ws.close();
    state.runId = null;
    state.pipeline = null;
    state.events = [];
    state.agents = [];
    state.selectedNodeId = null;
    state.lastEventTimestamp = 0;
    renderPipelineBar();
    renderExecutionTraceEmpty();
    clearFilePanels();
  }
  await loadSessions();
}

function renderExecutionTraceEmpty() {
  const container = document.getElementById('execution-trace');
  if (!container) return;
  container.innerHTML = `
    <div class="welcome-screen" id="welcome-screen">
      <h2>⚡ MRD 到代码流水线</h2>
      <p>上传 MRD、项目与参考资料，配置任务后启动流水线。系统会编排需求渲染、PRD、技术设计、Java 实现、测试运行与归档。</p>
    </div>
  `;
}

function clearFilePanels() {
  const artifactTree = document.getElementById('artifact-tree');
  const filePreview = document.getElementById('file-preview');
  const agentsList = document.getElementById('agents-list');
  if (artifactTree) artifactTree.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px">暂无产物</div>';
  if (filePreview) filePreview.innerHTML = '<div style="padding:20px;color:var(--text-muted);text-align:center">选择文件查看预览</div>';
  if (agentsList) agentsList.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px">暂无 Agent</div>';
  renderInterruptButton();
  renderProjectDownloadButton();
}

async function loadSession(runId) {
  const switchingRun = state.runId !== runId;
  if (switchingRun && state.ws) {
    state.ws.close();
    state.ws = null;
  }
  state.runId = runId;
  const mainLayout = document.getElementById('main-layout');
  const welcomeScreen = document.getElementById('welcome-screen');
  if (mainLayout) mainLayout.style.display = 'grid';
  if (welcomeScreen) welcomeScreen.style.display = 'none';

  const res = await fetch(`/api/sessions/${runId}`);
  const data = await res.json();
  if (state.runId !== runId) return;
  state.pipeline = data.state;
  if (switchingRun) {
    state.selectedNodeId = null;
    state.pendingConfirmation = null;
    state.confirmationWizard = null;
    state.confirmationWizardKey = '';
    state.fileTreeCache = {};
  }
  ensureSelectedNode();
  if (data.state?.modelOverrides && Object.keys(data.state.modelOverrides).length > 0) {
    state.modelOverrides = data.state.modelOverrides;
  }
  state.events = data.events || [];
  state.lastEventTimestamp = state.events.length ? state.events[state.events.length - 1].timestamp : 0;

  renderPipelineBar();
  renderInterruptButton();
  renderExecutionTrace();
  dismissStaleConfirmationIfNeeded();
  updateSessionActiveState();
  renderSessionInfo();
  loadFileTree('artifacts');
  loadAgents();
  connectWebSocket(runId);
}

function updateSessionActiveState() {
  document.querySelectorAll('.session-item').forEach(item => {
    item.classList.toggle('active', item.dataset.runId === state.runId);
  });
}

function renderSessionInfo() {
  if (!state.pipeline) return;
  const info = document.getElementById('session-info');
  if (!info) return;
  const s = state.pipeline;
  info.innerHTML = `
    <div style="font-weight:600;font-size:13px">${esc(s.name)}</div>
    <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
      <span class="status-badge ${s.status}">${statusLabel(s.status)}</span>
      <span style="font-size:10px;color:var(--text-muted)">${s.runId.slice(0,8)}</span>
    </div>
  `;
  const permissionMode = document.getElementById('permission-mode');
  if (permissionMode) permissionMode.value = s.permissionMode || 'default';
}

function openNewTaskPage() {
  state.creatingNewRun = true;
  state.pendingUploads = [];
  const uploaded = document.getElementById('uploaded-files');
  if (uploaded) uploaded.innerHTML = '';
  const page = document.getElementById('new-task-page');
  if (page) page.style.display = 'flex';
}

function closeNewTaskPage() {
  state.creatingNewRun = false;
  state.pendingUploads = [];
  const uploaded = document.getElementById('uploaded-files');
  if (uploaded) uploaded.innerHTML = '';
  const fileInput = document.getElementById('task-file-input');
  const projectInput = document.getElementById('project-folder-input');
  if (fileInput) fileInput.value = '';
  if (projectInput) projectInput.value = '';
  const page = document.getElementById('new-task-page');
  if (page) page.style.display = 'none';
}

// ── Create New Run ─────────────────────────────────────────────────────
function showNewRunModal() {
  document.getElementById('new-run-modal').style.display = 'flex';
}
function closeNewRunModal() {
  document.getElementById('new-run-modal').style.display = 'none';
}

async function createNewRun() {
  const name = document.getElementById('new-run-name').value || 'MRD 到代码运行';
  const desc = document.getElementById('new-run-desc').value;

  const formData = new FormData();
  formData.append('name', name);
  if (desc) formData.append('description', desc);

  const fileInput = document.getElementById('new-run-files');
  for (const file of fileInput.files || []) {
    appendUploadFile(formData, file, 'input');
  }
  const projectFolderInput = document.getElementById('new-run-project-folders');
  for (const file of projectFolderInput.files || []) {
    appendUploadFile(formData, file, 'project');
  }
  // If custom prompt is provided, write it as an input file for the run.
  if (desc) {
    formData.append(`filesPath:${encodeURIComponent('custom-prompt.md')}`, new Blob([desc], { type: 'text/markdown' }), 'custom-prompt.md');
  }

  const res = await fetch('/api/sessions', { method: 'POST', body: formData });
  const data = await res.json();

  closeNewRunModal();

  // Reset form
  document.getElementById('new-run-name').value = '';
  document.getElementById('new-run-desc').value = '';
  fileInput.value = '';
  projectFolderInput.value = '';

  await loadSession(data.runId);
  await applyModelOverridesToCurrentRun();
  loadSessions();
}

// ── File Upload ────────────────────────────────────────────────────────
function setupDragDrop() {
  bindDropArea('input-upload-area', 'input');
  bindDropArea('project-upload-area', 'project');
}

function bindDropArea(areaId, target) {
  const area = document.getElementById(areaId);
  if (!area) return;
  area.addEventListener('dragover', e => { e.preventDefault(); area.classList.add('dragover'); });
  area.addEventListener('dragleave', () => area.classList.remove('dragover'));
  area.addEventListener('drop', async e => {
    e.preventDefault();
    area.classList.remove('dragover');
    const items = await collectDroppedFiles(e.dataTransfer);
    uploadFileItems(items, target);
  });
}

function openUploadPicker(event, inputId) {
  event.stopPropagation();
  document.getElementById(inputId).click();
}

function handleFileSelect(e, target = 'auto') {
  uploadFileItems(filesToUploadItems(e.target.files), target);
  e.target.value = '';
}

function handleFolderSelect(e, target) {
  uploadFileItems(filesToUploadItems(e.target.files), target);
  e.target.value = '';
}

function filesToUploadItems(fileList) {
  return Array.from(fileList || []).map(file => ({
    file,
    relativePath: file.webkitRelativePath || file.name,
  }));
}

function appendUploadFile(formData, file, target = 'auto', relativePath) {
  const relPath = relativePath || file.webkitRelativePath || file.name;
  if (target === 'project') {
    formData.append(`projectPath:${encodeURIComponent(relPath)}`, file, file.name);
    return;
  }
  if (target === 'input') {
    formData.append(`filesPath:${encodeURIComponent(relPath)}`, file, file.name);
    return;
  }
  if (file.name.toLowerCase().endsWith('.zip')) {
    formData.append('project', file);
    return;
  }
  formData.append(`filesPath:${encodeURIComponent(relPath)}`, file, file.name);
}

async function uploadFileItems(items, target = 'auto') {
  if (state.creatingNewRun || !state.runId) {
    state.pendingUploads.push(...items.map(item => ({ ...item, target })));
    renderPendingUploads();
    renderPipelineBar();
    loadSessions();
    return;
  }
  const formData = new FormData();
  for (const item of items) {
    appendUploadFile(formData, item.file, target, item.relativePath);
  }
  const res = await fetch(`/api/sessions/${state.runId}/upload`, { method: 'POST', body: formData });
  const result = await res.json();
  renderUploadedFiles(summarizeUploadedFiles(result.files || []));
  await refreshCurrentRunView();
}

function summarizeUploadedFiles(files) {
  const byName = new Map();
  for (const file of files) {
    const type = file.type || 'input';
    const cleaned = String(file.name || '').replace(/\\/g, '/');
    const name = type === 'project' ? cleaned.split('/').filter(Boolean)[0] || cleaned : cleaned;
    const key = `${type}:${name}`;
    const existing = byName.get(key) || { name, size: 0, type, count: 0 };
    existing.size += file.size || 0;
    existing.count += 1;
    byName.set(key, existing);
  }
  return Array.from(byName.values());
}

function renderPendingUploads() {
  renderUploadedFiles(summarizePendingUploads(state.pendingUploads));
}

function summarizePendingUploads(items) {
  const byName = new Map();
  for (const item of items) {
    const type = item.target === 'project' ? 'project' : 'input';
    const name = type === 'project'
      ? (item.relativePath || item.file.name).split('/').filter(Boolean)[0] || item.file.name
      : item.file.name;
    const key = `${type}:${name}`;
    const existing = byName.get(key) || { name, size: 0, type, count: 0 };
    existing.size += item.file.size || 0;
    existing.count += 1;
    byName.set(key, existing);
  }
  return Array.from(byName.values());
}

async function collectDroppedFiles(dataTransfer) {
  const transferItems = Array.from(dataTransfer.items || []);
  const entries = transferItems
    .map(item => typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null)
    .filter(Boolean);

  if (!entries.length) return filesToUploadItems(dataTransfer.files);

  const collected = [];
  for (const entry of entries) {
    collected.push(...await walkEntry(entry, ''));
  }
  return collected;
}

async function walkEntry(entry, prefix) {
  if (entry.isFile) {
    const file = await readFileEntry(entry);
    return [{ file, relativePath: `${prefix}${file.name}` }];
  }
  if (!entry.isDirectory) return [];

  const reader = entry.createReader();
  const children = [];
  while (true) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }

  const nextPrefix = `${prefix}${entry.name}/`;
  const files = [];
  for (const child of children) {
    files.push(...await walkEntry(child, nextPrefix));
  }
  return files;
}

function readFileEntry(entry) {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function renderUploadedFiles(files) {
  const container = document.getElementById('uploaded-files');
  if (!files.length) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = files.map(f => `
    <div class="uploaded-file">
      <span>${f.type === 'project' ? '🗂' : '📄'} ${esc(f.name)}${f.count > 1 ? ` · ${f.count} 个文件` : ''} (${(f.size/1024).toFixed(1)}KB)</span>
    </div>
  `).join('');
}

// ── Pipeline Control ───────────────────────────────────────────────────
async function startPipeline() {
  if (state.creatingNewRun || !state.runId) {
    const formData = new FormData();
    formData.append('name', '快速运行');
    for (const item of state.pendingUploads) {
      appendUploadFile(formData, item.file, item.target, item.relativePath);
    }
    const customPrompt = document.getElementById('task-custom-prompt')?.value?.trim();
    if (customPrompt) {
      formData.append(
        `filesPath:${encodeURIComponent('custom-prompt.md')}`,
        new Blob([customPrompt], { type: 'text/markdown' }),
        'custom-prompt.md',
      );
    }
    const res = await fetch('/api/sessions', { method: 'POST', body: formData });
    const data = await res.json();
    state.pendingUploads = [];
    const customPromptInput = document.getElementById('task-custom-prompt');
    if (customPromptInput) customPromptInput.value = '';
    await loadSession(data.runId);
    await applyModelOverridesToCurrentRun();
    loadSessions();
    state.creatingNewRun = false;
    const page = document.getElementById('new-task-page');
    if (page) page.style.display = 'none';
  }

  const btn = document.getElementById('start-btn');
  btn.disabled = true;
  btn.textContent = '⏳ 运行中...';

  await fetch(`/api/sessions/${state.runId}/pipeline/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  await refreshCurrentRunView();
  setTimeout(refreshCurrentRunView, 800);
}

async function retryPipelineFromNode(nodeId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!state.runId || !nodeId || isActivePipelineStatus(state.pipeline?.status)) return;
  const node = (state.pipeline?.nodes || []).find(item => item.id === nodeId);
  const label = stageName(nodeId, node?.name);
  const confirmed = window.confirm(`从「${label}」开始重跑？该节点及后续节点会重新执行。`);
  if (!confirmed) return;
  state.selectedNodeId = nodeId;
  await fetch(`/api/sessions/${state.runId}/pipeline/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromNodeId: nodeId }),
  });
  await refreshCurrentRunView();
  await loadSessions();
  setTimeout(refreshCurrentRunView, 800);
}

function canRerunFromNode(node) {
  if (!state.runId || !node) return false;
  if (isActivePipelineStatus(state.pipeline?.status)) return false;
  return ['completed', 'failed', 'cancelled', 'interrupted', 'suspended', 'waiting_fix'].includes(node.status);
}

async function refreshCurrentRunView() {
  if (!state.runId) return;
  const runId = state.runId;
  try {
    const res = await fetch(`/api/sessions/${runId}`);
    const data = await res.json();
    if (state.runId !== runId) return;
    state.pipeline = data.state;
    ensureSelectedNode();
    state.events = data.events || state.events || [];
    state.agents = data.agents || state.agents || [];
    state.lastEventTimestamp = state.events.length ? state.events[state.events.length - 1].timestamp : state.lastEventTimestamp;
    renderPipelineBar();
    renderInterruptButton();
    renderSessionInfo();
    renderExecutionTrace();
    dismissStaleConfirmationIfNeeded();
    loadSessions();
    loadFileTree('artifacts');
    loadAgents();
  } catch(e) {}
}

function ensureSelectedNode() {
  const nodes = state.pipeline?.nodes || [];
  if (!nodes.length) return;
  if (state.selectedNodeId && nodes.some(node => node.id === state.selectedNodeId)) return;
  state.selectedNodeId = state.pipeline?.currentNodeId ||
    nodes[state.pipeline?.currentNodeIndex]?.id ||
    nodes.find(node => node.status === 'running' || node.status === 'waiting_confirmation')?.id ||
    nodes.find(node => node.status === 'completed')?.id ||
    nodes[0].id;
}

async function suspendSession() {
  if (!state.runId) return;
  await fetch(`/api/sessions/${state.runId}/suspend`, { method: 'POST' });
  await loadSession(state.runId);
  loadSessions();
}

async function cancelSession() {
  if (!state.runId) return;
  if (!confirm('确定取消本次流水线运行？')) return;
  await fetch(`/api/sessions/${state.runId}/cancel`, { method: 'POST' });
  await loadSession(state.runId);
  loadSessions();
}

function isInterruptibleStatus(status) {
  return status === 'running' || status === 'waiting_confirmation';
}

function canInterruptCurrentRun() {
  if (!state.runId || !state.pipeline) return false;
  if (['completed', 'failed', 'cancelled'].includes(state.pipeline.status)) return false;
  if (isInterruptibleStatus(state.pipeline.status) || state.pipeline.status === 'suspended') return true;
  return (state.pipeline.nodes || []).some(node => ['running', 'waiting_confirmation', 'suspended'].includes(node.status));
}

function renderInterruptButton() {
  const panel = document.getElementById('center-task-panel');
  const btn = document.getElementById('interrupt-task-btn');
  const topBtn = document.getElementById('pipeline-interrupt-btn');
  const label = document.getElementById('active-task-label');
  if (!panel || !btn) return;
  const visible = canInterruptCurrentRun();
  const currentNode = state.pipeline?.nodes?.[state.pipeline?.currentNodeIndex] ||
    state.pipeline?.nodes?.find(node => node.status === 'running' || node.status === 'waiting_confirmation');
  panel.style.display = visible ? 'flex' : 'none';
  btn.style.display = visible ? 'inline-flex' : 'none';
  if (topBtn) topBtn.style.display = visible ? 'inline-flex' : 'none';
  if (label && currentNode) {
    label.textContent = `${stageName(currentNode.id, currentNode.name)} · ${statusLabel(currentNode.status || state.pipeline?.status)}`;
  }
}

function renderProjectDownloadButton() {
  const actions = document.getElementById('artifact-actions');
  if (!actions) return;
  const archiveNode = state.pipeline?.nodes?.find(node => node.id === 'archive');
  const visible = Boolean(state.runId && state.selectedNodeId === 'archive' && state.pipeline?.status === 'completed' && archiveNode?.status === 'completed');
  actions.style.display = visible ? 'block' : 'none';
}

function downloadProjectFolder() {
  if (!state.runId) return;
  window.location.href = `/api/sessions/${state.runId}/download/project`;
}

async function interruptCurrentTask() {
  if (!state.runId || !canInterruptCurrentRun()) return;
  if (!confirm('确定中断当前流程？中断后当前节点会标记为已中断，本次运行会停止。')) return;
  const btn = document.getElementById('interrupt-task-btn');
  const topBtn = document.getElementById('pipeline-interrupt-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '中断中...';
  }
  if (topBtn) {
    topBtn.disabled = true;
    topBtn.textContent = '中断中...';
  }
  try {
    await fetch(`/api/sessions/${state.runId}/pipeline/interrupt`, { method: 'POST' });
    await refreshCurrentRunView();
    await loadSessions();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '中断任务';
    }
    if (topBtn) {
      topBtn.disabled = false;
      topBtn.textContent = '中断流程';
    }
    renderInterruptButton();
  }
}

async function updatePermissionMode() {
  if (!state.runId) return;
  const permissionMode = document.getElementById('permission-mode');
  if (!permissionMode) return;
  const mode = permissionMode.value;
  await fetch(`/api/sessions/${state.runId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ permissionMode: mode }),
  });
}

// ── Confirmation Gates ────────────────────────────────────────────────
let currentConfirmNode = null;

async function resolveConfirmation(approved) {
  if (!state.runId || !currentConfirmNode) return;
  saveCurrentConfirmWizardPage();
  let feedback = document.getElementById('confirm-feedback').value;
  if (state.pendingConfirmation?.confirmationKind === 'mrd-clarify' ||
      state.pendingConfirmation?.confirmationKind === 'mrd-clarify-questions') {
    const wizardFeedback = buildConfirmWizardFeedback();
    const selected = document.querySelector('input[name="mrd-clarify-option"]:checked');
    const option = selected?.value || 'default';
    const optionLabel = selected?.dataset?.label || option;
    const label = state.pendingConfirmation?.confirmationKind === 'mrd-clarify-questions'
      ? '需求拆解问题确认'
      : 'MRD 澄清选择';
    feedback = wizardFeedback || [
      `${label}：${optionLabel} (${option})`,
      feedback ? `补充说明：${feedback}` : '',
    ].filter(Boolean).join('\n\n');
  }

  await fetch(`/api/sessions/${state.runId}/pipeline/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeId: currentConfirmNode, approved, feedback }),
  });

  document.getElementById('confirmation-overlay').style.display = 'none';
  document.getElementById('confirm-feedback').value = '';
  currentConfirmNode = null;
  state.pendingConfirmation = null;
  state.confirmationWizard = null;
  state.confirmationWizardKey = '';

  await refreshCurrentRunView();
  await loadSessions();
  setTimeout(() => {
    if (state.runId) {
      refreshCurrentRunView();
      loadSessions();
    }
  }, 600);
}

// ── Execution Trace ───────────────────────────────────────────────────
function renderExecutionTrace() {
  const container = document.getElementById('execution-trace');
  const welcome = document.getElementById('welcome-screen');
  if (!state.pipeline) {
    renderExecutionTraceEmpty();
    return;
  }
  if (welcome) welcome.style.display = 'none';

  ensureSelectedNode();
  container.innerHTML = renderSelectedNodeExecution();
  renderDeferredToolResults();
}

function renderSelectedNodeExecution() {
  const nodes = state.pipeline?.nodes || state.pipelineNodes || PIPELINE_STAGES;
  const node = getSelectedNode();
  if (!node) return '<div style="color:var(--text-muted);padding:12px">请选择一个 Pipeline 节点</div>';
  const summary = summarizeNode(node);
  return `
    <div class="node-status-board">
      <div class="node-status-header">
        <span>当前节点执行状态</span>
        <span>${nodes.findIndex(n => n.id === node.id) + 1}/${nodes.length}</span>
      </div>
      ${renderNodeStatusCard(node, false)}
      <div class="selected-node-stream">
        <div class="selected-node-stream-title">执行内容</div>
        <div id="selected-node-events">${renderSelectedNodeEvents(summary.events)}</div>
      </div>
    </div>
  `;
}

function getSelectedNode() {
  const nodes = state.pipeline?.nodes || state.pipelineNodes || PIPELINE_STAGES;
  return nodes.find(node => node.id === state.selectedNodeId) || nodes[0];
}

function renderNodeStatusCard(node, clickable = true) {
  const summary = summarizeNode(node);
  const artifacts = getStageArtifacts(node.id);
  const onclick = clickable ? `onclick="openPipelineNode('${node.id}')"` : '';
  const rerunAction = canRerunFromNode(node)
    ? `<button class="btn btn-secondary node-status-rerun" type="button" onclick="retryPipelineFromNode('${escAttr(node.id)}', event)">↻ 从此重跑</button>`
    : '';
  const currentNodeId = state.pipeline?.currentNodeId || state.pipeline?.nodes?.[state.pipeline?.currentNodeIndex]?.id;
  const interruptAction = canInterruptCurrentRun() && (node.id === currentNodeId || ['running', 'waiting_confirmation', 'suspended'].includes(node.status))
    ? `<button class="btn btn-danger node-status-interrupt" type="button" onclick="interruptCurrentTaskFromNode(event)">中断流程</button>`
    : '';
  const actions = [interruptAction, rerunAction].filter(Boolean).join('');
  return `
    <div class="node-status-card ${node.status || 'pending'}" ${onclick}>
      <div class="node-status-icon">${statusIcon(node.status || 'pending')}</div>
      <div>
        <div class="node-status-title">
          <span class="node-status-name">${esc(stageName(node.id, node.name))}</span>
          <span class="status-badge ${node.status || 'pending'}">${statusLabel(node.status || 'pending')}</span>
        </div>
        <div class="node-status-desc">${esc(nodeSubtaskLabel(node.id))}</div>
        <div class="node-status-meta">
          ${summary.model ? `<span>模型：${esc(summary.model)}</span>` : ''}
          <span>Agent：${summary.agentCount}</span>
          ${summary.duration ? `<span>耗时：${summary.duration}</span>` : ''}
          ${artifacts.length ? `<span>产物：${artifacts.length} 份</span>` : ''}
          ${node.error ? `<span>错误：${esc(String(node.error).slice(0, 80))}</span>` : ''}
        </div>
        ${renderNodeStepContent(node, summary)}
        ${actions ? `<div class="node-status-actions">${actions}</div>` : ''}
      </div>
      <div class="node-status-side">
        ${summary.startedAt ? `<span>${formatShortTime(summary.startedAt)}</span>` : '<span>未开始</span>'}
        ${summary.eventCount ? `<span>${summary.eventCount} 条事件</span>` : ''}
      </div>
    </div>
  `;
}

function interruptCurrentTaskFromNode(event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  interruptCurrentTask();
}

function renderSelectedNodeEvents(events) {
  const visibleEvents = events.filter(isVisibleTraceEvent);
  if (!visibleEvents.length) {
    return `<div class="selected-node-empty">该节点暂无工具执行、产物写入或确认记录。</div>`;
  }
  return buildTraceItems(visibleEvents).map(renderTraceItem).join('');
}

function appendEventToSelectedTrace(event) {
  if (!state.selectedNodeId || event.nodeId !== state.selectedNodeId) return false;
  if (!isVisibleTraceEvent(event)) return true;
  const container = document.getElementById('selected-node-events');
  if (!container) return false;
  const node = getSelectedNode();
  const summary = summarizeNode(node);
  container.innerHTML = renderSelectedNodeEvents(summary.events);
  const stream = container.closest('.selected-node-stream');
  if (stream) stream.scrollTop = stream.scrollHeight;
  return true;
}

function isVisibleTraceEvent(event) {
  return [
    'model_selected',
    'model_switched',
    'agent_wakeup',
    'agent_start',
    'agent_end',
    'tool_start',
    'tool_end',
    'tool_error',
    'artifact_written',
    'confirmation_waiting',
    'confirmation_resolved',
    'plan_created',
    'node_retry_scheduled',
    'compact_start',
    'compact_end',
    'pipeline_started',
    'pipeline_resumed',
    'pipeline_completed',
    'pipeline_failed',
    'pipeline_cancelled',
    'node_rollback_requested',
    'node_rollback_started',
    'error',
  ].includes(event.type);
}

function buildTraceItems(events) {
  const items = [];
  const toolItems = new Map();
  for (const event of events) {
    const d = event.data || {};
    if (event.type === 'tool_start') {
      const item = { kind: 'tool', start: event, end: null, error: null };
      items.push(item);
      if (d.toolUseId) toolItems.set(d.toolUseId, item);
      continue;
    }
    if (event.type === 'tool_end') {
      const item = toolItems.get(d.toolUseId);
      if (item) item.end = event;
      else items.push({ kind: 'tool', start: null, end: event, error: null });
      continue;
    }
    if (event.type === 'tool_error') {
      const item = toolItems.get(d.toolUseId);
      if (item) item.error = event;
      else items.push({ kind: 'tool', start: null, end: null, error: event });
      continue;
    }
    const rendered = renderEvent(event);
    if (rendered) items.push({ kind: 'event', event, html: rendered });
  }
  return items;
}

function renderTraceItem(item) {
  if (item.kind === 'event') return item.html;
  return renderToolTraceItem(item);
}

function renderToolTraceItem(item) {
  const start = item.start;
  const end = item.end;
  const error = item.error;
  const d = start?.data || end?.data || error?.data || {};
  const toolId = d.toolUseId || `tool-${Math.random().toString(36).slice(2)}`;
  const toolName = d.toolName || start?.data?.toolName || 'tool';
  const input = start?.data?.input;
  const result = end?.data;
  const isError = Boolean(error || result?.isError);
  const status = end || error ? (isError ? 'failed' : 'done') : 'running';
  const preview = typeof input === 'object' ? formatToolPreview(toolName, input) : String(input || '');
  const outputText = typeof result?.output === 'string' ? result.output : '';
  return `
    <div class="trace-tool-card ${status} ${isError ? 'error' : ''}" id="tool-${esc(toolId)}">
      <button class="trace-tool-summary" type="button" onclick="toggleTool('${esc(String(toolId).replace(/'/g, "\\'"))}')">
        <span class="trace-tool-badge">${esc(toolName).toUpperCase()}</span>
        <span class="trace-tool-title">${esc(preview || toolName)}</span>
        <span class="trace-tool-state">${status === 'running' ? '运行中' : isError ? '失败' : '完成'}</span>
      </button>
      <div class="tool-body" id="tool-body-${esc(toolId)}">
        <div class="tool-detail-title">TOOL CALL</div>
        <pre>${esc(JSON.stringify(input || {}, null, 2))}</pre>
        <div class="tool-detail-title">TOOL RESULT</div>
        <pre>${esc(error?.data?.error || outputText || (status === 'running' ? '执行中...' : `输出长度：${result?.outputLength || 0} 字符${result?.outputTruncated ? '，已截断' : ''}`))}</pre>
      </div>
    </div>
  `;
}

function renderDeferredToolResults() {
  const selectedEvents = getSelectedNodeEvents();
  for (const event of selectedEvents) {
    if (event.type !== 'tool_end') continue;
    const d = event.data || {};
    const toolId = d.toolUseId;
    setTimeout(() => {
      const status = document.getElementById(`tool-status-${toolId}`);
      const body = document.getElementById(`tool-body-${toolId}`);
      if (status) status.textContent = d.isError ? '✗' : '✓';
      if (body) body.textContent = `输出（${d.outputLength || 0} 字符${d.outputTruncated ? '，已截断' : ''}）：\n${d.isError ? '[错误]\n' : ''}${typeof d.output === 'string' ? d.output.slice(0, 2000) : ''}`;
    }, 0);
  }
}

function getSelectedNodeEvents() {
  const nodeId = state.selectedNodeId;
  return (state.events || []).filter(event => event.nodeId === nodeId || event.data?.nodeId === nodeId || event.data?.stageId === nodeId);
}

function summarizeNode(node) {
  const nodeEvents = (state.events || []).filter(event => event.nodeId === node.id || event.data?.nodeId === node.id || event.data?.stageId === node.id);
  const attemptStart = node.startedAt || [...nodeEvents].reverse().find(event => event.type === 'pipeline_node_start')?.timestamp || 0;
  const events = attemptStart
    ? nodeEvents.filter(event => (event.timestamp || 0) >= attemptStart)
    : nodeEvents;
  const agents = (state.agents || []).filter(agent => agent.nodeId === node.id);
  const modelEvent = [...events].reverse().find(event => event.type === 'model_selected' || event.type === 'model_switched');
  const startedAt = node.startedAt || events.find(event => event.type === 'pipeline_node_start')?.timestamp;
  const completedAt = node.completedAt || [...events].reverse().find(event => event.type === 'pipeline_node_end')?.timestamp;
  return {
    eventCount: events.length,
    agentCount: agents.length,
    model: modelEvent?.data?.modelId || modelEvent?.data?.toModel || agents[0]?.currentModelId,
    startedAt,
    duration: startedAt && completedAt ? formatDuration(completedAt - startedAt) : '',
    events,
    agents,
  };
}

function renderNodeStepContent(node, summary) {
  const steps = buildNodeSteps(node, summary).slice(0, 6);
  if (!steps.length) return '';
  return `<div class="node-status-steps">
    ${steps.map(step => `<div class="node-status-step ${step.status}">
      <span>${step.status === 'done' ? '✓' : step.status === 'running' ? '●' : step.status === 'failed' ? '✕' : '○'}</span>
      <span>${esc(step.text)}</span>
    </div>`).join('')}
  </div>`;
}

function buildNodeSteps(node, summary) {
  const steps = [];
  if (node.status === 'pending') return [{ status: 'todo', text: '等待前置节点完成' }];
  if (summary.model) steps.push({ status: 'done', text: `选择模型 ${summary.model}` });
  if (summary.agents.length) {
    for (const agent of summary.agents.slice(0, 2)) {
      steps.push({
        status: agent.status === 'completed' ? 'done' : agent.status === 'failed' ? 'failed' : 'running',
        text: `Agent ${String(agent.agentRunId || '').slice(0, 8)}：${statusLabel(agent.status)}，${agent.turnCount || 0} 轮，工具 ${agent.toolCallCount || 0} 次`,
      });
      if (agent.plan?.title) {
        steps.push({ status: agent.plan.confirmed ? 'done' : 'running', text: `计划模式：${agent.plan.title}` });
      }
    }
  }
  const hasConfirmation = summary.events.some(event => event.type === 'confirmation_waiting');
  const confirmationResolved = summary.events.some(event => event.type === 'confirmation_resolved');
  if (hasConfirmation) steps.push({ status: confirmationResolved ? 'done' : 'running', text: confirmationResolved ? '确认门已通过' : '等待确认门处理' });
  const retryEvents = summary.events.filter(event => event.type === 'node_retry_scheduled');
  if (retryEvents.length) {
    const latest = retryEvents[retryEvents.length - 1].data || {};
    steps.push({
      status: node.status === 'failed' ? 'failed' : 'running',
      text: `已自动重试 ${latest.retryAttempt || retryEvents.length}/${latest.maxRetries || 3} 次`,
    });
  }
  const artifacts = getStageArtifacts(node.id);
  if (artifacts.length) steps.push({ status: node.status === 'completed' ? 'done' : 'running', text: `生成产物 ${artifacts.length} 份` });
  if (node.status === 'completed') steps.push({ status: 'done', text: '节点执行完成' });
  if (node.status === 'running') steps.push({ status: 'running', text: '节点正在执行' });
  if (node.status === 'failed') steps.push({ status: 'failed', text: node.error || '节点执行失败' });
  return steps;
}

function formatShortTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function renderEvent(event) {
  const d = event.data || {};
  const ts = new Date(event.timestamp).toLocaleTimeString();

  switch (event.type) {
    case 'pipeline_created':
      return `<div class="trace-event system">[${ts}] 已创建流水线：${esc(d.name || '')}</div>`;
    case 'pipeline_started':
      return `<div class="trace-event system">[${ts}] ▶ 流水线已启动</div>`;
    case 'pipeline_resumed':
      return `<div class="trace-event system">[${ts}] ▶ 流水线已恢复</div>`;
    case 'pipeline_node_start':
      return `<div class="trace-event stage-start" data-node="${d.nodeId}">
        [${ts}] ▶ ${esc(stageName(d.nodeId, d.nodeName))}
      </div>`;
    case 'pipeline_node_end':
      const endClass = d.success ? '' : 'failed';
      return `<div class="trace-event stage-end ${endClass}">
        [${ts}] ${d.success ? '✓' : '✗'} ${esc(stageName(d.nodeId, d.nodeId))} ${d.success ? '已完成' : '失败'}
      </div>`;
    case 'pipeline_completed':
      return `<div class="trace-event stage-start" style="border-color:var(--accent-green);color:var(--accent-green)">
        [${ts}] ✓ 流水线已成功完成
      </div>`;
    case 'pipeline_failed':
      return `<div class="trace-event stage-start" style="border-color:var(--accent-red);color:var(--accent-red)">
        [${ts}] ✗ 流水线失败：${esc(d.error || '')}
      </div>`;
    case 'pipeline_cancelled':
      return `<div class="trace-event system" style="color:var(--accent-red)">[${ts}] ✕ 流水线已取消</div>`;
    case 'node_retry_scheduled':
      return `<div class="trace-event retry-marker">
        <span></span>
        <b>第 ${esc(d.retryAttempt || '')} 次重试</b>
        <em>${esc(String(d.error || '').slice(0, 140))}</em>
        <span></span>
      </div>`;
    case 'node_rollback_requested':
      return `<div class="trace-event system" style="color:var(--accent-yellow)">[${ts}] ↻ 已请求回退重试：${esc(d.reason || '')}</div>`;
    case 'node_rollback_started':
      return `<div class="trace-event retry-marker">
        <span></span>
        <b>第 ${esc(d.attempt || '')} 次重试</b>
        <em>${esc(d.reason || '')}</em>
        <span></span>
      </div>`;
    case 'agent_wakeup':
      return `<div class="trace-event system">[${ts}] 🤖 Agent 唤醒中（模型：${esc(d.modelId || '')}）</div>`;
    case 'agent_start':
      turnNum = 0;
      return `<div class="trace-event turn-marker">── Agent 已启动 ${d.planMode ? '（计划模式）' : ''} ──</div>`;
    case 'agent_text':
      return '';
    case 'agent_thinking':
      return `<div class="trace-event thinking">💭 ${esc(d.thinking || '')}</div>`;
    case 'agent_end':
      return `<div class="trace-event system">[${ts}] Agent 已完成（${d.turns || '?'} 轮）</div>`;
    case 'tool_start': {
      const toolId = d.toolUseId;
      const icon = TOOL_ICONS[d.toolName] || '🔧';
      const preview = typeof d.input === 'object' ? formatToolPreview(d.toolName, d.input) : String(d.input);
      return `<div class="trace-event tool-call" id="tool-${toolId}" data-tool="${d.toolName}">
        <div class="tool-header" onclick="toggleTool('${toolId}')">
          <span class="tool-icon">${icon}</span>
          <span class="tool-name">${d.toolName}</span>
          <span class="tool-preview">${esc(preview.slice(0, 80))}</span>
          <span class="tool-status" id="tool-status-${toolId}">⏳</span>
        </div>
        <div class="tool-body" id="tool-body-${toolId}">执行中...</div>
      </div>`;
    }
    case 'tool_end': {
      const toolId = d.toolUseId;
      setTimeout(() => {
        const status = document.getElementById(`tool-status-${toolId}`);
        const body = document.getElementById(`tool-body-${toolId}`);
        if (status) status.textContent = d.isError ? '✗' : '✓';
        if (body) body.textContent = `输出（${d.outputLength} 字符${d.outputTruncated ? '，已截断' : ''}）：\n${d.isError ? '[错误]\n' : ''}${typeof d.output === 'string' ? d.output.slice(0, 2000) : ''}`;
      }, 0);
      return '';
    }
    case 'tool_error': {
      const toolId = d.toolUseId;
      setTimeout(() => {
        const status = document.getElementById(`tool-status-${toolId}`);
        if (status) status.textContent = '✗';
      }, 0);
      return '';
    }
    case 'model_selected':
      return `<div class="trace-event model-event">[${ts}] 🤖 已选择模型：<b>${esc(d.modelId)}</b>（智能等级：L${d.intelligenceLevel}）用于 ${esc(stageName(d.stageId, d.stageId))}</div>`;
    case 'model_switched':
      state.currentModel = d.toModel;
      updateModelSettingBadge(d.toModel);
      return `<div class="trace-event model-event">[${ts}] 🔄 模型切换：${esc(d.fromModel)} → <b>${esc(d.toModel)}</b>（${esc(d.reason)}）</div>`;
    case 'compact_start':
      return `<div class="trace-event compact-event">[${ts}] 📦 上下文压缩中...（已用 ${Math.round(d.tokensUsed/1000)}K tokens）</div>`;
    case 'compact_end':
      return `<div class="trace-event compact-event">[${ts}] ✓ 压缩完成：${Math.round(d.tokensBefore/1000)}K → ${Math.round(d.tokensAfter/1000)}K tokens（减少 ${Math.round((1-d.compressionRatio)*100)}%）</div>`;
    case 'confirmation_waiting':
      return `<div class="trace-event system" style="color:var(--accent-yellow)">[${ts}] ⚠️ 等待确认：${esc(stageName(d.nodeId, d.nodeId))}${isConfirmationWaitingEventActive(event) ? '' : '（已处理）'}</div>`;
    case 'plan_created':
      return `<div class="trace-event system" style="color:var(--accent-cyan)">[${ts}] 📋 已生成计划：${esc(d.plan?.title || '')}</div>`;
    case 'confirmation_resolved':
      return `<div class="trace-event system">[${ts}] ${d.approved ? '✓ 已确认' : '✗ 已驳回'} ${d.feedback ? '（反馈：' + esc(d.feedback.slice(0,100)) + '）' : ''}</div>`;
    case 'artifact_written':
      return `<div class="trace-event system" style="color:var(--accent-green)">[${ts}] 📄 已写入产物：${esc(d.artifactPath || '')} (${((d.size||0)/1024).toFixed(1)}KB) ${d.description ? esc(d.description) : ''}</div>`;
    case 'error':
      return `<div class="trace-event" style="color:var(--accent-red)">[${ts}] 错误：${esc(d.message || '')}</div>`;
    default:
      return '';
  }
}

function formatToolPreview(toolName, input) {
  if (!input) return '';
  if (input.file_path) return input.file_path;
  if (input.command) return input.command.slice(0, 80);
  if (input.pattern) return input.pattern;
  const keys = Object.keys(input);
  return keys.length ? `${toolName}(${keys.slice(0,2).join(',')})` : toolName;
}

function toggleTool(toolId) {
  const el = document.getElementById(`tool-${toolId}`);
  if (el) el.classList.toggle('expanded');
}

function getPipelineNodeById(nodeId) {
  return state.pipeline?.nodes?.find(node => node.id === nodeId);
}

function hasConfirmationResolvedAfter(nodeId, timestamp = 0) {
  return (state.events || []).some(event =>
    event.type === 'confirmation_resolved' &&
    (event.nodeId === nodeId || event.data?.nodeId === nodeId) &&
    (event.timestamp || 0) >= timestamp
  );
}

function isConfirmationWaitingEventActive(event) {
  const d = event?.data || {};
  const nodeId = d.nodeId || event?.nodeId;
  if (!nodeId) return false;
  const node = getPipelineNodeById(nodeId);
  if (node && node.status !== 'waiting_confirmation') return false;
  if (hasConfirmationResolvedAfter(nodeId, event.timestamp || 0)) return false;
  return true;
}

function dismissStaleConfirmationIfNeeded() {
  if (!currentConfirmNode) return;
  const node = getPipelineNodeById(currentConfirmNode);
  if (!node || node.status === 'waiting_confirmation') return;
  const overlay = document.getElementById('confirmation-overlay');
  if (overlay) overlay.style.display = 'none';
  const feedback = document.getElementById('confirm-feedback');
  if (feedback) {
    feedback.value = '';
    feedback.oninput = null;
  }
  const finalActions = document.querySelector('.confirmation-dialog .btn-row');
  if (finalActions) finalActions.style.display = 'flex';
  currentConfirmNode = null;
  state.pendingConfirmation = null;
  state.confirmationWizard = null;
  state.confirmationWizardKey = '';
}

function showConfirmation(d) {
  state.pendingConfirmation = d;
  const overlay = document.getElementById('confirmation-overlay');
  document.getElementById('confirm-title').textContent = d.title || `确认：${stageName(d.nodeId, d.nodeId)}`;
  const content = typeof d.content === 'string' ? d.content : JSON.stringify(d.content, null, 2);
  const contentEl = document.getElementById('confirm-content');
  const feedback = document.getElementById('confirm-feedback');
  const finalActions = document.querySelector('.confirmation-dialog .btn-row');
  feedback.value = '';
  feedback.placeholder = '可选：填写修改意见...';
  feedback.oninput = null;
  if (finalActions) finalActions.style.display = 'flex';

  if (d.confirmationKind === 'mrd-clarify-questions') {
    setupConfirmWizard(d, content);
    renderConfirmWizardPage();
  } else if (d.confirmationKind === 'mrd-clarify') {
    const options = Array.isArray(d.clarificationOptions) && d.clarificationOptions.length
      ? d.clarificationOptions
      : [
          { id: 'default', label: '按推荐默认决策继续', description: '接受当前问题清单中的默认判断，进入最终需求拆解生成。' },
          { id: 'manual', label: '我补充具体口径', description: '使用下方补充说明回答或修正待澄清问题。' },
        ];
    contentEl.innerHTML = `
      <div class="confirm-question-layout">
        <div class="confirm-section confirm-question-panel">
          <div class="confirm-section-title">${d.confirmationKind === 'mrd-clarify-questions' ? '待回答问题' : '待澄清内容'}</div>
          <pre>${esc(content)}</pre>
        </div>
        <div class="confirm-section confirm-choice-panel">
          <div class="confirm-section-title">处理方案</div>
          <div class="confirm-options">
            ${options.map((option, index) => `
              <label class="confirm-option ${index === 0 ? 'selected' : ''}">
                <input type="radio" name="mrd-clarify-option" value="${esc(option.id)}" data-label="${esc(option.label)}" ${index === 0 ? 'checked' : ''} onchange="syncConfirmOptionStyles()">
                <span>
                  <strong>${esc(option.label)}</strong>
                  <small>${esc(option.description || '')}</small>
                </span>
              </label>
            `).join('')}
          </div>
          <div class="confirm-help-text">选择“按推荐默认决策继续”会把当前默认判断写入最终需求拆解；选择补充口径时，请在下方说明中回答关键问题。</div>
        </div>
      </div>
    `;
    feedback.placeholder = '可选：回答待澄清问题，或补充业务口径、边界条件、字段规则、验收标准...';
  } else if (d.confirmationKind === 'spec' && Array.isArray(d.confirmationSections)) {
    contentEl.innerHTML = `
      <div class="confirm-two-columns">
        ${d.confirmationSections.slice(0, 2).map(section => `
          <div class="confirm-section">
            <div class="confirm-section-title">${esc(section.title)}</div>
            <pre>${esc(String(section.content || '').slice(0, 3000))}</pre>
          </div>
        `).join('')}
      </div>
    `;
    feedback.placeholder = '可选：填写需要调整的开发任务或测试任务...';
  } else if (d.confirmationKind === 'implementation-plan') {
    contentEl.innerHTML = `<pre class="confirm-markdown-preview">${esc(content.slice(0, 9000))}</pre>`;
    feedback.placeholder = '可选：填写需要调整的 PRD 口径、项目技术方案、风险或边界...';
  } else if (d.confirmationKind === 'plan') {
    contentEl.innerHTML = `<pre class="confirm-markdown-preview plan-task-preview">${esc(content.slice(0, 9000))}</pre>`;
    feedback.placeholder = '可选：填写需要调整的执行任务、顺序、范围或风险控制点...';
  } else {
    contentEl.innerHTML = `<pre class="confirm-markdown-preview">${esc(content.slice(0, 5000))}</pre>`;
  }
  overlay.style.display = 'grid';
}

function setupConfirmWizard(d, content) {
  const key = `${d.nodeId || ''}:${d.artifactPath || ''}:${content.length}:${content.slice(0, 80)}`;
  if (state.confirmationWizard && state.confirmationWizardKey === key) return;
  const pages = parseClarificationQuestionPages(content);
  const options = Array.isArray(d.clarificationOptions) && d.clarificationOptions.length
    ? d.clarificationOptions
    : [
        { id: 'default', label: '按推荐默认决策', description: '接受本题推荐口径，继续后续需求拆解。' },
        { id: 'minimal', label: '按最小闭环', description: '先采用保守边界，只覆盖当前明确的核心流程。' },
        { id: 'manual', label: '我补充口径', description: '在下方填写本题的业务规则、边界或验收补充。' },
      ];
  state.confirmationWizardKey = key;
  state.confirmationWizard = {
    index: 0,
    pages: [
      ...pages.map((page, index) => ({ ...page, kind: 'question', number: index + 1 })),
      { kind: 'extra', title: '额外补充', body: '还有没有其它业务口径、边界条件、项目归属或验收标准需要补充？', number: pages.length + 1 },
    ],
    options,
    answers: pages.map(() => ({ option: options[0]?.id || 'default', note: '' })),
    extra: '',
  };
}

function parseClarificationQuestionPages(content) {
  const normalized = String(content || '').replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const listItems = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*]\s+|\d+[.、]\s+)(.+)$/);
    if (match) {
      if (current) listItems.push(current);
      current = match[1].trim();
    } else if (current && line.trim()) {
      current += `\n${line.trim()}`;
    }
  }
  if (current) listItems.push(current);

  const usefulItems = listItems.filter(item => item.length > 6 && !/^请确认[:：]?$/.test(item));
  if (usefulItems.length) {
    return usefulItems.map((item, index) => ({
      title: `问题 ${index + 1}`,
      body: item,
    }));
  }

  const sections = normalized
    .split(/\n(?=#{2,4}\s+)/)
    .map(part => part.trim())
    .filter(part => part && !/^#\s+MRD Clarify Questions/i.test(part));
  if (sections.length) {
    return sections.map((section, index) => {
      const [heading, ...body] = section.split('\n');
      return {
        title: heading.replace(/^#{2,4}\s*/, '').trim() || `问题 ${index + 1}`,
        body: body.join('\n').trim() || section,
      };
    });
  }

  const paragraphs = normalized
    .replace(/^#\s+MRD Clarify Questions\s*/i, '')
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean);
  return (paragraphs.length ? paragraphs : [normalized || '请确认当前需求拆解是否可作为后续实施方案输入。'])
    .map((part, index) => ({ title: `问题 ${index + 1}`, body: part }));
}

function renderConfirmWizardPage() {
  const wizard = state.confirmationWizard;
  if (!wizard) return;
  const page = wizard.pages[wizard.index];
  const isExtraPage = page.kind === 'extra';
  const isFirst = wizard.index === 0;
  const isLast = wizard.index === wizard.pages.length - 1;
  const contentEl = document.getElementById('confirm-content');
  const feedback = document.getElementById('confirm-feedback');
  const finalActions = document.querySelector('.confirmation-dialog .btn-row');
  const answer = wizard.answers[page.number - 1] || {};

  contentEl.innerHTML = `
    <div class="confirm-wizard">
      <div class="confirm-wizard-progress">
        <span>第 ${wizard.index + 1} / ${wizard.pages.length} 页</span>
        <div class="confirm-wizard-dots">
          ${wizard.pages.map((_, index) => `<span class="${index === wizard.index ? 'active' : index < wizard.index ? 'done' : ''}"></span>`).join('')}
        </div>
      </div>
      <div class="confirm-wizard-card">
        <div class="confirm-section-title">${esc(page.title)}</div>
        <pre>${esc(page.body)}</pre>
      </div>
      ${isExtraPage ? `
        <div class="confirm-help-text">这一页用于补充前面问题没有覆盖到的信息。没有额外内容时可以直接确认继续。</div>
      ` : `
        <div class="confirm-options">
          ${wizard.options.map(option => `
            <label class="confirm-option ${answer.option === option.id ? 'selected' : ''}">
              <input type="radio" name="mrd-clarify-option" value="${esc(option.id)}" data-label="${esc(option.label)}" ${answer.option === option.id ? 'checked' : ''} onchange="setConfirmWizardChoice('${esc(option.id)}')">
              <span>
                <strong>${esc(option.label)}</strong>
                <small>${esc(option.description || '')}</small>
              </span>
            </label>
          `).join('')}
        </div>
      `}
      <div class="confirm-wizard-nav">
        <button class="btn" onclick="confirmWizardPrev()" ${isFirst ? 'disabled' : ''}>上一页</button>
        <button class="btn btn-primary" onclick="confirmWizardNext()" ${isLast ? 'disabled' : ''}>下一页</button>
      </div>
    </div>
  `;

  feedback.value = isExtraPage ? (wizard.extra || '') : (answer.note || '');
  feedback.placeholder = isExtraPage
    ? '可选：补充其它业务口径、项目归属、边界条件或验收标准...'
    : '可选：填写本题的具体答案、修正意见或补充约束...';
  feedback.oninput = saveCurrentConfirmWizardPage;
  if (finalActions) finalActions.style.display = isLast ? 'flex' : 'none';
}

function saveCurrentConfirmWizardPage() {
  const wizard = state.confirmationWizard;
  if (!wizard) return;
  const page = wizard.pages[wizard.index];
  const feedback = document.getElementById('confirm-feedback')?.value || '';
  if (page.kind === 'extra') {
    wizard.extra = feedback;
    return;
  }
  const answer = wizard.answers[page.number - 1];
  if (!answer) return;
  const selected = document.querySelector('input[name="mrd-clarify-option"]:checked');
  answer.option = selected?.value || answer.option;
  answer.note = feedback;
}

function setConfirmWizardChoice(optionId) {
  const wizard = state.confirmationWizard;
  if (!wizard) return;
  const page = wizard.pages[wizard.index];
  if (page.kind !== 'extra') {
    const answer = wizard.answers[page.number - 1];
    if (answer) answer.option = optionId;
  }
  syncConfirmOptionStyles();
}

function confirmWizardPrev() {
  const wizard = state.confirmationWizard;
  if (!wizard || wizard.index <= 0) return;
  saveCurrentConfirmWizardPage();
  wizard.index -= 1;
  renderConfirmWizardPage();
}

function confirmWizardNext() {
  const wizard = state.confirmationWizard;
  if (!wizard || wizard.index >= wizard.pages.length - 1) return;
  saveCurrentConfirmWizardPage();
  wizard.index += 1;
  renderConfirmWizardPage();
}

function buildConfirmWizardFeedback() {
  const wizard = state.confirmationWizard;
  if (!wizard) return '';
  saveCurrentConfirmWizardPage();
  const optionById = new Map((wizard.options || []).map(option => [option.id, option]));
  const questionPages = wizard.pages.filter(page => page.kind === 'question');
  return [
    '需求拆解问题确认：分页回答',
    ...questionPages.map(page => {
      const answer = wizard.answers[page.number - 1] || {};
      const option = optionById.get(answer.option);
      return [
        `## ${page.title}`,
        page.body,
        `选择：${option?.label || answer.option || '按推荐默认决策'} (${answer.option || 'default'})`,
        answer.note ? `补充说明：${answer.note}` : '',
      ].filter(Boolean).join('\n');
    }),
    wizard.extra ? `## 额外补充\n${wizard.extra}` : '',
  ].filter(Boolean).join('\n\n');
}

function syncConfirmOptionStyles() {
  document.querySelectorAll('.confirm-option').forEach(option => {
    const input = option.querySelector('input[type="radio"]');
    option.classList.toggle('selected', Boolean(input?.checked));
  });
}

// ── File Trees ─────────────────────────────────────────────────────────
function switchTab(tab) {
  if (!document.getElementById(`tab-${tab}`)) tab = 'artifacts';
  activateTab(tab);
  if (tab === 'preview') {
    const artifact = state.selectedNodeId === 'spec-generate'
      ? findFirstFilePath(state.fileTreeCache.artifacts || [])
      : getStageArtifacts(state.selectedNodeId)[0];
    if (artifact && state.runId) previewFile('artifacts', artifact);
    else clearPreviewForSelectedNode();
  }
}

function activateTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tab}`));
}

async function loadFileTree(scope) {
  if (!state.runId) return;
  const runId = state.runId;
  try {
    const res = await fetch(`/api/sessions/${runId}/files?scope=${scope}`);
    const data = await res.json();
    if (state.runId !== runId) return;
    const containerId = scope === 'artifacts' ? 'artifact-tree' : null;
    if (!containerId) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    const tree = scope === 'artifacts' ? filterArtifactTreeForSelectedNode(data.tree || []) : data.tree;
    state.fileTreeCache[scope] = tree;
    container.innerHTML = renderFileTree(tree, scope);
    if (scope === 'artifacts' && state.activeTab === 'preview' && state.selectedNodeId === 'spec-generate') {
      const firstFile = findFirstFilePath(tree);
      if (firstFile) previewFile('artifacts', firstFile);
    }
  } catch(e) {}
}

function filterArtifactTreeForSelectedNode(tree) {
  if (state.selectedNodeId === 'spec-generate') {
    return filterTreeByPredicate(tree, node =>
      node.type === 'file' &&
      (node.path.endsWith('/openspec-task.md') || node.path.endsWith('/openspec-test-task.md') ||
        node.path === 'openspec-task.md' || node.path === 'openspec-test-task.md')
    );
  }
  const artifacts = getStageArtifacts(state.selectedNodeId);
  if (!artifacts.length) return [];
  return filterTreeByPaths(tree, new Set(artifacts));
}

function filterTreeByPaths(nodes, wantedPaths) {
  const result = [];
  for (const node of nodes || []) {
    if (node.type === 'file' && wantedPaths.has(node.path)) {
      result.push(node);
    } else if (node.type === 'directory') {
      const children = filterTreeByPaths(node.children || [], wantedPaths);
      if (children.length) result.push({ ...node, children });
    }
  }
  return result;
}

function filterTreeByPredicate(nodes, predicate) {
  const result = [];
  for (const node of nodes || []) {
    if (node.type === 'file' && predicate(node)) {
      result.push(node);
    } else if (node.type === 'directory') {
      const children = filterTreeByPredicate(node.children || [], predicate);
      if (children.length) result.push({ ...node, children });
    }
  }
  return result;
}

function findFirstFilePath(nodes) {
  for (const node of nodes || []) {
    if (node.type === 'file') return node.path;
    if (node.type === 'directory') {
      const child = findFirstFilePath(node.children || []);
      if (child) return child;
    }
  }
  return '';
}

function getStageArtifacts(nodeId) {
  if (!nodeId) return [];
  const node = (state.pipeline?.nodes || []).find(item => item.id === nodeId);
  const indexed = state.pipeline?.artifactIndex?.[nodeId] || state.pipeline?.artifact_index?.[nodeId];
  const artifacts = indexed || node?.outputArtifacts || node?.output_artifacts || [];
  const liveArtifacts = (state.events || [])
    .filter(event => event.type === 'artifact_written' && (event.nodeId === nodeId || event.data?.nodeId === nodeId))
    .map(event => event.data?.artifactPath);
  return sortStageArtifacts(nodeId, normalizeArtifactPaths([
    ...(Array.isArray(artifacts) ? artifacts : [artifacts]),
    ...liveArtifacts,
  ]));
}

function normalizeArtifactPaths(paths) {
  return Array.from(new Set((paths || [])
    .filter(Boolean)
    .map(path => String(path).replace(/\\/g, '/').replace(/^artifacts\//, ''))));
}

function sortStageArtifacts(nodeId, paths) {
  const priority = {
    'implementation-plan': ['prd.md', 'tech-design.md', 'implementation-plan-manifest.json'],
    'spec-generate': ['openspec-task.md', 'openspec-test-task.md', 'spec-manifest.json'],
    'java-impl': ['changed-files/', 'changed-files.json', 'code-preview-manifest.json', 'code-review.md', 'review-findings.json'],
    'testcode-generate': ['changed-test-files/', 'test-file-list.md', 'testcode-generation-report.md', 'test-code-preview-manifest.json', 'test-report.md', 'surefire-summary.json', 'coverage-summary.json', 'failure-classification.json', 'autofix-history.md'],
  }[nodeId] || [];
  const score = path => {
    const index = priority.findIndex(item => path.includes(item));
    return index < 0 ? 100 : index;
  };
  return [...paths].sort((a, b) => score(a) - score(b) || a.localeCompare(b));
}

function renderFileTree(nodes, scope, depth = 0) {
  if (!nodes || !nodes.length) {
    const node = getSelectedNode();
    return `<div style="color:var(--text-muted);font-size:11px;padding:8px">当前节点暂无产物：${esc(stageName(node?.id, node?.name))}</div>`;
  }
  return nodes.map(n => {
    if (n.type === 'directory') {
      return `<div class="tree-dir open">
        <div class="tree-label" onclick="this.parentElement.classList.toggle('open')">📁 ${esc(n.name)}</div>
        <div class="tree-children">${renderFileTree(n.children, scope, depth+1)}</div>
      </div>`;
    } else {
      return `<div class="tree-file" onclick="previewFile('${scope}', '${esc(n.path.replace(/'/g,"\\'"))}')">
        <span>📄 ${esc(n.name)}</span>
        <span style="margin-left:auto;font-size:10px;color:var(--text-muted)">${n.size ? (n.size/1024).toFixed(1)+'KB' : ''}</span>
      </div>`;
    }
  }).join('');
}

async function previewFile(scope, filePath) {
  activateTab('preview');
  const res = await fetch(`/api/sessions/${state.runId}/files/content?path=${encodeURIComponent(filePath)}&scope=${scope}`);
  const data = await res.json();
  const container = document.getElementById('file-preview');
  if (data.error) {
    container.innerHTML = `<div style="padding:20px;color:var(--accent-red)">${esc(data.error)}</div>`;
    return;
  }
  container.innerHTML = `
    <div class="file-preview-header">
      <span>${esc(data.path)}</span>
      <span>${(data.size/1024).toFixed(1)}KB</span>
    </div>
    <div class="file-preview-content">${esc(data.content || '')}</div>
  `;
}

function clearPreviewForSelectedNode() {
  const container = document.getElementById('file-preview');
  const node = getSelectedNode();
  if (container) {
    container.innerHTML = `<div style="padding:20px;color:var(--text-muted);text-align:center">当前节点暂无可预览产物：${esc(stageName(node?.id, node?.name))}</div>`;
  }
}

// ── Agents Panel ──────────────────────────────────────────────────────
async function loadAgents() {
  if (!state.runId) return;
  const runId = state.runId;
  try {
    const res = await fetch(`/api/sessions/${runId}/agents`);
    const data = await res.json();
    if (state.runId !== runId) return;
    state.agents = data.agents || [];
    renderAgents(state.agents);
  } catch(e) {}
}

function renderAgents(agents) {
  const container = document.getElementById('agents-list');
  const node = getSelectedNode();
  let currentAgents = (agents || []).filter(agent => agent.nodeId === state.selectedNodeId);
  if (['implementation-plan', 'spec-generate', 'java-impl', 'testcode-generate', 'archive'].includes(state.selectedNodeId)) {
    currentAgents = currentAgents.filter(agent => agent.projectName);
  }
  if (!currentAgents.length && !state.pipeline) {
    container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;padding:8px">暂无 Agent</div>';
    return;
  }
  container.innerHTML = `
    <div class="agent-overview">
      <div>
        <strong>${currentAgents.length}</strong>
        <span>当前节点 Agent</span>
      </div>
      <div>
        <strong>${currentAgents.filter(a => ['running','waking','waiting_tool','waiting_confirmation','compacting'].includes(a.status)).length}</strong>
        <span>运行中</span>
      </div>
      <div>
        <strong>${statusLabel(node?.status || 'pending')}</strong>
        <span>${stageName(node?.id, node?.name)}</span>
      </div>
    </div>
    ${renderAgentNodeGroup(node, currentAgents)}
  `;
}

function groupAgentsByNode(agents) {
  const groups = new Map();
  for (const agent of agents) {
    const key = agent.nodeId || 'unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(agent);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  }
  return groups;
}

function renderAgentNodeGroup(node, agents) {
  if (!node) return '<div class="agent-empty">请选择一个 Pipeline 节点</div>';
  const nodeName = stageName(node.id, node.name);
  const current = state.pipeline?.currentNodeId === node.id || state.pipeline?.nodes?.[state.pipeline.currentNodeIndex]?.id === node.id;
  return `
    <div class="agent-node-group ${current ? 'current' : ''}">
      <div class="agent-node-header">
        <div>
          <div class="agent-node-title">${esc(nodeName)}</div>
          <div class="agent-node-subtitle">${esc(nodeSubtaskLabel(node.id))}</div>
        </div>
        <span class="status-badge ${node.status || 'pending'}">${statusLabel(node.status || 'pending')}</span>
      </div>
      ${agents.length ? agents.map(renderAgentCard).join('') : `<div class="agent-empty">当前节点暂无 Agent 运行记录</div>`}
    </div>
  `;
}

function renderAgentCard(a) {
  const tokenK = Math.floor(((a.tokenUsage?.input || 0) + (a.tokenUsage?.output || 0)) / 1000);
  return `
    <div class="agent-card">
      <div class="agent-header">
        <span class="status-badge ${a.status}" style="font-size:9px">${statusLabel(a.status)}</span>
        <span class="agent-id">${esc((a.agentRunId || '').slice(0,8))}</span>
      </div>
      <div class="agent-task">
        <div><span>项目</span><strong>${esc(a.projectName || '全局')}</strong></div>
        <div><span>任务</span><strong>${esc(a.taskDescription || inferAgentTask(a))}</strong></div>
      </div>
      <div class="agent-model">🤖 ${esc(a.currentModelId || '未选择模型')}</div>
      <div class="agent-stats">
        <div class="agent-stat">轮次: <span>${a.turnCount || 0}</span></div>
        <div class="agent-stat">工具: <span>${a.toolCallCount || 0}</span></div>
        <div class="agent-stat">压缩: <span>${a.compactCount || 0}</span></div>
        <div class="agent-stat">Tokens: <span>${tokenK}K</span></div>
      </div>
      ${renderAgentPlan(a.plan)}
      ${renderModelSwitchHistory(a.modelSwitchHistory)}
    </div>
  `;
}

function inferAgentTask(agent) {
  const projectName = inferProjectName(agent);
  if (projectName && projectName !== '全局') return `${nodeSubtaskLabel(agent.nodeId)}：${projectName}`;
  return nodeSubtaskLabel(agent.nodeId);
}

function inferProjectName(agent) {
  if (agent.projectName) return agent.projectName;
  const id = String(agent.agentRunId || '');
  const match = id.match(/-(marketing|local|ump)(?:$|-)/i);
  return match ? match[1] : '全局';
}

function renderAgentPlan(plan) {
  if (!plan) return '';
  return `<div class="agent-plan">
    <div class="agent-plan-title">📋 ${esc(plan.title)}</div>
    ${(plan.steps || []).map(s => `<div class="agent-plan-step">
      <span>${s.status === 'completed' ? '✓' : s.status === 'in_progress' ? '●' : '○'}</span>
      <span>${esc(s.title)}</span>
      ${s.risk ? `<em class="${s.risk}">${riskLabel(s.risk)}</em>` : ''}
    </div>`).join('')}
  </div>`;
}

function renderModelSwitchHistory(history) {
  if (!history || !history.length) return '';
  return `<div class="agent-switches">
    ${history.slice(-3).map(item => `<div>模型切换：${esc(item.fromModel)} → ${esc(item.toModel)}</div>`).join('')}
  </div>`;
}

function nodeSubtaskLabel(nodeId) {
  return {
    'upload-init': '上传文件、初始化运行目录和项目空间',
    'mrd-render': '拆解需求、确认功能归属和待澄清问题',
    'implementation-plan': '生成 PRD 验收口径和项目技术方案',
    'spec-generate': '并发生成开发 OpenSpec 任务清单和测试任务清单',
    'java-impl': '读取项目、写代码、编译修复',
    'testcode-generate': '生成单元测试代码并真实执行 Maven 单测',
    'archive': '汇总产物并生成归档报告',
  }[nodeId] || '阶段子任务';
}

function riskLabel(risk) {
  return { low: '低风险', medium: '中风险', high: '高风险' }[risk] || risk;
}

// ── Model Selector ────────────────────────────────────────────────────
function showModelSelector() {
  loadRuntimeSettings();
  const container = document.getElementById('model-list');
  const dynamicModels = state.dynamicModels || [];
  container.innerHTML = `
    ${renderStageModelAssignments()}
    ${dynamicModels.length ? dynamicModels.map(m => `
    <div style="padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer"
         onclick="selectModel('${m.id}')">
      <div style="font-weight:600">${esc(m.displayName)}</div>
      <div style="display:flex;gap:12px;font-size:11px;color:var(--text-secondary);margin-top:4px">
        <span>智能: ${'★'.repeat(m.intelligenceLevel)}${'☆'.repeat(5-m.intelligenceLevel)}</span>
        <span>速度: ${'⚡'.repeat(m.speedLevel)}</span>
        <span>成本: ${'💰'.repeat(m.costLevel)}</span>
        <span>${m.contextWindow/1000|0}K ctx</span>
      </div>
      <div style="font-size:10px;color:var(--text-muted);margin-top:4px">${esc(m.recommendedFor.join(', '))}</div>
    </div>
  `).join('') : '<div style="padding:12px;color:var(--text-muted);font-size:12px;border:1px dashed var(--border);border-radius:8px">注册自定义 API 后，这里只显示从 /models 动态拉取到的模型。</div>'}`;
  document.getElementById('model-modal').style.display = 'flex';
}

async function saveRuntimeSettings() {
  const status = document.getElementById('runtime-settings-status');
  const javaHome = document.getElementById('settings-java-home')?.value.trim() || '';
  const mavenPath = document.getElementById('settings-maven-path')?.value.trim() || '';
  if (status) status.textContent = '正在保存...';
  try {
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ javaHome, mavenPath }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      if (status) status.textContent = `保存失败：${data.error || res.status}`;
      return;
    }
    state.runtimeSettings = {
      javaHome: data.java?.javaHome || javaHome,
      mavenPath: data.java?.mavenPath || mavenPath,
    };
    fillRuntimeSettingsForm();
    if (status) status.textContent = '已保存，后续 Java/Maven 工具会使用该配置';
  } catch (err) {
    if (status) status.textContent = `保存失败：${err?.message || '请求失败'}`;
  }
}

function getDynamicModels() {
  return state.dynamicModels || [];
}

function renderStageModelAssignments() {
  const models = getSelectableModels();
  if (!models.length) return '';
  const stages = PIPELINE_STAGES.filter(stage => stage.id !== 'upload-init');
  return `<div style="padding:10px;border:1px solid var(--border);border-radius:8px;margin-bottom:10px;background:var(--bg-primary)">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px">
      <div style="font-weight:600">阶段模型分配</div>
      <div style="font-size:10px;color:var(--text-muted)">不修改则使用默认路由</div>
    </div>
    ${stages.map(stage => {
      const selected = getStageModelValue(stage.id);
      return `<div style="display:grid;grid-template-columns:112px minmax(0,1fr);gap:10px;font-size:11px;color:var(--text-secondary);padding:4px 0;align-items:center">
      <span>${esc(stageName(stage.id, stage.name))}</span>
      <select class="stage-model-select" onchange="updateStageModelOverride('${stage.id}', this.value)" title="${esc(selected)}">
        ${models.map(model => `<option value="${esc(model.id)}" ${model.id === selected ? 'selected' : ''}>${esc(model.displayName || model.id)}${model.id === state.stageDefaults[stage.id] ? '（默认）' : ''}</option>`).join('')}
      </select>
    </div>`;
    }).join('')}
  </div>`;
}

function getSelectableModels() {
  return (state.dynamicModels && state.dynamicModels.length ? state.dynamicModels : state.models) || [];
}

function getStageModelValue(stageId) {
  return state.modelOverrides?.[stageId] ||
    state.stageDefaults?.[stageId] ||
    state.modelOverrides?._default ||
    state.currentModel;
}

async function updateStageModelOverride(stageId, modelId) {
  state.modelOverrides = { ...(state.modelOverrides || {}), [stageId]: modelId };
  const status = document.getElementById('custom-model-status');
  if (status) status.textContent = `${stageName(stageId, stageId)} 已切换到 ${modelId}`;
  await applyModelOverridesToCurrentRun();
  showModelSelector();
}

async function registerCustomModelProvider() {
  const status = document.getElementById('custom-model-status');
  const apiKey = document.getElementById('custom-api-key').value.trim();
  const baseUrl = document.getElementById('custom-base-url').value.trim();
  const fullModelUrl = document.getElementById('custom-full-url').checked;

  if (!baseUrl) {
    status.textContent = '请填写 API 请求地址';
    return;
  }

  status.textContent = '正在拉取模型...';
  setModelApiStatus('testing', '正在注册并拉取模型');
  const res = await fetch('/api/models/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey, baseUrl, fullModelUrl }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    status.textContent = `注册失败：${data.error || res.status}`;
    setModelApiStatus('error', data.error || `HTTP ${res.status}`);
    return;
  }

  state.dynamicModels = data.models || [];
  state.models = data.models?.length ? mergeModels(state.models, data.models) : state.models;
  state.modelOverrides = data.stageOverrides || {};
  const defaultModel = Object.values(state.modelOverrides)[0] || data.models?.[0]?.id;
  if (defaultModel) {
    state.currentModel = defaultModel;
    const m = state.models.find(x => x.id === defaultModel);
    updateModelSettingBadge(m?.displayName || defaultModel);
  }
  await applyModelOverridesToCurrentRun();
  status.textContent = `注册成功，已拉取 ${data.models?.length || 0} 个模型`;
  setModelApiStatus('ok', `已拉取 ${data.models?.length || 0} 个模型`);
  showModelSelector();
}

async function testCustomModelApi(options = {}) {
  const status = document.getElementById('custom-model-status');
  const useSaved = options.useSaved === true;
  const silent = options.silent === true;
  const apiKeyEl = document.getElementById('custom-api-key');
  const baseUrlEl = document.getElementById('custom-base-url');
  const fullUrlEl = document.getElementById('custom-full-url');
  const apiKey = useSaved ? undefined : apiKeyEl?.value.trim();
  const baseUrl = useSaved ? undefined : baseUrlEl?.value.trim();
  const fullModelUrl = useSaved ? undefined : fullUrlEl?.checked;

  if (!useSaved && !baseUrl) {
    if (status) status.textContent = '请先填写 API 请求地址';
    setModelApiStatus('error', '缺少 API 请求地址');
    return;
  }

  if (status && !silent) status.textContent = '正在测试 API...';
  setModelApiStatus('testing', '正在测试 API');

  try {
    const res = await fetch('/api/models/custom/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, baseUrl, fullModelUrl }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      const msg = data.error || `HTTP ${res.status}`;
      if (status && !silent) status.textContent = `测试失败：${msg}`;
      setModelApiStatus('error', msg);
      return;
    }
    const msg = `测试通过，${data.latencyMs}ms，模型 ${data.modelCount || 0} 个`;
    if (status && !silent) status.textContent = msg;
    setModelApiStatus('ok', msg);
  } catch (err) {
    const msg = err?.message || '请求失败';
    if (status && !silent) status.textContent = `测试失败：${msg}`;
    setModelApiStatus('error', msg);
  }
}

function mergeModels(existing, incoming) {
  const byId = new Map(existing.map(m => [m.id, m]));
  for (const model of incoming) byId.set(model.id, model);
  return Array.from(byId.values()).sort((a, b) => b.intelligenceLevel - a.intelligenceLevel);
}

async function applyModelOverridesToCurrentRun() {
  if (!state.runId || !Object.keys(state.modelOverrides || {}).length) return;
  await fetch(`/api/sessions/${state.runId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ modelOverrides: state.modelOverrides }),
  });
  const res = await fetch(`/api/sessions/${state.runId}`);
  const data = await res.json();
  state.pipeline = data.state;
  renderPipelineBar();
  renderSessionInfo();
}

function selectModel(modelId) {
  state.currentModel = modelId;
  const m = state.models.find(x => x.id === modelId);
  updateModelSettingBadge(m?.displayName || modelId);
  document.getElementById('model-modal').style.display = 'none';
  if (state.runId) {
    state.modelOverrides = { ...state.modelOverrides, '_default': modelId };
    fetch(`/api/sessions/${state.runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelOverrides: state.modelOverrides }),
    });
  }
}

// ── WebSocket ─────────────────────────────────────────────────────────
function connectWebSocket(runId) {
  if (state.ws) state.ws.close();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/ws?runId=${runId}`);
  state.ws = ws;

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleWSMessage(msg);
    } catch(e) {}
  };

  ws.onclose = () => {
    // Try reconnect after 2s
    setTimeout(() => {
      if (state.runId === runId) connectWebSocket(runId);
    }, 2000);
  };
}

function handleWSMessage(msg) {
  // Update pipeline state
  if (msg.type === 'pipeline_complete' || msg.type === 'pipeline_failed' || msg.type === 'pipeline_cancelled') {
    const btn = document.getElementById('start-btn');
    if (btn) { btn.disabled = false; btn.textContent = '▶ 启动流水线'; }
    renderInterruptButton();
    loadSessions();
  }

  if (msg.type === 'stage_start' || msg.type === 'stage_end' ||
      msg.type === 'confirmation_required' || msg.type === 'pipeline_complete' ||
      msg.type === 'pipeline_failed' || msg.type === 'pipeline_cancelled') {
    refreshCurrentRunView();
  }

  if (msg.type === 'stage_progress' && msg.event) {
    // Append agent events to trace
    const evType = msg.event.type === 'text' ? 'agent_text' :
          msg.event.type === 'thinking' ? 'agent_thinking' :
          msg.event.type === 'tool_use_start' ? 'tool_start' :
          msg.event.type === 'tool_use_end' ? 'tool_end' :
          msg.event.type === 'error' ? 'error' :
          msg.event.type === 'plan_generated' ? 'plan_created' :
          msg.event.type === 'compact' ? 'compact_end' :
          msg.event.type === 'artifact_written' ? 'artifact_written' :
          'system';
    state.events.push({
      type: evType,
      timestamp: Date.now(),
      data: msg.event.type === 'text' ? { text: msg.event.text } :
            msg.event.type === 'thinking' ? { thinking: msg.event.thinking } :
            msg.event.type === 'tool_use_start' ? { toolName: msg.event.name, toolUseId: msg.event.toolUseId, input: msg.event.input } :
            msg.event.type === 'tool_use_end' ? { toolName: msg.event.name, toolUseId: msg.event.toolUseId, isError: msg.event.isError, outputLength: msg.event.result?.length || 0, outputTruncated: false, output: msg.event.result } :
            msg.event.type === 'error' ? { message: msg.event.message } :
            msg.event.type === 'plan_generated' ? { plan: msg.event.plan } :
            msg.event.type === 'completed' ? {} :
            msg.event.type === 'artifact_written' ? { nodeId: msg.event.nodeId, artifactPath: msg.event.artifactPath, size: msg.event.size, description: msg.event.description } :
            msg.event,
      nodeId: msg.nodeId,
    });
    // Refresh file tree when artifacts are written
    if (msg.event.type === 'artifact_written' && state.selectedNodeId) {
      addLiveArtifactToPipelineIndex(msg.nodeId, msg.event.artifactPath);
      loadFileTree('artifacts');
    }
    const appended = appendEventToSelectedTrace(state.events[state.events.length - 1]);
    if (!appended && msg.nodeId === state.selectedNodeId && msg.event.type !== 'text') {
      renderExecutionTrace();
    }
  }

  if (msg.type === 'confirmation_required') {
    currentConfirmNode = msg.nodeId;
    showConfirmation(msg);
  }
}

function addLiveArtifactToPipelineIndex(nodeId, artifactPath) {
  if (!state.pipeline || !nodeId || !artifactPath) return;
  state.pipeline.artifactIndex = state.pipeline.artifactIndex || state.pipeline.artifact_index || {};
  const normalized = String(artifactPath).replace(/\\/g, '/');
  const existing = state.pipeline.artifactIndex[nodeId] || [];
  if (!existing.includes(normalized)) {
    state.pipeline.artifactIndex[nodeId] = [...existing, normalized];
  }
  const node = (state.pipeline.nodes || []).find(item => item.id === nodeId);
  if (node) {
    const outputArtifacts = node.outputArtifacts || node.output_artifacts || [];
    if (!outputArtifacts.includes(normalized)) {
      node.outputArtifacts = [...outputArtifacts, normalized];
    }
  }
}

// ── Event polling (fallback when WS not available) ────────────────────
async function pollEvents() {
  if (!state.runId || state.ws?.readyState === WebSocket.OPEN) {
    setTimeout(pollEvents, 2000);
    return;
  }
  try {
    const res = await fetch(`/api/sessions/${state.runId}/events?since=${state.lastEventTimestamp}`);
    const data = await res.json();
    for (const event of data.events || []) {
      if (event.timestamp > state.lastEventTimestamp) {
        state.events.push(event);
        state.lastEventTimestamp = event.timestamp;
      }
    }
    if (data.events?.length) renderExecutionTrace();
  } catch(e) {}
  setTimeout(pollEvents, 2000);
}

// ── Utility ────────────────────────────────────────────────────────────
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escAttr(s) {
  return esc(s).replace(/'/g, '&#39;').replace(/`/g, '&#96;');
}

// Refresh file trees periodically
setInterval(() => {
  if (state.runId && isActivePipelineStatus()) {
    loadFileTree('artifacts');
    loadAgents();
    loadSessions();
  }
}, 5000);
