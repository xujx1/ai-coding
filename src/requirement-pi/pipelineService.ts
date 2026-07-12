import { PIPELINE_NODES, getNodeById, getNodeIndex, normalizeStageId } from '../workflows/definitions/pipelineDefinition.js';
import { PIPELINE_AGENT_DEFINITIONS } from '../agents/codegen/index.js';
import { listPipelineDeliveryWorkflowTemplates } from '../workflows/definitions/pipelineDeliveryWorkflow.js';

export function describePipelineService() {
  return {
    module: 'requirement-pi',
    responsibility: 'Requirement PI delivery pipeline stage catalog, stage agents, runners, and workflow templates.',
  };
}

export function listPipelineStages() {
  return PIPELINE_NODES;
}

export function listPipelineAgents() {
  return PIPELINE_AGENT_DEFINITIONS;
}

export function listPipelineWorkflows() {
  return listPipelineDeliveryWorkflowTemplates();
}

export { getNodeById, getNodeIndex, normalizeStageId };
