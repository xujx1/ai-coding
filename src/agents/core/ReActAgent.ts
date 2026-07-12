import type { LLMContentBlock, LLMMessage } from '../../models/providers.js';
import { createLLMProvider } from '../../models/providers.js';
import { getModelForStage } from '../../models/registry.js';
import type { ToolContext, ToolRegistry } from '../../tools/base.js';

export interface ReActAgentDescriptor {
  id: string;
  label?: string;
}

export interface ReActToolResult {
  toolName: string;
  input: unknown;
  content: string;
  isError?: boolean;
}

export interface ReActRunResult {
  text: string;
  toolResults: ReActToolResult[];
  modelId: string;
  providerId: string;
}

export async function runReActAgent(args: {
  agent: ReActAgentDescriptor;
  registry: ToolRegistry;
  ctx: ToolContext;
  systemPrompt: string;
  userPrompt: string;
  allowedTools?: string[];
  requiredFirstTool?: boolean;
  maxIterations?: number;
}): Promise<ReActRunResult> {
  const model = getModelForStage(args.agent.id);
  if (!model) throw new Error('未找到可用模型配置');
  if (!model.supportsTools) throw new Error(`模型 ${model.id} 不支持工具调用`);
  const provider = createLLMProvider(model.providerId);
  const allowedToolNames = args.allowedTools ?? [];
  const toolSchemas = args.registry.getApiSchema().filter(tool => allowedToolNames.includes(tool.name));
  if (!toolSchemas.length) throw new Error(`Agent ${args.agent.id} 没有可用工具 schema`);

  const messages: LLMMessage[] = [{ role: 'user', content: args.userPrompt }];
  const toolResults: ReActToolResult[] = [];
  let finalText = '';
  const maxIterations = args.maxIterations ?? 4;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const response = await provider.createMessage({
      model: model.id,
      temperature: 0.2,
      maxTokens: 1200,
      system: args.systemPrompt,
      messages,
      tools: toolSchemas,
      toolChoice: iteration === 0 && args.requiredFirstTool ? 'required' : 'auto',
    });
    const textBlocks = response.content.filter((block): block is Extract<LLMContentBlock, { type: 'text' }> => block.type === 'text');
    const toolUses = response.content.filter((block): block is Extract<LLMContentBlock, { type: 'tool_use' }> => block.type === 'tool_use');
    if (textBlocks.length) finalText = textBlocks.map(block => block.text).join('\n').trim();
    if (!toolUses.length) {
      return { text: finalText, toolResults, modelId: model.id, providerId: model.providerId };
    }

    messages.push({ role: 'assistant', content: response.content });
    const toolResultBlocks: LLMContentBlock[] = [];
    for (const toolUse of toolUses) {
      const tool = args.registry.get(toolUse.name);
      const result = tool
        ? await tool.execute(toolUse.input, { ...args.ctx, nodeId: args.agent.id })
        : { toolUseId: toolUse.id, content: `Tool not registered: ${toolUse.name}`, isError: true };
      toolResults.push({
        toolName: toolUse.name,
        input: toolUse.input,
        content: result.content,
        isError: result.isError,
      });
      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: toolUse.id,
        content: result.content,
      });
    }
    messages.push({ role: 'user', content: toolResultBlocks });
  }

  return { text: finalText, toolResults, modelId: model.id, providerId: model.providerId };
}

export function firstJsonToolResult<T>(result: ReActRunResult, toolName: string): T | undefined {
  const item = result.toolResults.find(toolResult => toolResult.toolName === toolName && !toolResult.isError);
  if (!item) return undefined;
  try {
    return JSON.parse(item.content) as T;
  } catch {
    return undefined;
  }
}
