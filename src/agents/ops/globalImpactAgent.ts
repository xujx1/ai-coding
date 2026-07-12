import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { ToolContext, ToolRegistry } from '../../tools/base.js';
import { firstJsonToolResult, runReActAgent } from '../core/ReActAgent.js';
import { executeOpsJsonTool } from './opsAgentTools.js';

export interface OpsGlobalImpactEvidence {
  upstream: string[];
  downstream: string[];
  blastRadius: string;
}

export const GLOBAL_IMPACT_AGENT: OpsAgentDefinition = {
  id: 'global-impact',
  label: '全局图谱 Agent',
  description: '检索全局知识库、dependency-map 和 GitNexus graph，分析上下游影响面。',
  usesReActLoop: true,
};

export async function runGlobalImpactAgent(args: {
  registry: ToolRegistry;
  ctx: ToolContext;
  upstream: string[];
  downstream: string[];
  blastRadius: string;
  tools?: string[];
  react?: boolean;
}): Promise<OpsAgentRunResult<OpsGlobalImpactEvidence>> {
  if (args.react) {
    const reactResult = await runReActAgent({
      agent: GLOBAL_IMPACT_AGENT,
      registry: args.registry,
      ctx: args.ctx,
      allowedTools: args.tools?.length ? args.tools : ['dependency_graph_search'],
      requiredFirstTool: true,
      systemPrompt: '你是应用运维全局影响面 Agent。必须调用 dependency_graph_search 获取上下游影响面证据，再返回简短结论。',
      userPrompt: JSON.stringify({ upstream: args.upstream, downstream: args.downstream, blastRadius: args.blastRadius }, null, 2),
    });
    const evidence = firstJsonToolResult<OpsGlobalImpactEvidence>(reactResult, 'dependency_graph_search') ?? {
      upstream: args.upstream,
      downstream: args.downstream,
      blastRadius: args.blastRadius,
    };
    return {
      nodeId: GLOBAL_IMPACT_AGENT.id,
      status: 'completed',
      output: `ReAct(${reactResult.modelId}) dependency_graph_search => ${evidence.blastRadius}`,
      data: evidence,
    };
  }
  const evidence = await executeOpsJsonTool<OpsGlobalImpactEvidence>(args.registry, args.ctx, 'dependency_graph_search', {
    upstream: args.upstream,
    downstream: args.downstream,
    blastRadius: args.blastRadius,
  });
  return {
    nodeId: GLOBAL_IMPACT_AGENT.id,
    status: 'completed',
    output: `dependency_graph_search => ${evidence.blastRadius}`,
    data: evidence,
  };
}
