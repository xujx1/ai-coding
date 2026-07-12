import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { ToolContext, ToolRegistry } from '../../tools/base.js';
import type { OpsClassificationHints, OpsKnowledgeEvidence } from '../../tools/ops/index.js';
import { firstJsonToolResult, runReActAgent } from '../core/ReActAgent.js';
import { executeOpsJsonTool } from './opsAgentTools.js';

export const APP_KNOWLEDGE_AGENT: OpsAgentDefinition = {
  id: 'app-knowledge',
  label: '应用知识库 Agent',
  description: '检索当前应用 app-knowledge-base 和应用级 GitNexus 产物。',
  usesReActLoop: true,
};

export async function runAppKnowledgeAgent(args: {
  registry: ToolRegistry;
  ctx: ToolContext;
  ecomRoot: string;
  appId: string;
  classification: OpsClassificationHints;
  alert: string;
  tools?: string[];
  react?: boolean;
}): Promise<OpsAgentRunResult<OpsKnowledgeEvidence[]>> {
  if (args.react) {
    const reactResult = await runReActAgent({
      agent: APP_KNOWLEDGE_AGENT,
      registry: args.registry,
      ctx: args.ctx,
      allowedTools: args.tools?.length ? args.tools : ['ops_knowledge_search'],
      requiredFirstTool: true,
      systemPrompt: '你是应用运维知识库 Agent。必须调用 ops_knowledge_search 获取知识库/GitNexus 证据，再返回简短结论。',
      userPrompt: JSON.stringify({ ecomRoot: args.ecomRoot, appId: args.appId, classification: args.classification, alert: args.alert }, null, 2),
    });
    const evidence = firstJsonToolResult<OpsKnowledgeEvidence[]>(reactResult, 'ops_knowledge_search') ?? [];
    return {
      nodeId: APP_KNOWLEDGE_AGENT.id,
      status: 'completed',
      output: `ReAct(${reactResult.modelId}) ops_knowledge_search => 命中 ${evidence.filter(item => item.source === 'knowledge-base').length} 条应用知识库证据。`,
      data: evidence,
    };
  }
  const evidence = await executeOpsJsonTool<OpsKnowledgeEvidence[]>(args.registry, args.ctx, 'ops_knowledge_search', {
    ecomRoot: args.ecomRoot,
    appId: args.appId,
    classification: args.classification,
    alert: args.alert,
  });
  return {
    nodeId: APP_KNOWLEDGE_AGENT.id,
    status: 'completed',
    output: `ops_knowledge_search => 命中 ${evidence.filter(item => item.source === 'knowledge-base').length} 条应用知识库证据。`,
    data: evidence,
  };
}
