import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { OpsSimilarAlertEvidence } from '../../tools/ops/index.js';
import type { AlertHistoryRepository } from '../../platform-sources/opsEvidenceProviders.js';

export const SIMILAR_ALERT_AGENT: OpsAgentDefinition = {
  id: 'similar-alert',
  label: '相似预警 Agent',
  description: '读取本地告警历史向量，计算当前告警与历史预警的相似度。',
  usesReActLoop: true,
};

export async function runSimilarAlertAgent(args: {
  provider: AlertHistoryRepository<OpsSimilarAlertEvidence>;
  alert: string;
}): Promise<OpsAgentRunResult<OpsSimilarAlertEvidence[]>> {
  const evidence = await args.provider.findSimilar(args.alert);
  return {
    nodeId: SIMILAR_ALERT_AGENT.id,
    status: 'completed',
    output: `alert_vector_search => 命中 ${evidence.length} 条告警历史相似记录。`,
    data: evidence,
  };
}
