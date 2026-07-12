import { OPS_AGENT_DEFINITIONS } from '../../../agents/ops/index.js';
import {
  OPS_FAULT_WORKFLOW_EDGES,
  OPS_FAULT_WORKFLOW_NODES,
} from './opsFaultWorkflowGraph.js';

export const OPS_FAULT_ANALYSIS_WORKFLOW_ID = 'fault-analysis';

export function getOpsFaultAnalysisWorkflowTemplate() {
  const nodeGraph = new Map(OPS_FAULT_WORKFLOW_NODES.map(node => [node.id, node]));
  return {
    id: OPS_FAULT_ANALYSIS_WORKFLOW_ID,
    name: '故障分析 Workflow',
    mode: 'coordinator' as const,
    description: '相似预警 -> 本地日志/Trace grep -> 源码 grep -> 应用知识库 -> 全局图谱上下游分析 -> 修复计划',
    nodes: OPS_AGENT_DEFINITIONS.map(agent => ({
      id: agent.id,
      label: nodeGraph.get(agent.id)?.label ?? agent.label,
      description: agent.description,
      tools: nodeGraph.get(agent.id)?.tools ?? [],
      scope: nodeGraph.get(agent.id)?.scope ?? '当前上下文',
      stateKey: nodeGraph.get(agent.id)?.stateKey,
    })),
    edges: OPS_FAULT_WORKFLOW_EDGES,
  };
}

export function listOpsWorkflowTemplates() {
  return [getOpsFaultAnalysisWorkflowTemplate()];
}
