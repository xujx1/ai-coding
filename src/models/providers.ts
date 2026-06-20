/**
 * LLM Provider abstraction with streaming support.
 * Supports Anthropic and OpenAI-compatible APIs.
 */
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../config/index.js';
import { getProvider } from './registry.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LLMContentBlock[];
}

export type LLMContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMRequest {
  model: string;
  messages: LLMMessage[];
  system?: string;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'required';
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export type LLMStreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'thinking_delta'; thinking: string }
  | { type: 'tool_use_start'; id: string; name: string }
  | { type: 'tool_use_delta'; id: string; input: string }
  | { type: 'tool_use_end'; id: string }
  | { type: 'message_stop'; stopReason: string }
  | { type: 'error'; message: string };

export interface LLMResponse {
  content: LLMContentBlock[];
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  createMessage(req: LLMRequest): Promise<LLMResponse>;
  createMessageStream(req: LLMRequest): AsyncGenerator<LLMStreamEvent>;
}

function getLlmRequestTimeoutMs(): number {
  const raw = process.env.AI_CODING_LLM_TIMEOUT_MS;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 180_000;
}

async function fetchWithTimeout(url: string, init: RequestInit, providerName: string): Promise<Response> {
  const timeoutMs = getLlmRequestTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`${providerName} request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function readStreamChunkWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
  providerName: string,
): ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']> {
  const timeoutMs = getLlmRequestTimeoutMs();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader.read(),
      new Promise<Awaited<ReturnType<ReadableStreamDefaultReader<Uint8Array>['read']>>>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new Error(`${providerName} stream timed out after ${timeoutMs}ms without data`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function fetchStreamWithTimeout(url: string, init: RequestInit, providerName: string): Promise<{
  response: Response;
  controller: AbortController;
}> {
  const timeoutMs = getLlmRequestTimeoutMs();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    return { response, controller };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new Error(`${providerName} request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ── OpenAI-compatible Provider ─────────────────────────────────────────────

class OpenAICompatProvider implements LLMProvider {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  async createMessage(req: LLMRequest): Promise<LLMResponse> {
    const body = this.buildRequestBody(req);
    const resp = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ ...body, stream: false }),
    }, 'LLM API');

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`LLM API error (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    return this.parseResponse(data);
  }

  async *createMessageStream(req: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    const body = this.buildRequestBody(req);
    const { response: resp, controller } = await fetchStreamWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ ...body, stream: true }),
    }, 'LLM API');

    if (!resp.ok || !resp.body) {
      const errText = await resp.text();
      yield { type: 'error', message: `LLM API error (${resp.status}): ${errText}` };
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const toolUses = new Map<string, { name: string; input: string }>();
    const toolUseIdsByIndex = new Map<number, string>();
    let emittedStop = false;

    try {
      while (true) {
        const { done, value } = await readStreamChunkWithTimeout(reader, controller, 'LLM API');
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            if (emittedStop) return;
            yield { type: 'message_stop', stopReason: 'end_turn' };
            return;
          }
          try {
            const parsed = JSON.parse(data);
            for (const event of this.parseStreamChunk(parsed, toolUses, toolUseIdsByIndex)) {
              if (event.type === 'message_stop') emittedStop = true;
              yield event;
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildRequestBody(req: LLMRequest): Record<string, unknown> {
    const messages: Record<string, unknown>[] = [];
    if (req.system) {
      messages.push({ role: 'system', content: req.system });
    }
    for (const msg of req.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        const textParts: string[] = [];
        const toolCalls: Record<string, unknown>[] = [];
        const toolResults: Record<string, unknown>[] = [];
        for (const block of msg.content) {
          if (block.type === 'text') {
            textParts.push(block.text);
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              type: 'function',
              function: { name: block.name, arguments: JSON.stringify(block.input) },
            });
          } else if (block.type === 'tool_result') {
            toolResults.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: block.content,
            });
          }
        }
        if (toolResults.length) {
          messages.push(...toolResults);
        } else {
          messages.push({
            role: msg.role,
            content: textParts.join('\n') || null,
            tool_calls: toolCalls.length ? toolCalls : undefined,
          });
        }
      }
    }

    const tools = req.tools?.map(t => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));

    return {
      model: req.model,
      messages,
      tools: tools?.length ? tools : undefined,
      tool_choice: req.toolChoice === 'required' && tools?.length ? 'required' : undefined,
      max_tokens: req.maxTokens ?? 8192,
      temperature: req.temperature ?? 0.7,
    };
  }

  private parseResponse(data: any): LLMResponse {
    const choice = data.choices?.[0];
    const content: LLMContentBlock[] = [];
    if (choice?.message?.content) {
      content.push({ type: 'text', text: choice.message.content });
    }
    if (choice?.message?.tool_calls) {
      for (const tc of choice.message.tool_calls) {
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: safeJsonParse(tc.function.arguments),
        });
      }
    }
    return {
      content,
      stopReason: choice?.finish_reason ?? 'end_turn',
      usage: data.usage ? {
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
      } : undefined,
    };
  }

  private *parseStreamChunk(
    chunk: any,
    toolUses: Map<string, { name: string; input: string }>,
    toolUseIdsByIndex: Map<number, string>
  ): Generator<LLMStreamEvent> {
    if (chunk.type === 'response.output_text.delta' && typeof chunk.delta === 'string') {
      yield { type: 'text_delta', text: chunk.delta };
      return;
    }
    if (chunk.type === 'response.reasoning_text.delta' && typeof chunk.delta === 'string') {
      yield { type: 'thinking_delta', thinking: chunk.delta };
      return;
    }

    const choice = chunk.choices?.[0];
    const delta = choice?.delta ?? choice?.message;
    if (!delta) return;

    if (typeof delta.content === 'string') {
      yield { type: 'text_delta', text: delta.content };
    } else if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        const text = part?.text ?? part?.content;
        if (typeof text === 'string') {
          yield { type: 'text_delta', text };
        }
      }
    }
    if (typeof delta.reasoning_content === 'string') {
      yield { type: 'thinking_delta', thinking: delta.reasoning_content };
    }
    if (typeof delta.reasoning === 'string') {
      yield { type: 'thinking_delta', thinking: delta.reasoning };
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const index = typeof tc.index === 'number' ? tc.index : toolUses.size;
        const id = tc.id ?? toolUseIdsByIndex.get(index) ?? `tool_${index}`;
        if (!toolUseIdsByIndex.has(index)) toolUseIdsByIndex.set(index, id);
        const existing = toolUses.get(id);
        if (!existing) {
          toolUses.set(id, { name: tc.function?.name ?? '', input: '' });
          if (tc.function?.name) {
            yield { type: 'tool_use_start', id, name: tc.function.name };
          }
        } else if (!existing.name && tc.function?.name) {
          existing.name = tc.function.name;
          yield { type: 'tool_use_start', id, name: tc.function.name };
        }
        if (tc.function?.arguments) {
          const tu = toolUses.get(id);
          if (tu) tu.input += tc.function.arguments;
          yield { type: 'tool_use_delta', id, input: tc.function.arguments };
        }
      }
    }
    const finishReason = choice?.finish_reason;
    if (finishReason) {
      for (const [id] of toolUses) {
        yield { type: 'tool_use_end', id };
      }
      yield { type: 'message_stop', stopReason: finishReason };
    }
  }
}

// ── Anthropic Provider ─────────────────────────────────────────────────────

class AnthropicProvider implements LLMProvider {
  constructor(
    private apiKey: string,
    private baseUrl: string = 'https://api.anthropic.com',
  ) {}

  async createMessage(req: LLMRequest): Promise<LLMResponse> {
    const body = this.buildRequestBody(req);
    const resp = await fetchWithTimeout(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...body, stream: false }),
    }, 'Anthropic API');

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Anthropic API error (${resp.status}): ${errText}`);
    }

    const data = await resp.json();
    return this.parseResponse(data);
  }

  async *createMessageStream(req: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    const body = this.buildRequestBody(req);
    const { response: resp, controller } = await fetchStreamWithTimeout(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...body, stream: true }),
    }, 'Anthropic API');

    if (!resp.ok || !resp.body) {
      const errText = await resp.text();
      yield { type: 'error', message: `Anthropic API error (${resp.status}): ${errText}` };
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await readStreamChunkWithTimeout(reader, controller, 'Anthropic API');
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(trimmed.slice(6));
            for (const ev of this.parseStreamEvent(event)) {
              yield ev;
            }
          } catch {
            // skip
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  private buildRequestBody(req: LLMRequest): Record<string, unknown> {
    // Convert messages: extract system, merge system into top level
    const messages: Record<string, unknown>[] = [];
    for (const msg of req.messages) {
      if (msg.role === 'system') continue; // system goes to top level
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content });
      } else {
        const content: Record<string, unknown>[] = [];
        for (const block of msg.content) {
          if (block.type === 'text') content.push({ type: 'text', text: block.text });
          else if (block.type === 'thinking') content.push({ type: 'thinking', thinking: block.thinking });
          else if (block.type === 'tool_use') content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
          else if (block.type === 'tool_result') content.push({ type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content });
        }
        messages.push({ role: msg.role, content });
      }
    }
    return {
      model: req.model,
      system: req.system ?? '',
      messages,
      tools: req.tools,
      tool_choice: req.toolChoice === 'required' && req.tools?.length ? { type: 'any' } : undefined,
      max_tokens: req.maxTokens ?? 8192,
      temperature: req.temperature ?? 0.7,
    };
  }

  private parseResponse(data: any): LLMResponse {
    const content: LLMContentBlock[] = [];
    for (const block of data.content ?? []) {
      if (block.type === 'text') content.push({ type: 'text', text: block.text });
      else if (block.type === 'thinking') content.push({ type: 'thinking', thinking: block.thinking });
      else if (block.type === 'tool_use') content.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
    }
    return {
      content,
      stopReason: data.stop_reason ?? 'end_turn',
      usage: data.usage ? {
        inputTokens: data.usage.input_tokens ?? 0,
        outputTokens: data.usage.output_tokens ?? 0,
      } : undefined,
    };
  }

  private *parseStreamEvent(event: any): Generator<LLMStreamEvent> {
    switch (event.type) {
      case 'content_block_start':
        if (event.content_block?.type === 'text') {
          // will get deltas
        } else if (event.content_block?.type === 'tool_use') {
          yield { type: 'tool_use_start', id: event.index?.toString() ?? '', name: event.content_block.name };
        } else if (event.content_block?.type === 'thinking') {
          // thinking deltas follow
        }
        break;
      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta?.type === 'thinking_delta') {
          yield { type: 'thinking_delta', thinking: event.delta.thinking };
        } else if (event.delta?.type === 'input_json_delta') {
          yield { type: 'tool_use_delta', id: event.index?.toString() ?? '', input: event.delta.partial_json ?? '' };
        }
        break;
      case 'content_block_stop':
        yield { type: 'tool_use_end', id: event.index?.toString() ?? '' };
        break;
      case 'message_stop':
        yield { type: 'message_stop', stopReason: 'end_turn' };
        break;
      case 'error':
        yield { type: 'error', message: event.error?.message ?? 'Unknown error' };
        break;
    }
  }
}

// ── Test Mock Provider ─────────────────────────────────────────────────────

class MockLLMProvider implements LLMProvider {
  async createMessage(req: LLMRequest): Promise<LLMResponse> {
    const text = this.createResponseText(req, true);
    return {
      content: [{ type: 'text', text }],
      stopReason: 'end_turn',
      usage: { inputTokens: 10, outputTokens: Math.ceil(text.length / 4) },
    };
  }

  async *createMessageStream(req: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    const text = this.createResponseText(req, false);
    yield { type: 'text_delta', text };
    yield { type: 'message_stop', stopReason: 'end_turn' };
  }

  private createResponseText(req: LLMRequest, nonStreaming: boolean): string {
    const system = (req.system || '').toLowerCase();
    const userText = req.messages.map(msg => typeof msg.content === 'string'
      ? msg.content
      : msg.content.map(block => block.type === 'text' ? block.text : '').join('\n')
    ).join('\n').toLowerCase();

    if (nonStreaming && system.includes('implementation planner')) {
      return JSON.stringify({
        title: '测试实现计划',
        steps: [
          { title: '读取现有项目结构', description: '确认 Maven 项目和需求输入', risk: 'low' },
          { title: '实现业务代码', description: '按技术方案完成 Java 修改', risk: 'medium' },
          { title: '运行测试并归档', description: '生成测试结果和交付摘要', risk: 'low' },
        ],
        risks: ['该计划由测试 mock 生成，仅用于流水线闭环验证'],
      });
    }

    const stage = this.detectStage(`${system}\n${userText}`);
    return `# ${stage.title}\n\n${stage.body}\n\n- 模型: ${req.model}\n- 测试模式: AI_CODING_MOCK_LLM\n`;
  }

  private detectStage(text: string): { title: string; body: string } {
    if (
      text.includes('只输出 `artifacts/project/openspec-task.md`') ||
      text.includes('只输出 `artifacts/{{project_name}}/openspec-task.md`') ||
      text.includes('写入 `artifacts/project/openspec-task.md`') ||
      text.includes('写入 `artifacts/{{project_name}}/openspec-task.md`')
    ) {
      return {
        title: 'project 开发任务清单',
        body: loadMockTemplate('dev-task-list.md'),
      };
    }
    if (
      text.includes('只输出 `artifacts/project/openspec-test-task.md`') ||
      text.includes('只输出 `artifacts/{{project_name}}/openspec-test-task.md`') ||
      text.includes('写入 `artifacts/project/openspec-test-task.md`') ||
      text.includes('写入 `artifacts/{{project_name}}/openspec-test-task.md`') ||
      text.includes('openspec test') ||
      text.includes('测试 openspec') ||
      text.includes('测试任务清单') ||
      text.includes('testspec') ||
      text.includes('test specification') ||
      text.includes('测试方案')
    ) {
      return {
        title: 'project 测试任务清单',
        body: loadMockTemplate('test-task-list.md'),
      };
    }
    if (text.includes('openspec-task.md') || text.includes('开发任务清单') || text.includes('openspec')) {
      return {
        title: 'project 开发任务清单',
        body: loadMockTemplate('dev-task-list.md'),
      };
    }
    if (text.includes('mrd clarify') || text.includes('mrd 澄清')) {
      return { title: 'MRD 澄清结果', body: '已识别关键业务目标、边界条件和待确认问题，并产出可继续下游处理的澄清版 MRD。' };
    }
    if (text.includes('mrd render') || text.includes('mrd 渲染')) {
      const projectSection = extractMockProjectSection(text);
      return {
        title: 'MRD: 测试需求文档',
        body: [
          '## 背景',
          '本项目旨在实现一个最小可用的 MRD 到代码流水线闭环，验证从需求上传到代码生成的完整自动化流程。',
          '',
          '## 目标',
          '- 建立需求文件上传与结构化解析能力',
          '- 实现从需求文档到代码的自动化生成流程',
          '- 支持多项目场景下的代码生成',
          '',
          '## 范围',
          '### 包含范围',
          '- 需求文件解析与 MRD 结构化渲染',
          '- MRD 澄清与确认流程',
          '- 实施方案生成（PRD + 技术方案）',
          '- OpenSpec 任务清单生成',
          '- Java 代码生成与测试',
          '',
          '### 不包含范围',
          '- 生产环境部署',
          '- 前端界面功能扩展',
          '',
          '## 涉及项目',
          projectSection,
          '',
          '## 业务流程',
          '1. 用户上传需求文件和项目代码',
          '2. 系统解析需求生成结构化 MRD',
          '3. 用户确认 MRD 后进入澄清阶段',
          '4. 系统生成实施方案和开发任务',
          '5. 自动生成代码并运行单元测试',
          '',
          '## 约束',
          '- 基于 Java/Maven 技术栈',
          '- 必须通过单元测试验证',
          '',
          '## 验收标准',
          '1. MRD 文档结构完整，包含所有必填章节',
          '2. 项目识别结果准确',
          '3. 下游节点可基于 MRD 正常执行',
          '4. 全流程可在 mock 模式下端到端通过',
          '',
          '## 待澄清项',
          '- 具体业务接口定义待后续澄清阶段确认',
          '- 性能指标待进一步明确',
        ].join('\n'),
      };
    }
    if (text.includes('prd generate') || text.includes('prd 生成')) {
      return { title: 'PRD 文档', body: '已基于 MRD 生成用户场景、功能列表、流程说明、非功能要求和验收口径。' };
    }
    if (text.includes('implementation plan') || text.includes('实施方案')) {
      return {
        title: text.includes('tech-design.md') || text.includes('技术方案') ? 'project 技术方案' : 'PRD / 验收口径',
        body: [
          '## 背景与目标',
          '基于澄清后的 MRD，生成可被下游 OpenSpec 使用的实施方案。mock 输出用于验证产物写入、确认门和下游读取链路。',
          '',
          '## 影响范围',
          '- 需求拆解节点产出的功能清单和项目归属作为输入。',
          '- 当前项目需要在现有 Maven 结构内承接对应功能。',
          '- 下游只读取 prd.md、implementation-plan-manifest.json 和项目级 tech-design.md。',
          '',
          '## 主要改动文件候选',
          '- pom.xml：确认依赖与测试配置。',
          '- src/main/java/demo/DemoService.java：承接核心业务逻辑示例。',
          '- src/test/java/demo/DemoServiceTest.java：补充单元测试覆盖。',
          '',
          '## 接口 / 数据 / 配置影响',
          '- 接口层保持现有调用边界，新增字段需在 PRD 验收口径中可追踪。',
          '- 数据结构变更以项目技术方案为准，下游 SPEC 再展开具体任务。',
          '- 配置项应支持测试环境默认值，避免阻塞 mock 全流程。',
          '',
          '## 实施步骤',
          '1. 读取 PRD 和澄清后的需求边界。',
          '2. 对照项目结构确定改动文件候选。',
          '3. 生成 OpenSpec 开发任务和测试任务。',
          '4. 执行 Java 实现、评审、测试和归档。',
          '',
          '## 测试策略',
          '- 单元测试覆盖正常路径、异常路径和边界输入。',
          '- 回归测试验证既有 DemoService 行为不被破坏。',
          '- mock 模式只验证流水线契约，不替代真实模型质量评估。',
          '',
          '## 风险与回滚',
          '- 风险：真实项目结构不足时技术方案可能只能给出候选文件。',
          '- 回滚：保留原始项目文件，失败时不推进到代码归档。',
        ].join('\n'),
      };
    }
    if (text.includes('tech design') || text.includes('技术方案')) {
      return { title: '技术方案', body: '已生成模块划分、接口设计、数据结构、异常处理、测试策略和实施步骤。' };
    }
    if (text.includes('openspec test') || text.includes('测试 openspec') || text.includes('测试任务清单') || text.includes('testspec') || text.includes('test specification') || text.includes('测试方案')) {
      return {
        title: 'project 测试任务清单',
        body: loadMockTemplate('test-task-list.md'),
      };
    }
    if (text.includes('openspec')) {
      return {
        title: 'project 开发任务清单',
        body: loadMockTemplate('dev-task-list.md'),
      };
    }
    if (text.includes('java impl') || text.includes('java 实现')) {
      return { title: 'Java 实现摘要', body: '已按 ReAct 阶段完成 mock 实现摘要。本测试不触发真实文件写入和工具调用。' };
    }
    if (text.includes('java review') || text.includes('代码评审')) {
      return { title: '代码评审报告', body: '未发现阻断问题。建议在真实模型和工具接入后补充编译、测试和安全检查结果。' };
    }
    if (text.includes('test code') || text.includes('测试代码')) {
      return { title: '测试代码生成摘要', body: '已生成测试代码规划和覆盖点说明，mock 模式不写入真实测试文件。' };
    }
    if (text.includes('maven test') || text.includes('maven 测试')) {
      return { title: '单元测试执行结果', body: 'BUILD SUCCESS\nTests run: 1, Failures: 0, Errors: 0, Skipped: 0' };
    }
    if (text.includes('archive') || text.includes('归档')) {
      return { title: '归档报告', body: '已汇总本次流水线产物、节点状态、模型选择和交付说明。' };
    }
    return { title: '阶段产物', body: '测试 mock 已返回阶段文本产物。' };
  }
}

function extractMockProjectSection(text: string): string {
  const sectionMatch = text.match(/## 项目清单[\s\S]*?(?=\n## 输出要求|\n## Instructions|$)/);
  const section = sectionMatch?.[0] || '';
  if (section.includes('未检测到上传项目')) {
    return '- 未检测到上传项目；后续澄清或实施方案阶段需要用户补充目标应用或项目代码。';
  }

  const projects = section
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).replace(/\s*\(构建工具:[^)]+\)\s*$/, '').trim())
    .filter(Boolean);

  if (!projects.length) {
    return '- 未检测到上传项目；后续澄清或实施方案阶段需要用户补充目标应用或项目代码。';
  }

  return projects.map(project => `- ${project}（从项目清单识别）`).join('\n');
}

function loadMockTemplate(fileName: string): string {
  const templatePath = path.join(process.cwd(), 'prompts', 'template', 'mock', fileName);
  try {
    return fs.readFileSync(templatePath, 'utf-8').trim();
  } catch {
    return '## Phase 1: Mock 任务\n- [ ] 补充 mock 模板。';
  }
}

// ── Factory ────────────────────────────────────────────────────────────────

export function createLLMProvider(providerId: string): LLMProvider {
  if (process.env.AI_CODING_MOCK_LLM === '1') {
    return new MockLLMProvider();
  }

  const config = getConfig();
  const registeredProvider = getProvider(providerId);

  if (registeredProvider?.compatRule === 'anthropic' || providerId === 'anthropic') {
    const apiKey =
      registeredProvider?.apiKey ||
      (registeredProvider?.apiKeyEnv ? process.env[registeredProvider.apiKeyEnv] : undefined) ||
      process.env.ANTHROPIC_API_KEY ||
      config.llm.apiKey ||
      '';
    return new AnthropicProvider(apiKey, registeredProvider?.baseUrl || 'https://api.anthropic.com');
  }

  // Default: openai-compat
  const baseUrl = registeredProvider?.baseUrl || config.llm.baseUrl || 'https://api.openai.com/v1';
  const apiKey =
    registeredProvider?.apiKey ||
    (registeredProvider?.apiKeyEnv ? process.env[registeredProvider.apiKeyEnv] : undefined) ||
    process.env.LLM_API_KEY ||
    config.llm.apiKey ||
    '';
  return new OpenAICompatProvider(baseUrl, apiKey);
}

function safeJsonParse(str: string): Record<string, unknown> {
  try { return JSON.parse(str); } catch { return { _raw: str }; }
}
