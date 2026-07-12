import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { ToolContext, ToolRegistry } from '../../tools/base.js';
import type { OpsClassificationHints, OpsCodeEvidence } from '../../tools/ops/index.js';
import { firstJsonToolResult, runReActAgent } from '../core/ReActAgent.js';
import { executeOpsJsonTool } from './opsAgentTools.js';

export const CODE_CONTEXT_AGENT: OpsAgentDefinition = {
  id: 'code-context',
  label: '代码上下文 Agent',
  description: '用 glob/grep/read_file 检索应用本地源码、配置和异常相关代码路径。',
  usesReActLoop: true,
};

export async function runCodeContextAgent(args: {
  registry: ToolRegistry;
  ctx: ToolContext;
  root: string;
  classification: OpsClassificationHints;
  alert: string;
  tools?: string[];
  react?: boolean;
}): Promise<OpsAgentRunResult<OpsCodeEvidence[]>> {
  if (args.react) {
    const reactResult = await runReActAgent({
      agent: CODE_CONTEXT_AGENT,
      registry: args.registry,
      ctx: args.ctx,
      allowedTools: args.tools?.length ? args.tools : ['code_context_search'],
      requiredFirstTool: true,
      systemPrompt: '你是应用运维代码上下文 Agent。必须调用 code_context_search 获取源码/配置证据，再返回简短结论。',
      userPrompt: JSON.stringify({ root: args.root, classification: args.classification, alert: args.alert }, null, 2),
    });
    const evidence = firstJsonToolResult<OpsCodeEvidence[]>(reactResult, 'code_context_search') ?? [];
    return {
      nodeId: CODE_CONTEXT_AGENT.id,
      status: 'completed',
      output: `ReAct(${reactResult.modelId}) code_context_search => 命中 ${evidence.length} 个源码/配置文件。`,
      data: evidence,
    };
  }
  const evidence = await executeOpsJsonTool<OpsCodeEvidence[]>(args.registry, args.ctx, 'code_context_search', {
    root: args.root,
    classification: args.classification,
    alert: args.alert,
  });
  return {
    nodeId: CODE_CONTEXT_AGENT.id,
    status: 'completed',
    output: `code_context_search => 命中 ${evidence.length} 个源码/配置文件。`,
    data: evidence,
  };
}
