import type { OpsAgentDefinition, OpsAgentRunResult } from './types.js';
import type { OpsClassificationHints, OpsKnowledgeEvidence } from '../../tools/ops/index.js';
import type { KnowledgeEvidenceProvider } from '../../platform-sources/opsEvidenceProviders.js';

export const APP_KNOWLEDGE_AGENT: OpsAgentDefinition = {
  id: 'app-knowledge',
  label: '应用知识库 Agent',
  description: '检索当前应用 app-knowledge-base 和应用级 GitNexus 产物。',
  usesReActLoop: true,
};

export async function runAppKnowledgeAgent(args: {
  provider: KnowledgeEvidenceProvider<OpsKnowledgeEvidence>;
  appId: string;
  classification: OpsClassificationHints;
  alert: string;
}): Promise<OpsAgentRunResult<OpsKnowledgeEvidence[]>> {
  const evidence = await args.provider.search({ appId: args.appId, alert: args.alert, hints: args.classification.codeHints });
  return {
    nodeId: APP_KNOWLEDGE_AGENT.id,
    status: 'completed',
    output: `ops_knowledge_search => 命中 ${evidence.filter(item => item.source === 'knowledge-base').length} 条应用知识库证据。`,
    data: evidence,
  };
}
