import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { ToolContext, ToolRegistry } from '../../tools/base.js';
import type { OpsSimilarAlertEvidence } from '../../tools/ops/index.js';
import { firstJsonToolResult, runReActAgent } from '../core/ReActAgent.js';
import { executeOpsJsonTool } from './opsAgentTools.js';

export const SIMILAR_ALERT_AGENT: OpsAgentDefinition = {
  id: 'similar-alert',
  label: '相似预警 Agent',
  description: '读取本地告警历史向量，计算当前告警与历史预警的相似度。',
  usesReActLoop: true,
};

export async function runSimilarAlertAgent(args: {
  registry: ToolRegistry;
  ctx: ToolContext;
  ecomRoot: string;
  alert: string;
  tools?: string[];
  react?: boolean;
}): Promise<OpsAgentRunResult<OpsSimilarAlertEvidence[]>> {
  if (args.react) {
    const reactResult = await runReActAgent({
      agent: SIMILAR_ALERT_AGENT,
      registry: args.registry,
      ctx: args.ctx,
      allowedTools: args.tools?.length ? args.tools : ['alert_vector_search'],
      requiredFirstTool: true,
      systemPrompt: '你是应用运维相似告警 Agent。必须调用 alert_vector_search 获取证据，再返回简短结论。',
      userPrompt: JSON.stringify({ ecomRoot: args.ecomRoot, alert: args.alert }, null, 2),
    });
    const evidence = firstJsonToolResult<OpsSimilarAlertEvidence[]>(reactResult, 'alert_vector_search') ?? [];
    return {
      nodeId: SIMILAR_ALERT_AGENT.id,
      status: 'completed',
      output: `ReAct(${reactResult.modelId}) alert_vector_search => 命中 ${evidence.length} 条告警历史相似记录。`,
      data: evidence,
    };
  }
  const evidence = await executeOpsJsonTool<OpsSimilarAlertEvidence[]>(args.registry, args.ctx, 'alert_vector_search', {
    ecomRoot: args.ecomRoot,
    alert: args.alert,
  });
  return {
    nodeId: SIMILAR_ALERT_AGENT.id,
    status: 'completed',
    output: `alert_vector_search => 命中 ${evidence.length} 条告警历史相似记录。`,
    data: evidence,
  };
}
