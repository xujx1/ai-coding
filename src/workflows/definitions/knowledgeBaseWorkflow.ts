import { KNOWLEDGE_AGENT_DEFINITIONS } from '../../agents/knowledge/index.js';

export const KNOWLEDGE_BASE_WORKFLOW_ID = 'knowledge-base-refresh';

const NODE_SCOPE: Record<string, string> = {
  'knowledge-repository-scan': '应用仓库 / 领域上下文',
  'knowledge-gitnexus-index': 'GitNexus 索引 / 代码图谱',
  'app-knowledge-generate': '应用级知识库',
  'global-knowledge-merge': '全局知识库 / Registry',
  'knowledge-freshness-record': '版本 / 新鲜度 / 报告',
};

export function getKnowledgeBaseWorkflowTemplate() {
  return {
    id: KNOWLEDGE_BASE_WORKFLOW_ID,
    name: '知识库生成 Workflow',
    mode: 'coordinator' as const,
    description: '仓库扫描 -> GitNexus 索引 -> 应用知识库生成 -> 全局知识合并 -> 新鲜度记录',
    nodes: KNOWLEDGE_AGENT_DEFINITIONS.map(agent => ({
      id: agent.id,
      label: agent.label,
      description: agent.description,
      tools: agent.defaultTools,
      scope: NODE_SCOPE[agent.id] ?? '知识库上下文',
      outputArtifacts: agent.outputArtifacts,
    })),
  };
}

export function listKnowledgeBaseWorkflowTemplates() {
  return [getKnowledgeBaseWorkflowTemplate()];
}
