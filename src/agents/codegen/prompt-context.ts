import * as fs from 'fs';
import * as path from 'path';
import { PipelineNode } from '../../workflows/definitions/pipelineDefinition.js';
import { getRunPaths } from '../../runtime/paths.js';
import { ProjectManifest, detectProjectRoots, listProjectFiles } from './upload-init.js';
import { extractSection } from './requirement-decompose.js';
import { loadPromptFile, renderPromptTemplate } from './prompt-files.js';
import { readProjectOpenSpecContext } from './openspec-integration.js';

export function buildImplementationPlanPrompt(
  node: PipelineNode,
  paths: ReturnType<typeof getRunPaths>,
  manifest: ProjectManifest,
  feedbackText = '（无）',
): string {
  const clarifiedMrdPath = path.join(paths.artifactsDir, 'mrd-clarified.md');
  let clarifiedMrdSection = '（未找到 artifacts/mrd-clarified.md）';
  if (fs.existsSync(clarifiedMrdPath)) {
    clarifiedMrdSection = `- path: artifacts/mrd-clarified.md\n\n${fs.readFileSync(clarifiedMrdPath, 'utf-8').slice(0, 40000)}`;
  } else {
    const legacyMrdPath = path.join(paths.artifactsDir, 'mrd.md');
    if (fs.existsSync(legacyMrdPath)) {
      clarifiedMrdSection = `- path: artifacts/mrd.md\n\n${fs.readFileSync(legacyMrdPath, 'utf-8').slice(0, 30000)}`;
    }
  }

  const boundariesPath = path.join(paths.artifactsDir, 'implementation-boundaries.md');
  let boundariesSection = '';
  let boundarySourceNote = '';
  if (fs.existsSync(boundariesPath)) {
    boundariesSection = `- path: artifacts/implementation-boundaries.md\n\n${fs.readFileSync(boundariesPath, 'utf-8').slice(0, 20000)}`;
  } else if (fs.existsSync(clarifiedMrdPath)) {
    const clarified = fs.readFileSync(clarifiedMrdPath, 'utf-8');
    boundarySourceNote = '- 未找到 artifacts/implementation-boundaries.md，边界内容来自 artifacts/mrd-clarified.md。';
    boundariesSection = [
      extractSection(clarified, '## Project Ownership'),
      extractSection(clarified, '## Implementation Boundaries'),
      extractSection(clarified, '## Clarified Decisions'),
    ].filter(Boolean).join('\n\n').slice(0, 20000);
  } else {
    boundariesSection = '（未找到独立边界文件，且无法从澄清 MRD 提取边界）';
  }

  const customPromptPath = path.join(paths.inputDir, 'custom-prompt.md');
  let customPromptSection = '（无）';
  if (fs.existsSync(customPromptPath)) {
    customPromptSection = `- path: input/custom-prompt.md\n\n${fs.readFileSync(customPromptPath, 'utf-8').slice(0, 12000)}`;
  }

  return renderPromptTemplate(loadPromptFile('implementation-plan-user.md'), {
    node_name: node.name,
    node_description: node.description,
    feedback_text: feedbackText,
    clarified_mrd_section: clarifiedMrdSection,
    boundary_source_note: boundarySourceNote,
    boundaries_section: boundariesSection,
    custom_prompt_section: customPromptSection,
    project_manifest_json: JSON.stringify(manifest, null, 2),
    project_dir: paths.projectDir,
    artifacts_dir: paths.artifactsDir,
  });
}

export function buildSpecGeneratePrompt(
  node: PipelineNode,
  paths: ReturnType<typeof getRunPaths>,
  manifest: ProjectManifest,
  feedbackText = '（无）',
): string {
  const implementationManifestPath = path.join(paths.artifactsDir, 'implementation-plan-manifest.json');
  let implementationManifestSection = '（未找到 artifacts/implementation-plan-manifest.json）';
  if (fs.existsSync(implementationManifestPath)) {
    implementationManifestSection = `- path: artifacts/implementation-plan-manifest.json\n\n\`\`\`json\n${fs.readFileSync(implementationManifestPath, 'utf-8').slice(0, 16000)}\n\`\`\``;
  }

  const clarifiedMrdPath = path.join(paths.artifactsDir, 'mrd-clarified.md');
  let clarifiedMrdSection = '（未找到 artifacts/mrd-clarified.md）';
  if (fs.existsSync(clarifiedMrdPath)) {
    clarifiedMrdSection = `- path: artifacts/mrd-clarified.md\n\n${fs.readFileSync(clarifiedMrdPath, 'utf-8').slice(0, 16000)}`;
  }
  const prdPath = path.join(paths.artifactsDir, 'prd.md');
  const prdSection = fs.existsSync(prdPath)
    ? `- path: artifacts/prd.md\n- role: optional legacy compatibility context\n\n${fs.readFileSync(prdPath, 'utf-8').slice(0, 30000)}`
    : clarifiedMrdSection;

  return renderPromptTemplate(loadPromptFile('spec-generate-user.md'), {
    node_name: node.name,
    node_description: node.description,
    feedback_text: feedbackText,
    implementation_manifest_section: implementationManifestSection,
    prd_section: prdSection,
    clarified_mrd_section: clarifiedMrdSection,
    project_manifest_json: JSON.stringify(manifest, null, 2),
  });
}

export function buildStagePrompt(
  node: PipelineNode,
  paths: ReturnType<typeof getRunPaths>,
  options: { feedback?: string; attempt?: number } = {},
): string {
  const parts: string[] = [];

  parts.push(`## Task: ${node.name}\n${node.description}\n`);

  if (options.feedback) {
    parts.push(`\n## 用户反馈（上一轮被退回，请根据以下反馈修改产物）\n${options.feedback}\n`);
  }

  if (options.attempt !== undefined && options.attempt > 0) {
    parts.push(`\n## Retry Context\nThis is attempt ${options.attempt + 1}. Previous attempt had issues. Please read error output carefully and fix problems.\n`);
  }

  const clarifiedMrdPath = path.join(paths.artifactsDir, 'mrd-clarified.md');
  const mrdPath = path.join(paths.artifactsDir, 'mrd.md');
  const preferredMrdPath = node.id !== 'mrd-render' && node.id !== 'mrd-clarify' && fs.existsSync(clarifiedMrdPath)
    ? clarifiedMrdPath
    : mrdPath;
  if (fs.existsSync(preferredMrdPath)) {
    parts.push(`\n## MRD\n${fs.readFileSync(preferredMrdPath, 'utf-8').slice(0, 10000)}\n`);
  } else if (fs.existsSync(paths.inputDir)) {
    for (const file of fs.readdirSync(paths.inputDir)) {
      if (file.endsWith('.md') || file.endsWith('.txt')) {
        parts.push(`\n## Input: ${file}\n${fs.readFileSync(path.join(paths.inputDir, file), 'utf-8').slice(0, 8000)}\n`);
      }
    }
  }

  const customPromptPath = path.join(paths.inputDir, 'custom-prompt.md');
  if (fs.existsSync(customPromptPath)) {
    parts.push(`\n## User Custom Prompt\n${fs.readFileSync(customPromptPath, 'utf-8').slice(0, 8000)}\n`);
  }

  const prdPath = path.join(paths.artifactsDir, 'prd.md');
  if (fs.existsSync(prdPath) && !['mrd-render', 'mrd-clarify', 'implementation-plan'].includes(node.id)) {
    parts.push(`\n## Legacy PRD Compatibility Context\n${fs.readFileSync(prdPath, 'utf-8').slice(0, 10000)}\n`);
  }

  if (['spec-generate', 'java-impl', 'java-review', 'testcode-generate', 'maven-test-runner', 'archive'].includes(node.id)) {
    for (const project of detectProjectRoots(paths.projectDir)) {
      const techPath = path.join(paths.artifactsDir, project.name, 'tech-design.md');
      if (fs.existsSync(techPath)) {
        parts.push(`\n## ${project.name} Technical Design\n${fs.readFileSync(techPath, 'utf-8').slice(0, 8000)}\n`);
      }
    }
  }

  if (['java-impl', 'java-review', 'testcode-generate', 'maven-test-runner', 'archive'].includes(node.id)) {
    for (const project of detectProjectRoots(paths.projectDir)) {
      const devSpecPath = path.join(paths.artifactsDir, project.name, 'openspec-task.md');
      if (fs.existsSync(devSpecPath)) {
        parts.push(`\n## ${project.name} OpenSpec Development Task List\n${fs.readFileSync(devSpecPath, 'utf-8').slice(0, 6000)}\n`);
      }
    }
  }
  if (['testcode-generate', 'maven-test-runner', 'archive'].includes(node.id)) {
    for (const project of detectProjectRoots(paths.projectDir)) {
      const testSpecPath = path.join(paths.artifactsDir, project.name, 'openspec-test-task.md');
      if (fs.existsSync(testSpecPath)) {
        parts.push(`\n## ${project.name} OpenSpec Test Task List\n${fs.readFileSync(testSpecPath, 'utf-8').slice(0, 6000)}\n`);
      }
    }
    const legacyTestSpecPath = path.join(paths.artifactsDir, 'test_spec.md');
    if (fs.existsSync(legacyTestSpecPath)) {
      parts.push(`\n## Test Specification\n${fs.readFileSync(legacyTestSpecPath, 'utf-8').slice(0, 8000)}\n`);
    }
  }

  if (['testcode-generate', 'maven-test-runner', 'archive'].includes(node.id)) {
    for (const project of detectProjectRoots(paths.projectDir)) {
      const reviewPath = path.join(paths.artifactsDir, project.name, 'code-review.md');
      if (fs.existsSync(reviewPath)) {
        parts.push(`\n## ${project.name} Review Report\n${fs.readFileSync(reviewPath, 'utf-8').slice(0, 5000)}\n`);
      }
    }
  }

  if (node.id === 'java-impl') {
    parts.push(`\n## Current Project Structure\n${listProjectFiles(paths.projectDir, 3)}\n`);
    const pomPath = path.join(paths.projectDir, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      parts.push(`\n## pom.xml\n${fs.readFileSync(pomPath, 'utf-8').slice(0, 5000)}\n`);
    }
  }

  parts.push(`\n## Project Directory\nAll work must be done in: ${paths.projectDir}\nArtifacts go to: ${paths.artifactsDir}\n`);

  return parts.join('\n');
}

export function buildProjectStagePromptVariables(
  paths: ReturnType<typeof getRunPaths>,
  project: { name: string; root: string }
): Record<string, string> {
  return {
    project_name: project.name,
    project_root: project.root,
    artifacts_dir: paths.artifactsDir,
    run_dir: paths.runDir,
    changed_files_manifest_path: path.join(paths.artifactsDir, project.name, 'changed-files.json'),
    code_preview_manifest_path: path.join(paths.artifactsDir, project.name, 'code-preview-manifest.json'),
    changed_files_preview_dir: path.join(paths.artifactsDir, project.name, 'changed-files'),
    test_code_preview_manifest_path: path.join(paths.artifactsDir, project.name, 'test-code-preview-manifest.json'),
    changed_test_files_preview_dir: path.join(paths.artifactsDir, project.name, 'changed-test-files'),
    mrd_clarified: readArtifactForPrompt(paths, 'mrd-clarified.md', 30000),
    proposal: readArtifactForPrompt(paths, 'mrd-clarified.md', 30000),
    requirement_ownership: readArtifactForPrompt(paths, 'requirement-ownership.json', 16000),
    legacy_prd: readArtifactForPrompt(paths, 'prd.md', 24000),
    prd: readArtifactForPrompt(paths, 'prd.md', 24000) || readArtifactForPrompt(paths, 'mrd-clarified.md', 24000),
    implementation_manifest: readArtifactForPrompt(paths, 'implementation-plan-manifest.json', 12000),
    spec_manifest: readArtifactForPrompt(paths, 'spec-manifest.json', 12000),
    openspec_change_context: readProjectOpenSpecContext(paths, path.basename(paths.runDir), project.name, 24000),
    tech_design: readArtifactForPrompt(paths, `${project.name}/tech-design.md`, 26000),
    openspec_task: readArtifactForPrompt(paths, `${project.name}/openspec-task.md`, 24000),
    openspec_test_task: readArtifactForPrompt(paths, `${project.name}/openspec-test-task.md`, 24000),
    changed_files: readArtifactForPrompt(paths, `${project.name}/changed-files.json`, 12000),
    code_preview_manifest: readArtifactForPrompt(paths, `${project.name}/code-preview-manifest.json`, 12000),
    review_report: readArtifactForPrompt(paths, `${project.name}/code-review.md`, 16000),
    review_findings: readArtifactForPrompt(paths, `${project.name}/review-findings.json`, 12000),
    test_file_list: readArtifactForPrompt(paths, `${project.name}/test-file-list.md`, 12000),
    test_report: readArtifactForPrompt(paths, `${project.name}/test-report.md`, 16000),
    archive_execution_metrics: buildArchiveExecutionMetrics(paths, project.name),
    project_context: buildProjectImplementationContext(project.root),
  };
}

export function buildArchiveExecutionMetrics(
  paths: ReturnType<typeof getRunPaths>,
  projectName: string
): string {
  const state = readJson(paths.executionState) as {
    nodes?: Array<{
      id: string;
      name: string;
      status: string;
      startedAt?: number;
      completedAt?: number;
      failureCount?: number;
    }>;
  } | undefined;
  const events = readEvents(paths.eventsLog);
  const agents = readAgents(paths.agentsDir);

  const nodeToolStats = summarizeToolEvents(events);
  const nodeAgentStats = summarizeAgents(agents, projectName);
  const rows = (state?.nodes ?? []).map(node => {
    const tools = nodeToolStats.get(node.id) ?? emptyToolStats();
    const agentStats = nodeAgentStats.get(node.id) ?? emptyAgentStats();
    return `| ${[
      node.name || node.id,
      node.status,
      formatDurationMs(durationMs(node.startedAt, node.completedAt)),
      String(node.failureCount ?? 0),
      String(agentStats.agentCount),
      String(tools.totalCalls),
      formatDurationMs(tools.totalDurationMs),
      String(tools.errorCalls),
      String(agentStats.inputTokens),
      String(agentStats.outputTokens),
      String(agentStats.totalTokens),
    ].join(' | ')} |`;
  });

  const totalTools = Array.from(nodeToolStats.values()).reduce((sum, item) => sum + item.totalCalls, 0);
  const totalToolDuration = Array.from(nodeToolStats.values()).reduce((sum, item) => sum + item.totalDurationMs, 0);
  const totalInputTokens = Array.from(nodeAgentStats.values()).reduce((sum, item) => sum + item.inputTokens, 0);
  const totalOutputTokens = Array.from(nodeAgentStats.values()).reduce((sum, item) => sum + item.outputTokens, 0);

  return [
    '## 流水线执行指标',
    '',
    `- Run ID：${path.basename(paths.runDir)}`,
    `- 项目：${projectName}`,
    `- 节点数量：${state?.nodes?.length ?? 0}`,
    `- 工具调用总数：${totalTools}`,
    `- 工具调用累计耗时：${formatDurationMs(totalToolDuration)}`,
    `- Token 消耗：输入 ${totalInputTokens} / 输出 ${totalOutputTokens} / 合计 ${totalInputTokens + totalOutputTokens}`,
    '',
    '| 节点 | 状态 | 节点耗时 | 失败/重试次数 | Agent 数 | 工具调用次数 | 工具累计耗时 | 工具失败次数 | 输入 Token | 输出 Token | Token 合计 |',
    '|------|------|----------|---------------|---------|--------------|--------------|--------------|------------|------------|------------|',
    ...(rows.length ? rows : ['| 未采集 | 未采集 | 未采集 | 0 | 0 | 0 | 未采集 | 0 | 0 | 0 | 0 |']),
    '',
    '### 工具耗时明细',
    '',
    '| 节点 | 工具 | 调用次数 | 累计耗时 | 失败次数 |',
    '|------|------|----------|----------|----------|',
    ...buildToolDetailRows(nodeToolStats),
  ].join('\n');
}

function readEvents(eventsLog: string): Array<Record<string, any>> {
  if (!fs.existsSync(eventsLog)) return [];
  return fs.readFileSync(eventsLog, 'utf-8')
    .split('\n')
    .filter(Boolean)
    .map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readAgents(agentsDir: string): Array<Record<string, any>> {
  if (!fs.existsSync(agentsDir)) return [];
  return fs.readdirSync(agentsDir)
    .filter(file => file.endsWith('.json') && !file.endsWith('.plan.json'))
    .map(file => readJson(path.join(agentsDir, file)))
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object');
}

function readJson(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return undefined;
  }
}

interface ToolStats {
  totalCalls: number;
  totalDurationMs: number;
  errorCalls: number;
  byTool: Map<string, { calls: number; durationMs: number; errors: number }>;
}

interface AgentStats {
  agentCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function summarizeToolEvents(events: Array<Record<string, any>>): Map<string, ToolStats> {
  const starts = new Map<string, { nodeId: string; toolName: string; timestamp: number }>();
  const stats = new Map<string, ToolStats>();
  for (const event of events) {
    const data = event.data ?? {};
    const toolUseId = String(data.toolUseId ?? '');
    if (!toolUseId) continue;
    const nodeId = String(event.nodeId ?? data.nodeId ?? 'unknown');
    const toolName = String(data.toolName ?? 'unknown');
    if (event.type === 'tool_start') {
      starts.set(toolUseId, { nodeId, toolName, timestamp: Number(event.timestamp ?? 0) });
    }
    if (event.type === 'tool_end' || event.type === 'tool_error') {
      const start = starts.get(toolUseId);
      const targetNodeId = start?.nodeId ?? nodeId;
      const targetToolName = start?.toolName ?? toolName;
      const duration = start ? Math.max(0, Number(event.timestamp ?? 0) - start.timestamp) : 0;
      const nodeStats = ensureToolStats(stats, targetNodeId);
      nodeStats.totalCalls += 1;
      nodeStats.totalDurationMs += duration;
      if (event.type === 'tool_error' || data.isError === true) nodeStats.errorCalls += 1;
      const toolStats = nodeStats.byTool.get(targetToolName) ?? { calls: 0, durationMs: 0, errors: 0 };
      toolStats.calls += 1;
      toolStats.durationMs += duration;
      if (event.type === 'tool_error' || data.isError === true) toolStats.errors += 1;
      nodeStats.byTool.set(targetToolName, toolStats);
    }
  }
  return stats;
}

function summarizeAgents(agents: Array<Record<string, any>>, projectName: string): Map<string, AgentStats> {
  const stats = new Map<string, AgentStats>();
  for (const agent of agents) {
    if (agent.projectName && agent.projectName !== projectName) continue;
    const nodeId = String(agent.nodeId ?? 'unknown');
    const item = stats.get(nodeId) ?? emptyAgentStats();
    item.agentCount += 1;
    item.inputTokens += Number(agent.tokenUsage?.input ?? 0);
    item.outputTokens += Number(agent.tokenUsage?.output ?? 0);
    item.totalTokens = item.inputTokens + item.outputTokens;
    stats.set(nodeId, item);
  }
  return stats;
}

function ensureToolStats(stats: Map<string, ToolStats>, nodeId: string): ToolStats {
  const existing = stats.get(nodeId);
  if (existing) return existing;
  const next = emptyToolStats();
  stats.set(nodeId, next);
  return next;
}

function emptyToolStats(): ToolStats {
  return { totalCalls: 0, totalDurationMs: 0, errorCalls: 0, byTool: new Map() };
}

function emptyAgentStats(): AgentStats {
  return { agentCount: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function buildToolDetailRows(nodeToolStats: Map<string, ToolStats>): string[] {
  const rows: string[] = [];
  for (const [nodeId, stats] of nodeToolStats.entries()) {
    for (const [toolName, toolStats] of stats.byTool.entries()) {
      rows.push(`| ${nodeId} | ${toolName} | ${toolStats.calls} | ${formatDurationMs(toolStats.durationMs)} | ${toolStats.errors} |`);
    }
  }
  return rows.length ? rows : ['| 未采集 | 未采集 | 0 | 未采集 | 0 |'];
}

function durationMs(startedAt?: number, completedAt?: number): number | undefined {
  if (!startedAt) return undefined;
  return Math.max(0, (completedAt ?? Date.now()) - startedAt);
}

function formatDurationMs(ms?: number): string {
  if (ms === undefined) return '未采集';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}m ${rest}s`;
}

function readArtifactForPrompt(
  paths: ReturnType<typeof getRunPaths>,
  relativePath: string,
  maxChars: number
): string {
  const artifactPath = path.join(paths.artifactsDir, relativePath);
  if (!fs.existsSync(artifactPath)) return `（未找到 artifacts/${relativePath}）`;
  try {
    const content = fs.readFileSync(artifactPath, 'utf-8');
    return content.slice(0, maxChars) + (content.length > maxChars ? '\n...（已截断）' : '');
  } catch {
    return `（无法读取 artifacts/${relativePath}）`;
  }
}

function buildProjectImplementationContext(projectRoot: string): string {
  const parts: string[] = [];
  parts.push(`### Project Structure\n${listProjectFiles(projectRoot, 5) || '（项目目录为空或不可读）'}`);

  const sampleFiles = collectProjectSampleFiles(projectRoot, 18);
  if (!sampleFiles.length) return parts.join('\n\n');

  parts.push('### Key File Excerpts');
  let total = 0;
  for (const filePath of sampleFiles) {
    if (total >= 36000) break;
    const rel = path.relative(projectRoot, filePath);
    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch {
      continue;
    }
    const excerpt = content.slice(0, Math.min(3500, 36000 - total));
    total += excerpt.length;
    parts.push([
      `#### ${rel}`,
      '```',
      excerpt,
      content.length > excerpt.length ? '\n...（已截断）' : '',
      '```',
    ].join('\n'));
  }

  return parts.join('\n\n');
}

function collectProjectSampleFiles(projectRoot: string, limit: number): string[] {
  const preferred: string[] = [];
  const others: string[] = [];
  const ignored = new Set(['target', 'node_modules', '.git', '.idea']);
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || preferred.length + others.length >= limit * 3) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || ignored.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const rel = path.relative(projectRoot, fullPath);
      if (!/\.(java|kt|xml|yml|yaml|properties|gradle|md|sql)$/i.test(entry.name)) continue;
      if (/pom\.xml$|build\.gradle|src\/main\/|src\\main\\|application\.(yml|yaml|properties)$/i.test(rel)) {
        preferred.push(fullPath);
      } else {
        others.push(fullPath);
      }
    }
  };
  walk(projectRoot, 0);
  return [...preferred, ...others].slice(0, limit);
}
