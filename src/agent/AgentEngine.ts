/**
 * AgentEngine - ReAct loop for autonomous agents.
 * Core loop: while(true) { call LLM -> parse tool_use -> execute tools -> feed results }
 *
 * Features:
 * - Streaming LLM calls
 * - Read tools concurrent, write tools serial
 * - Permission checks on every tool call
 * - Auto context compression when approaching token limits
 * - Plan mode integration
 * - Cancellation support
 * - Event emission for UI
 */
import { nanoid } from 'nanoid';
import {
  LLMProvider, LLMMessage, LLMContentBlock, ToolDefinition, LLMStreamEvent,
} from '../models/providers.js';
import { ToolRegistry, ToolContext, ToolResult, PermissionDecision } from '../tools/base.js';
import { executeToolChain } from '../tools/toolExecution.js';
import { estimateTokens, estimateTotalTokens, TokenBudget } from './tokens.js';
import { compactContext } from './contextCompression.js';
import { getEventLog } from '../events/EventLog.js';
import { getStateStore, AgentState, AgentStatus } from '../persistence/stateStore.js';
import { getPermissionManager } from '../tools/security/permissions.js';
import { RegisteredModel } from '../models/registry.js';
import { generatePlan, confirmPlan } from './planMode.js';
import { PlanState } from '../persistence/stateStore.js';

export interface AgentEngineConfig {
  runId: string;
  agentRunId: string;
  nodeId: string;
  provider: LLMProvider;
  model: RegisteredModel;
  registry: ToolRegistry;
  systemPrompt: string;
  maxTurns?: number;
  cwd: string;
  projectDir: string;
  artifactsDir: string;
  runDir: string;
  enablePlanMode?: boolean;
  planGoal?: string;
  projectName?: string;
  inputArtifacts?: string[];
  outputArtifacts?: string[];
  taskDescription?: string;
  requireToolUse?: boolean;
  getProgressChecklist?: () => string | undefined;
  progressChecklistLabel?: string;
}

export type AgentEvent =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use_start'; toolUseId: string; name: string; input: unknown }
  | { type: 'tool_use_end'; toolUseId: string; name: string; result: string; isError: boolean }
  | { type: 'turn_start'; turn: number }
  | { type: 'turn_end'; turn: number }
  | { type: 'plan_generated'; plan: PlanState }
  | { type: 'waiting_confirmation'; requestId: string; toolName: string; input: unknown }
  | { type: 'compact'; tokensBefore: number; tokensAfter: number }
  | { type: 'artifact_written'; nodeId: string; artifactPath: string; size: number; description?: string }
  | { type: 'error'; message: string }
  | { type: 'completed'; finalText: string }
  | { type: 'model_switched'; fromModel: string; toModel: string; reason: string };

export class AgentEngine {
  private messages: LLMMessage[] = [];
  private config: AgentEngineConfig;
  private aborted = false;
  private running = false;
  private state: AgentState;
  private budget: TokenBudget;
  private confirmedPlan = false;

  constructor(config: AgentEngineConfig) {
    this.config = config;
    this.budget = new TokenBudget(
      config.model.contextWindow,
      0.8, // compact at 80%
      0.3, // target 30% after compact
    );
    this.state = this.initAgentState();
    this.saveState();
  }

  private initAgentState(): AgentState {
    return {
      agentRunId: this.config.agentRunId,
      runId: this.config.runId,
      nodeId: this.config.nodeId,
      projectName: this.config.projectName,
      projectRoot: this.config.projectDir,
      taskDescription: this.config.taskDescription,
      status: 'created',
      currentModelId: this.config.model.id,
      currentProviderId: this.config.model.providerId,
      intelligenceLevel: this.config.model.intelligenceLevel,
      modelSwitchHistory: [],
      turnCount: 0,
      tokenUsage: { input: 0, output: 0 },
      compactCount: 0,
      toolCallCount: 0,
      inputArtifacts: this.config.inputArtifacts ?? defaultAgentInputArtifacts(this.config.nodeId, this.config.projectName),
      outputArtifacts: this.config.outputArtifacts ?? defaultAgentOutputArtifacts(this.config.nodeId, this.config.projectName),
      transcriptPath: 'logs/events.ndjson',
      planPath: this.config.enablePlanMode ? `agents/${this.config.agentRunId}.plan.json` : undefined,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  private saveState(): void {
    try {
      getStateStore(this.config.runId).saveAgentState(this.state);
    } catch { /* ignore persistence errors */ }
  }

  private recordEstimatedTokenUsage(inputTokens: number, contentBlocks: LLMContentBlock[]): void {
    const outputTokens = contentBlocks.reduce((sum, block) => {
      if (block.type === 'text') return sum + estimateTokens(block.text);
      if (block.type === 'thinking') return sum + estimateTokens(block.thinking);
      if (block.type === 'tool_use') return sum + estimateTokens(JSON.stringify(block.input)) + 20;
      return sum;
    }, 0);
    this.state.tokenUsage.input += inputTokens;
    this.state.tokenUsage.output += outputTokens;
    this.saveState();
  }

  private updateStatus(status: AgentStatus): void {
    this.state.status = status;
    this.saveState();
  }

  getAgentRunId(): string {
    return this.config.agentRunId;
  }

  getState(): AgentState {
    return { ...this.state };
  }

  abort(): void {
    this.aborted = true;
    this.updateStatus('cancelled');
  }

  switchModel(newModel: RegisteredModel, reason: string): void {
    const from = this.state.currentModelId;
    this.state.currentModelId = newModel.id;
    this.state.currentProviderId = newModel.providerId;
    this.state.intelligenceLevel = newModel.intelligenceLevel;
    this.state.modelSwitchHistory.push({
      fromModel: from,
      toModel: newModel.id,
      timestamp: Date.now(),
      reason,
    });
    this.budget = new TokenBudget(newModel.contextWindow, 0.8, 0.3);
    this.saveState();

    const eventLog = getEventLog(this.config.runId);
    eventLog.logEvent('model_switched', { fromModel: from, toModel: newModel.id, reason }, this.config.agentRunId);
  }

  confirmPlan(): void {
    this.confirmedPlan = true;
    confirmPlan(this.config.runId, this.config.agentRunId);
  }

  /**
   * Main execution loop. Yields events to the caller.
   */
  async *run(userPrompt: string): AsyncGenerator<AgentEvent> {
    if (this.running) throw new Error('Agent already running');
    this.running = true;
    this.updateStatus('waking');

    const eventLog = getEventLog(this.config.runId);
    eventLog.logEvent('agent_wakeup', { modelId: this.config.model.id }, this.config.agentRunId, this.config.nodeId);

    // ── Plan mode: generate plan first if enabled ──────────────────────
    if (this.config.enablePlanMode && !this.confirmedPlan) {
      this.updateStatus('running');
      eventLog.logEvent('agent_start', { modelId: this.config.model.id, planMode: true }, this.config.agentRunId, this.config.nodeId);

      try {
        const plan = await generatePlan({
          runId: this.config.runId,
          agentRunId: this.config.agentRunId,
          nodeId: this.config.nodeId,
          goal: userPrompt,
          provider: this.config.provider,
          modelId: this.config.model.id,
          cwd: this.config.projectDir,
        });
        this.state.plan = plan;
        this.saveState();
        yield { type: 'plan_generated', plan };
        // Wait for plan confirmation (suspend)
        this.updateStatus('waiting_confirmation');
        eventLog.logEvent('confirmation_waiting', {
          nodeId: this.config.nodeId,
          agentRunId: this.config.agentRunId,
          title: `Plan: ${plan.title}`,
          content: JSON.stringify(plan, null, 2),
        }, this.config.agentRunId, this.config.nodeId);
        this.running = false;
        return; // caller will resume after confirmation
      } catch (err) {
        yield { type: 'error', message: `Plan generation failed: ${(err as Error).message}` };
      }
    }

    // ── Main ReAct Loop ────────────────────────────────────────────────
    this.updateStatus('running');
    eventLog.logEvent('agent_start', { modelId: this.config.model.id }, this.config.agentRunId, this.config.nodeId);

    this.messages.push({ role: 'user', content: userPrompt });

    const maxTurns = this.config.maxTurns ?? 50;
    let finalText = '';
    let repeatedReadOnlySignature = '';
    let repeatedReadOnlyCount = 0;
    let shouldNudgeStopRepeatedReads = false;
    let lastProgressChecklist = '';

    for (let turn = 0; turn < maxTurns; turn++) {
      if (this.aborted) {
        this.updateStatus('cancelled');
        this.running = false;
        return;
      }

      this.state.turnCount = turn + 1;
      this.saveState();
      yield { type: 'turn_start', turn: turn + 1 };

      const progressChecklist = this.config.getProgressChecklist?.()?.trim() ?? '';
      if (progressChecklist && progressChecklist !== lastProgressChecklist) {
        lastProgressChecklist = progressChecklist;
        this.messages.push({
          role: 'user',
          content: [
            `Current ${this.config.progressChecklistLabel ?? 'task'} progress checklist:`,
            progressChecklist,
            '',
            'Use this checklist to decide the next concrete implementation step.',
            'When all required checklist items are complete and verified, stop using tools and provide the final completion summary.',
          ].join('\n'),
        });
      }

      // 当对话接近模型上下文上限时，把历史消息压缩成摘要，只保留最近若干轮原文。
      // 这影响的是 Agent 内部上下文，不会改变节点间传递的产物输入。
      this.budget.update(this.messages, this.config.systemPrompt);
      if (this.budget.shouldCompact() && turn > 2) {
        this.updateStatus('compacting');
        yield { type: 'thinking', thinking: `[Context compression... (${Math.round(this.budget.getUsageRatio() * 100)}% full)]` };
        eventLog.logEvent('compact_start', { tokensUsed: this.budget.getUsed() }, this.config.agentRunId);

        try {
          const compactResult = await compactContext(
            this.messages, this.config.systemPrompt,
            this.config.provider, this.config.model.id,
            this.budget, this.config.runId, this.config.agentRunId
          );
          // 摘要承接长期背景，最近消息保留工具调用和模型决策细节，降低压缩后继续执行的断层风险。
          const KEEP_RECENT = 6;
          const recentMessages = this.messages.slice(-KEEP_RECENT);
          this.messages = [compactResult.summaryMessage, ...recentMessages];
          this.state.compactCount++;
          this.saveState();
          yield { type: 'compact', tokensBefore: compactResult.tokensBefore, tokensAfter: compactResult.tokensAfter };
        } catch (err) {
          // Continue without compact if it fails
        }
        this.updateStatus('running');
      }

      // ── Call LLM (streaming) ──────────────────────────────────────
      this.updateStatus('running');
      const tools: ToolDefinition[] = this.config.registry.getApiSchema().map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.input_schema,
      }));

      let assistantText = '';
      let assistantThinking = '';
      const toolUses: Map<string, { name: string; input: string; done: boolean }> = new Map();
      let stopReason = '';
      let textLogBuffer = '';
      let lastTextLogAt = Date.now();
      const estimatedInputTokens = estimateTotalTokens(this.messages, this.config.systemPrompt);
      const flushAgentTextLog = (force = false) => {
        if (!textLogBuffer) return;
        const shouldFlush = force || textLogBuffer.length >= 240 || Date.now() - lastTextLogAt >= 500;
        if (!shouldFlush) return;
        eventLog.logEvent(
          'agent_text',
          { text: textLogBuffer },
          this.config.agentRunId,
          this.config.nodeId
        );
        textLogBuffer = '';
        lastTextLogAt = Date.now();
      };

      try {
        const stream = this.config.provider.createMessageStream({
          model: this.config.model.id,
          messages: this.messages,
          system: this.config.systemPrompt,
          tools,
          toolChoice: this.config.requireToolUse && this.state.toolCallCount === 0 ? 'required' : 'auto',
          maxTokens: 8192,
          temperature: 0.7,
          stream: true,
        });

        for await (const event of stream) {
          if (this.aborted) break;
          switch (event.type) {
            case 'text_delta':
              assistantText += event.text;
              textLogBuffer += event.text;
              flushAgentTextLog();
              yield { type: 'text', text: event.text };
              break;
            case 'thinking_delta':
              assistantThinking += event.thinking;
              yield { type: 'thinking', thinking: event.thinking };
              break;
            case 'tool_use_start':
              toolUses.set(event.id, { name: event.name, input: '', done: false });
              break;
            case 'tool_use_delta': {
              const tu = toolUses.get(event.id);
              if (tu) tu.input += event.input;
              break;
            }
            case 'tool_use_end': {
              const tu = toolUses.get(event.id);
              if (tu) tu.done = true;
              break;
            }
            case 'message_stop':
              stopReason = event.stopReason;
              break;
            case 'error':
              flushAgentTextLog(true);
              eventLog.logEvent('agent_error', { error: event.message }, this.config.agentRunId, this.config.nodeId);
              yield { type: 'error', message: event.message };
              break;
          }
        }
        flushAgentTextLog(true);
      } catch (err) {
        flushAgentTextLog(true);
        yield { type: 'error', message: `LLM call failed: ${(err as Error).message}` };
        this.updateStatus('failed');
        this.state.error = (err as Error).message;
        this.saveState();
        eventLog.logEvent('agent_error', { error: (err as Error).message }, this.config.agentRunId);
        this.running = false;
        return;
      }

      // Build assistant message
      const contentBlocks: LLMContentBlock[] = [];
      if (assistantText) contentBlocks.push({ type: 'text', text: assistantText });
      if (assistantThinking) contentBlocks.push({ type: 'thinking', thinking: assistantThinking });
      for (const [id, tu] of toolUses) {
        if (!tu.done) continue;
        let parsedInput: Record<string, unknown>;
        try { parsedInput = JSON.parse(tu.input); } catch { parsedInput = { _raw: tu.input }; }
        contentBlocks.push({ type: 'tool_use', id, name: tu.name, input: parsedInput });
      }
      this.recordEstimatedTokenUsage(estimatedInputTokens, contentBlocks);
      this.messages.push({ role: 'assistant', content: contentBlocks });
      finalText = assistantText;

      yield { type: 'turn_end', turn: turn + 1 };

      const toolUseCount = contentBlocks.filter(b => b.type === 'tool_use').length;
      if (this.config.requireToolUse && toolUseCount === 0 && this.state.toolCallCount === 0) {
        if (turn < Math.min(3, maxTurns - 1)) {
          this.messages.push({
            role: 'user',
            content: [
              'You must use the available tools now. Do not describe what you will do.',
              'Call glob/grep/read_file first, then edit/write files or run the required tool for this task.',
              'A plain text answer without tool calls is invalid for this node.',
            ].join('\n'),
          });
          continue;
        }
        const message = 'Required tool use did not happen; the model only returned text.';
        this.updateStatus('failed');
        this.state.error = message;
        this.saveState();
        eventLog.logEvent('agent_error', { error: message }, this.config.agentRunId, this.config.nodeId);
        yield { type: 'error', message };
        this.running = false;
        return;
      }

      // ── Check for stop (no tool uses = agent is done) ─────────────
      // Some OpenAI-compatible streams emit a final [DONE] event after
      // finish_reason=tool_calls. Do not treat that as completion when tool
      // calls were produced; tools must run before the next model turn.
      if (toolUseCount === 0) {
        this.updateStatus('completed');
        this.state.completedAt = Date.now();
        this.saveState();
        eventLog.logEvent('agent_end', { finalText: finalText.slice(0, 500), turns: this.state.turnCount }, this.config.agentRunId);
        yield { type: 'completed', finalText };
        this.running = false;
        return;
      }

      // ── Partition and execute tools ───────────────────────────────
      this.updateStatus('waiting_tool');
      const toolUseBlocks = contentBlocks.filter(b => b.type === 'tool_use') as Extract<LLMContentBlock, { type: 'tool_use' }>[];

      // Partition: read-only tools concurrent, write tools serial
      const { readTools, writeTools } = partitionToolCalls(toolUseBlocks, this.config.registry);
      const toolResults: Array<{ tool_use_id: string; content: string; isError?: boolean }> = [];

      // Create a deferred permission resolver so canUseTool can wait without yielding
      let pendingPermission: { requestId: string; resolve: (d: PermissionDecision) => void } | null = null;

      const toolContext: ToolContext = {
        runId: this.config.runId,
        agentRunId: this.config.agentRunId,
        nodeId: this.config.nodeId,
        projectName: this.config.projectName,
        cwd: this.config.cwd,
        projectDir: this.config.projectDir,
        artifactsDir: this.config.artifactsDir,
        runDir: this.config.runDir,
        canUseTool: async (toolName, input) => {
          const permMgr = getPermissionManager(this.config.runId);
          const requestId = nanoid(8);
          const decision = await permMgr.checkPermission(toolName, input, requestId);
          if (decision === 'ask') {
            this.updateStatus('waiting_confirmation');
            // Poll wait for permission resolution (UI will call resolvePermission)
            const waitStart = Date.now();
            while (Date.now() - waitStart < 5 * 60 * 1000) {
              await new Promise(r => setTimeout(r, 500));
              if (this.aborted) return 'deny' as PermissionDecision;
              const req = permMgr.getPermissionRequest(requestId);
              if (!req) {
                return 'deny' as PermissionDecision;
              }
              if (req.resolved) {
                return req?.decision === 'allow' ? 'allow' as PermissionDecision : 'deny' as PermissionDecision;
              }
            }
            return 'deny' as PermissionDecision;
          }
          return decision;
        },
      };

      // Execute read tools concurrently (events yielded before/after batch)
      if (readTools.length > 0) {
        for (const block of readTools) {
          yield { type: 'tool_use_start', toolUseId: block.id, name: block.name, input: block.input } as any;
        }
        const readPromises = readTools.map(async (block) => {
          const result = await executeToolChain({
            toolName: block.name,
            toolInput: block.input,
            context: toolContext,
            registry: this.config.registry,
          });
          this.state.toolCallCount++;
          return { block, result };
        });
        const readResults = await Promise.all(readPromises);
        for (const { block, result } of readResults) {
          this.saveState();
          yield { type: 'tool_use_end', toolUseId: block.id, name: block.name, result: result.content, isError: result.isError ?? false } as any;
          for (const artifact of result.artifacts ?? []) {
            yield { type: 'artifact_written', ...artifact };
          }
          toolResults.push({ tool_use_id: block.id, content: result.content, isError: result.isError });
        }
        if (writeTools.length === 0) {
          const signature = JSON.stringify(readResults.map(({ block, result }) => ({
            name: block.name,
            input: block.input,
            isError: result.isError ?? false,
            content: result.content.slice(0, 500),
          })));
          if (signature === repeatedReadOnlySignature) repeatedReadOnlyCount++;
          else {
            repeatedReadOnlySignature = signature;
            repeatedReadOnlyCount = 1;
          }
          if (repeatedReadOnlyCount >= 4) {
            shouldNudgeStopRepeatedReads = true;
          }
        } else {
          repeatedReadOnlySignature = '';
          repeatedReadOnlyCount = 0;
          shouldNudgeStopRepeatedReads = false;
        }
      }

      // Execute write tools serially
      for (const block of writeTools) {
        if (this.aborted) break;
        yield { type: 'tool_use_start', toolUseId: block.id, name: block.name, input: block.input } as any;
        const result = await executeToolChain({
          toolName: block.name,
          toolInput: block.input,
          context: toolContext,
          registry: this.config.registry,
        });
        this.state.toolCallCount++;
        this.saveState();
        yield { type: 'tool_use_end', toolUseId: block.id, name: block.name, result: result.content, isError: result.isError ?? false } as any;
        for (const artifact of result.artifacts ?? []) {
          yield { type: 'artifact_written', ...artifact };
        }
        toolResults.push({ tool_use_id: block.id, content: result.content, isError: result.isError });
      }
      if (writeTools.length > 0) {
        repeatedReadOnlySignature = '';
        repeatedReadOnlyCount = 0;
        shouldNudgeStopRepeatedReads = false;
      }

      // Add tool results to message history
      this.messages.push({
        role: 'user',
        content: toolResults.map(r => ({
          type: 'tool_result' as const,
          tool_use_id: r.tool_use_id,
          content: r.content,
        })),
      });
      if (shouldNudgeStopRepeatedReads) {
        this.messages.push({
          role: 'user',
          content: [
            'You have repeated the same read-only tool calls and received the same result.',
            'Stop calling inspection tools. If implementation and verification are done, provide the final concise completion summary now.',
            'If work is blocked, state the blocker without more tool calls.',
          ].join('\n'),
        });
        shouldNudgeStopRepeatedReads = false;
      }

      // Upgrade model on repeated compilation/test failures for java-impl/test-code
      if (this.config.nodeId === 'java-impl' && this.state.turnCount > 5) {
        const recentFailures = toolResults.some(r =>
          r.isError && (r.content.includes('BUILD FAILURE') || r.content.includes('cannot find symbol'))
        );
        if (recentFailures && this.config.model.intelligenceLevel < 5) {
          // Model upgrade will be handled by pipeline engine via event
        }
      }
    }

    // Max turns reached
    if (!this.aborted) {
      this.updateStatus('completed');
      this.state.completedAt = Date.now();
      this.saveState();
      eventLog.logEvent('agent_end', { reason: 'max_turns', turns: this.state.turnCount }, this.config.agentRunId);
      yield { type: 'completed', finalText: finalText || '[Max turns reached]' };
    }

    this.running = false;
  }
}

function defaultAgentInputArtifacts(nodeId: string, projectName?: string): string[] {
  const project = projectName || '{project}';
  const inputs: Record<string, string[]> = {
    'mrd-render': ['input/*', 'artifacts/project-manifest.json'],
    'implementation-plan': ['artifacts/mrd-clarified.md', 'artifacts/mrd-clarify-questions.md', 'artifacts/project-manifest.json'],
    'spec-generate': ['artifacts/prd.md', `artifacts/${project}/tech-design.md`, 'artifacts/implementation-plan-manifest.json'],
    'java-impl': [`artifacts/${project}/openspec-task.md`, `artifacts/${project}/tech-design.md`],
    'java-review': [`artifacts/${project}/changed-files.json`, `artifacts/${project}/code-preview-manifest.json`],
    'testcode-generate': [`artifacts/${project}/openspec-test-task.md`, `artifacts/${project}/code-review.md`],
    'maven-test-runner': [`artifacts/${project}/test-file-list.md`, `artifacts/${project}/openspec-test-task.md`],
    archive: ['artifacts/implementation-plan-manifest.json', `artifacts/${project}/test-report.md`],
  };
  return inputs[nodeId] ?? [];
}

function defaultAgentOutputArtifacts(nodeId: string, projectName?: string): string[] {
  const project = projectName || '{project}';
  const outputs: Record<string, string[]> = {
    'mrd-render': ['artifacts/mrd-clarified.md', 'artifacts/mrd-clarify-questions.md'],
    'implementation-plan': projectName
      ? [`artifacts/${project}/tech-design.md`]
      : ['artifacts/prd.md', 'artifacts/implementation-plan-manifest.json'],
    'spec-generate': [`artifacts/${project}/openspec-task.md`, `artifacts/${project}/openspec-test-task.md`],
    'java-impl': [`artifacts/${project}/changed-files.json`, `artifacts/${project}/code-preview-manifest.json`],
    'java-review': [`artifacts/${project}/code-review.md`, `artifacts/${project}/review-findings.json`],
    'testcode-generate': [`artifacts/${project}/test-file-list.md`, `artifacts/${project}/testcode-generation-report.md`, `artifacts/${project}/test-code-preview-manifest.json`],
    'maven-test-runner': [`artifacts/${project}/test-report.md`, `artifacts/${project}/failure-classification.json`],
    archive: [`artifacts/${project}/archive-report.md`, 'artifacts/archive-manifest.json'],
  };
  return outputs[nodeId] ?? [];
}

/**
 * Partition tool calls into concurrent (read) and serial (write) batches.
 */
function partitionToolCalls(
  blocks: Array<{ id: string; name: string; input: Record<string, unknown> }>,
  registry: ToolRegistry
): {
  readTools: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  writeTools: Array<{ id: string; name: string; input: Record<string, unknown> }>;
} {
  const readTools: typeof blocks = [];
  const writeTools: typeof blocks = [];

  for (const block of blocks) {
    const tool = registry.get(block.name);
    if (tool?.definition.isReadOnly) {
      readTools.push(block);
    } else {
      writeTools.push(block);
    }
  }

  return { readTools, writeTools };
}
