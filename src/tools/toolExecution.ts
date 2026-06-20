/**
 * Tool execution chain:
 * parse input -> validateInput -> PreToolUse hooks -> permission check ->
 * execute tool -> truncate visible output -> persist full output ->
 * PostToolUse hooks -> return tool_result
 */
import * as fs from 'fs';
import * as path from 'path';
import { nanoid } from 'nanoid';
import { Tool, ToolContext, ToolResult, ToolRegistry } from './base.js';
import { runPreToolUseHooks, runPostToolUseHooks } from './security/hooks.js';
import { validatePath, validateCwd, AccessType } from './security/pathValidator.js';
import { getEventLog } from '../events/EventLog.js';
import { getConfig } from '../config/index.js';
import { getStateStore } from '../persistence/stateStore.js';

export interface ToolExecutionOptions {
  toolName: string;
  toolInput: unknown;
  context: ToolContext;
  registry: ToolRegistry;
}

interface WrittenArtifact {
  nodeId: string;
  artifactPath: string;
  size: number;
  description?: string;
}

/**
 * Execute a tool through the full security chain.
 * This is the main entry point for tool execution from the agent loop.
 */
export async function executeToolChain(opts: ToolExecutionOptions): Promise<ToolResult> {
  const { toolName, toolInput, context, registry } = opts;
  const toolUseId = nanoid();
  const eventLog = getEventLog(context.runId);
  const maxChars = getConfig().permissions.maxOutputChars;

  // 1. Find tool
  const tool = registry.get(toolName);
  if (!tool) {
    return { toolUseId, content: `Unknown tool: ${toolName}`, isError: true };
  }

  // 2. Validate input via Zod schema
  const parsed = tool.definition.inputSchema.safeParse(toolInput);
  if (!parsed.success) {
    const msg = `Invalid input for ${toolName}: ${parsed.error.message}`;
    eventLog.logEvent('tool_error', { toolName, toolUseId, error: msg, nodeId: context.nodeId }, context.agentRunId, context.nodeId);
    return { toolUseId, content: msg, isError: true };
  }
  let validatedInput = parsed.data;

  // 3. Path security check for file tools
  const pathCheck = validateToolPaths(toolName, validatedInput, context);
  if (!pathCheck.valid) {
    eventLog.logEvent('tool_error', { toolName, toolUseId, error: pathCheck.reason, nodeId: context.nodeId }, context.agentRunId, context.nodeId);
    return { toolUseId, content: pathCheck.reason!, isError: true };
  }

  // 4. PreToolUse hooks
  const preResult = await runPreToolUseHooks({
    toolName,
    input: validatedInput,
    runId: context.runId,
  });
  if (!preResult.allow) {
    const msg = `Tool ${toolName} blocked by hook: ${preResult.additionalContext.join('; ')}`;
    eventLog.logEvent('tool_error', { toolName, toolUseId, error: msg, nodeId: context.nodeId }, context.agentRunId, context.nodeId);
    return { toolUseId, content: msg, isError: true };
  }
  validatedInput = preResult.input;
  const hookContext = preResult.additionalContext.join('\n');

  // 5. Permission check
  eventLog.logEvent('tool_start', {
    toolName,
    toolUseId,
    nodeId: context.nodeId,
    input: sanitizeInputForLog(validatedInput),
    isReadOnly: tool.definition.isReadOnly,
  }, context.agentRunId, context.nodeId);

  const permDecision = await context.canUseTool(toolName, validatedInput);
  if (permDecision === 'deny') {
    const msg = `Permission denied for tool: ${toolName}`;
    eventLog.logEvent('tool_error', { toolName, toolUseId, error: msg, nodeId: context.nodeId }, context.agentRunId, context.nodeId);
    return { toolUseId, content: msg, isError: true };
  }

  if (permDecision === 'ask') {
    // Return a special result that tells the agent we're waiting for confirmation
    return {
      toolUseId,
      content: `Waiting for user confirmation to execute ${toolName}...`,
      isError: false,
    };
  }

  // 6. Execute tool
  let output: string;
  let isError = false;
  let artifacts: WrittenArtifact[] = [];
  try {
    const result = await tool.execute(validatedInput, context);
    output = result.content;
    isError = result.isError ?? false;
    artifacts = result.artifacts ?? [];
    if (hookContext) {
      output = hookContext + '\n' + output;
    }
  } catch (err) {
    output = `Tool ${toolName} error: ${(err as Error).message}`;
    isError = true;
  }

  // 7. Persist full output to logs directory
  const fullOutputPath = path.join(context.runId ? getLogDir(context.runId) : '/tmp', `tool-${toolUseId}.log`);
  try {
    fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
    fs.writeFileSync(fullOutputPath, output);
  } catch {
    // ignore persistence errors
  }

  // 8. Truncate visible output for context
  let visibleOutput = output;
  const outputTruncated = output.length > maxChars;
  if (outputTruncated) {
    visibleOutput = output.slice(0, maxChars) + `\n... (output truncated, ${output.length} chars total, full output at logs/tool-${toolUseId}.log)`;
  }

  // 9. PostToolUse hooks
  const postResult = await runPostToolUseHooks({
    toolName,
    input: validatedInput,
    output: visibleOutput,
    isError,
    runId: context.runId,
  });
  visibleOutput = postResult.output;
  if (postResult.additionalContext.length) {
    visibleOutput += '\n' + postResult.additionalContext.join('\n');
  }

  if (!isError) {
    artifacts.push(...recordArtifactsForFileWrite(toolName, validatedInput, context));
  }

  // 10. Emit tool_end event
  eventLog.logEvent('tool_end', {
    toolName,
    toolUseId,
    nodeId: context.nodeId,
    outputTruncated,
    outputLength: output.length,
    isError,
  }, context.agentRunId, context.nodeId);

  return { toolUseId, content: visibleOutput, isError, artifacts };
}

function validateToolPaths(
  toolName: string,
  input: any,
  ctx: ToolContext
): { valid: boolean; reason?: string } {
  const pathCtx = {
    runDir: ctx.runDir,
    projectDir: ctx.projectDir,
    artifactsDir: ctx.artifactsDir,
  };

  // File path tools
  if (['read_file', 'write_file', 'edit_file'].includes(toolName)) {
    const filePath = input.file_path ?? input.path;
    if (filePath) {
      const accessType: AccessType = toolName === 'read_file' ? 'read' : 'write';
      const result = validatePath(resolveToolFilePath(String(filePath), accessType, ctx), accessType, pathCtx);
      if (!result.valid) return result;
    }
  }

  // Grep/Glob paths
  if (['grep', 'glob'].includes(toolName)) {
    const searchPath = input.path ?? input.cwd ?? ctx.projectDir;
    if (searchPath) {
      const result = validatePath(resolveToolSearchPath(String(searchPath), ctx), 'read', pathCtx);
      if (!result.valid) return result;
    }
  }

  // Bash cwd check
  if (toolName === 'bash' || toolName.startsWith('maven_') || toolName.startsWith('jdk_')) {
    const cwd = input.cwd ?? ctx.cwd;
    const cwdResult = validateCwd(cwd, ctx.projectDir);
    if (!cwdResult.valid) return cwdResult;
  }

  return { valid: true };
}

function resolveToolFilePath(filePath: string, accessType: AccessType, ctx: ToolContext): string {
  if (path.isAbsolute(filePath)) return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized === 'artifacts' || normalized.startsWith('artifacts/')) {
    return path.join(ctx.artifactsDir, normalized.replace(/^artifacts\/?/, ''));
  }
  if (normalized === 'input' || normalized.startsWith('input/') || normalized === 'workspace' || normalized.startsWith('workspace/')) {
    return path.join(ctx.runDir, normalized);
  }
  if (accessType === 'write' || accessType === 'read') {
    return path.join(ctx.projectDir, filePath);
  }
  return filePath;
}

function resolveToolSearchPath(searchPath: string, ctx: ToolContext): string {
  if (path.isAbsolute(searchPath)) return searchPath;
  const normalized = searchPath.replace(/\\/g, '/');
  if (normalized === 'artifacts' || normalized.startsWith('artifacts/')) {
    return path.join(ctx.artifactsDir, normalized.replace(/^artifacts\/?/, ''));
  }
  if (normalized === 'input' || normalized.startsWith('input/') || normalized === 'workspace' || normalized.startsWith('workspace/')) {
    return path.join(ctx.runDir, normalized);
  }
  return path.join(ctx.projectDir, searchPath);
}

function recordArtifactsForFileWrite(
  toolName: string,
  input: any,
  ctx: ToolContext
): WrittenArtifact[] {
  if (!['write_file', 'edit_file'].includes(toolName)) return [];
  const filePath = input.file_path ?? input.path;
  if (!filePath || !ctx.nodeId) return [];

  const writtenPath = path.resolve(resolveToolFilePath(String(filePath), 'write', ctx));
  const artifacts: WrittenArtifact[] = [];

  const directArtifact = artifactForExistingFile(ctx, writtenPath, '工具写入产物');
  if (directArtifact) artifacts.push(directArtifact);

  const previewArtifacts = createLiveProjectPreviewArtifacts(ctx, writtenPath);
  artifacts.push(...previewArtifacts);

  for (const artifact of artifacts) {
    persistLiveArtifact(ctx, artifact);
  }
  return artifacts;
}

function artifactForExistingFile(
  ctx: ToolContext,
  filePath: string,
  description: string
): WrittenArtifact | undefined {
  if (!ctx.nodeId) return undefined;
  if (!isInside(filePath, ctx.artifactsDir)) return undefined;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return undefined;
  const rel = path.relative(ctx.artifactsDir, filePath).replace(/\\/g, '/');
  return {
    nodeId: ctx.nodeId,
    artifactPath: `artifacts/${rel}`,
    size: fs.statSync(filePath).size,
    description,
  };
}

function createLiveProjectPreviewArtifacts(ctx: ToolContext, writtenPath: string): WrittenArtifact[] {
  if (!ctx.nodeId || !isInside(writtenPath, ctx.projectDir)) return [];
  if (!fs.existsSync(writtenPath) || !fs.statSync(writtenPath).isFile()) return [];

  const relSource = path.relative(ctx.projectDir, writtenPath).replace(/\\/g, '/');
  const projectName = ctx.projectName || path.basename(ctx.projectDir) || 'project';
  const isJavaImpl = ctx.nodeId === 'java-impl' && JAVA_MAIN_LIVE_PATTERN.test(relSource);
  const isTestImpl = ctx.nodeId === 'testcode-generate' && JAVA_TEST_LIVE_PATTERN.test(relSource);
  if (!isJavaImpl && !isTestImpl) return [];

  const previewDirName = isJavaImpl ? 'changed-files' : 'changed-test-files';
  const previewRel = `${projectName}/${previewDirName}/${safeLivePreviewFileName(relSource)}`;
  const previewAbs = path.join(ctx.artifactsDir, previewRel);
  fs.mkdirSync(path.dirname(previewAbs), { recursive: true });
  fs.copyFileSync(writtenPath, previewAbs);

  const previewArtifact: WrittenArtifact = {
    nodeId: ctx.nodeId,
    artifactPath: `artifacts/${previewRel}`,
    size: fs.statSync(previewAbs).size,
    description: isJavaImpl ? 'Java 实现代码预览快照' : '测试代码预览快照',
  };

  const indexArtifact = isJavaImpl
    ? updateLiveChangedFilesIndex(ctx, projectName, relSource, previewArtifact.artifactPath, fs.statSync(writtenPath).size)
    : updateLiveTestFileIndex(ctx, projectName, relSource);

  return [previewArtifact, ...(indexArtifact ? [indexArtifact] : [])];
}

function updateLiveChangedFilesIndex(
  ctx: ToolContext,
  projectName: string,
  sourcePath: string,
  previewArtifactPath: string,
  size: number
): WrittenArtifact | undefined {
  if (!ctx.nodeId) return undefined;
  const rel = `${projectName}/changed-files.json`;
  const abs = path.join(ctx.artifactsDir, rel);
  const existing = readJsonFile(abs) as { changedFiles?: Array<Record<string, unknown>> } | undefined;
  const changedFiles = Array.isArray(existing?.changedFiles) ? existing!.changedFiles! : [];
  const nextFile = {
    path: sourcePath,
    status: 'modified',
    size,
    previewArtifact: previewArtifactPath,
    absolutePreviewArtifact: path.join(ctx.artifactsDir, previewArtifactPath.replace(/^artifacts\//, '')),
  };
  const filtered = changedFiles.filter(file => file.path !== sourcePath);
  const manifest = {
    project: projectName,
    generatedAt: new Date().toISOString(),
    live: true,
    changedFiles: [...filtered, nextFile].sort((a, b) => String(a.path).localeCompare(String(b.path))),
  };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(manifest, null, 2), 'utf-8');
  return {
    nodeId: ctx.nodeId,
    artifactPath: `artifacts/${rel}`,
    size: fs.statSync(abs).size,
    description: 'Java 实现变更文件清单',
  };
}

function updateLiveTestFileIndex(
  ctx: ToolContext,
  projectName: string,
  sourcePath: string
): WrittenArtifact | undefined {
  if (!ctx.nodeId) return undefined;
  const rel = `${projectName}/test-file-list.md`;
  const abs = path.join(ctx.artifactsDir, rel);
  const existing = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : `# ${projectName} 测试文件清单\n\n`;
  const line = `- ${sourcePath}`;
  const content = existing.includes(line) ? existing : `${existing.trimEnd()}\n${line}\n`;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
  return {
    nodeId: ctx.nodeId,
    artifactPath: `artifacts/${rel}`,
    size: fs.statSync(abs).size,
    description: '测试文件清单',
  };
}

function persistLiveArtifact(ctx: ToolContext, artifact: WrittenArtifact): void {
  const eventLog = getEventLog(ctx.runId);
  eventLog.logEvent('artifact_written', { ...artifact }, ctx.agentRunId, ctx.nodeId);
  try {
    const store = getStateStore(ctx.runId);
    const state = store.loadExecutionState();
    if (!state || !artifact.nodeId) return;
    state.artifactIndex = state.artifactIndex ?? {};
    const existing = state.artifactIndex[artifact.nodeId] ?? [];
    if (!existing.includes(artifact.artifactPath)) {
      state.artifactIndex[artifact.nodeId] = [...existing, artifact.artifactPath];
    }
    const node = state.nodes.find(item => item.id === artifact.nodeId);
    if (node) {
      node.outputArtifacts = node.outputArtifacts ?? [];
      if (!node.outputArtifacts.includes(artifact.artifactPath)) {
        node.outputArtifacts.push(artifact.artifactPath);
      }
    }
    store.saveExecutionState(state);
  } catch {
    // Live artifact indexing should never fail the tool call itself.
  }
}

function readJsonFile(filePath: string): unknown {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return undefined;
  }
}

function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function safeLivePreviewFileName(relPath: string): string {
  const base = path.basename(relPath);
  return base || relPath.replace(/[\\/]/g, '__');
}

const JAVA_MAIN_LIVE_PATTERN = /(^pom\.xml$|^src\/main\/.*\.(java|xml|yml|yaml|properties)$)/;
const JAVA_TEST_LIVE_PATTERN = /(^pom\.xml$|^src\/test\/.*\.(java|xml|yml|yaml|properties)$)/;

function sanitizeInputForLog(input: unknown): unknown {
  if (typeof input === 'object' && input !== null) {
    const obj = input as Record<string, unknown>;
    if (typeof obj.content === 'string' && obj.content.length > 200) {
      return { ...obj, content: obj.content.slice(0, 200) + '...' };
    }
  }
  return input;
}

function getLogDir(runId: string): string {
  return path.join(getConfig().runtimeDir, 'runs', runId, 'logs');
}
