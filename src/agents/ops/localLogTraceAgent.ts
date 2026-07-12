import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { ToolContext, ToolRegistry } from '../../tools/base.js';
import type { OpsClassificationHints, OpsLogEvidence } from '../../tools/ops/index.js';
import { firstJsonToolResult, runReActAgent } from '../core/ReActAgent.js';
import { executeOpsJsonTool } from './opsAgentTools.js';

export const LOCAL_LOG_TRACE_AGENT: OpsAgentDefinition = {
  id: 'local-log-trace',
  label: '日志/Trace 采集 Agent',
  description: '用 grep/read_file 在 demo/ecom/logs 中按 traceId、异常和接口关键词采集日志证据。',
  usesReActLoop: true,
};

export async function runLocalLogTraceAgent(args: {
  registry: ToolRegistry;
  ctx: ToolContext;
  ecomRoot: string;
  appId: string;
  classification: OpsClassificationHints;
  alert: string;
  tools?: string[];
  react?: boolean;
}): Promise<OpsAgentRunResult<OpsLogEvidence[]>> {
  if (args.react) {
    const reactResult = await runReActAgent({
      agent: LOCAL_LOG_TRACE_AGENT,
      registry: args.registry,
      ctx: args.ctx,
      allowedTools: args.tools?.length ? args.tools : ['local_log_search'],
      requiredFirstTool: true,
      systemPrompt: '你是应用运维日志/Trace Agent。必须调用 local_log_search 获取本地日志证据，再返回简短结论。',
      userPrompt: JSON.stringify({ ecomRoot: args.ecomRoot, appId: args.appId, classification: args.classification, alert: args.alert }, null, 2),
    });
    const evidence = firstJsonToolResult<OpsLogEvidence[]>(reactResult, 'local_log_search') ?? [];
    return {
      nodeId: LOCAL_LOG_TRACE_AGENT.id,
      status: 'completed',
      output: `ReAct(${reactResult.modelId}) local_log_search => 命中 ${evidence.length} 条本地日志证据。`,
      data: evidence,
    };
  }
  const evidence = await executeOpsJsonTool<OpsLogEvidence[]>(args.registry, args.ctx, 'local_log_search', {
    ecomRoot: args.ecomRoot,
    appId: args.appId,
    classification: args.classification,
    alert: args.alert,
  });
  return {
    nodeId: LOCAL_LOG_TRACE_AGENT.id,
    status: 'completed',
    output: `local_log_search => 命中 ${evidence.length} 条本地日志证据。`,
    data: evidence,
  };
}
