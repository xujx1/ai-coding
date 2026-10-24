import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { OpsClassificationHints, OpsLogEvidence } from '../../tools/ops/index.js';
import type { LogEvidenceProvider } from '../../platform-sources/opsEvidenceProviders.js';

export const LOCAL_LOG_TRACE_AGENT: OpsAgentDefinition = {
  id: 'local-log-trace',
  label: '日志/Trace 采集 Agent',
  description: '通过配置的日志源按 traceId、异常和接口关键词采集日志证据。',
  usesReActLoop: true,
};

export async function runLocalLogTraceAgent(args: {
  provider: LogEvidenceProvider<OpsLogEvidence>;
  appId: string;
  classification: OpsClassificationHints;
  alert: string;
}): Promise<OpsAgentRunResult<OpsLogEvidence[]>> {
  const evidence = await args.provider.search({ appId: args.appId, alert: args.alert, hints: args.classification.codeHints });
  return {
    nodeId: LOCAL_LOG_TRACE_AGENT.id,
    status: 'completed',
    output: `local_log_search => 命中 ${evidence.length} 条本地日志证据。`,
    data: evidence,
  };
}
