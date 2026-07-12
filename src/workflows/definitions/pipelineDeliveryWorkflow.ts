import { PIPELINE_AGENT_DEFINITIONS } from '../../agents/codegen/index.js';

export const PIPELINE_DELIVERY_WORKFLOW_ID = 'requirement-pi-delivery';

export function getPipelineDeliveryWorkflowTemplate() {
  return {
    id: PIPELINE_DELIVERY_WORKFLOW_ID,
    name: '需求 PI 交付 Workflow',
    mode: 'workflow' as const,
    description: '上传初始化 -> 需求拆解 -> 实施方案 -> SPEC -> 代码实现 -> 测试 -> 跨应用测试 -> 归档',
    nodes: PIPELINE_AGENT_DEFINITIONS.map((agent, index) => ({
      id: agent.id,
      label: agent.label,
      description: agent.description,
      tools: agent.defaultTools,
      outputArtifacts: agent.outputArtifacts,
      usesReActLoop: agent.usesReActLoop,
      order: index,
    })),
  };
}

export function listPipelineDeliveryWorkflowTemplates() {
  return [getPipelineDeliveryWorkflowTemplate()];
}
