export interface OpsWorkflowNodeDefinition {
  id: string;
  label: string;
  scope: string;
  stateKey: OpsFaultWorkflowStateKey;
  tools: string[];
}

export interface OpsWorkflowEdgeDefinition {
  id: string;
  source: string;
  target: string;
  weight?: number;
  description?: string;
}

export type OpsFaultWorkflowStateKey =
  | 'alert'
  | 'similarAlerts'
  | 'localLogs'
  | 'codeContext'
  | 'appKnowledge'
  | 'globalImpact'
  | 'repairPlan';

export const OPS_FAULT_WORKFLOW_NODES: OpsWorkflowNodeDefinition[] = [
  { id: 'similar-alert', label: '相似预警', scope: '告警历史向量', stateKey: 'similarAlerts', tools: ['alert_vector_search'] },
  { id: 'local-log-trace', label: '本地日志 / Trace', scope: '本地日志 / Trace', stateKey: 'localLogs', tools: ['local_log_search', 'grep', 'read_file'] },
  { id: 'code-context', label: '源码上下文', scope: '应用源码', stateKey: 'codeContext', tools: ['glob', 'grep', 'read_file'] },
  { id: 'app-knowledge', label: '应用知识库', scope: '应用知识库', stateKey: 'appKnowledge', tools: ['ops_knowledge_search'] },
  { id: 'global-impact', label: '全局影响面', scope: '全局知识库 / 上下游图谱', stateKey: 'globalImpact', tools: ['dependency_graph_search'] },
  { id: 'repair-plan', label: '修复计划', scope: '诊断结论', stateKey: 'repairPlan', tools: ['read_file', 'use_skill'] },
];

export const OPS_FAULT_WORKFLOW_EDGES: OpsWorkflowEdgeDefinition[] = [
  { id: 'similar-log', source: 'similar-alert', target: 'local-log-trace', weight: 10 },
  { id: 'log-code', source: 'local-log-trace', target: 'code-context', weight: 15 },
  { id: 'code-knowledge', source: 'code-context', target: 'app-knowledge', weight: 10 },
  { id: 'knowledge-impact', source: 'app-knowledge', target: 'global-impact', weight: 10 },
  { id: 'impact-repair', source: 'global-impact', target: 'repair-plan', weight: 20 },
  { id: 'similar-repair', source: 'similar-alert', target: 'repair-plan', weight: 10 },
];
