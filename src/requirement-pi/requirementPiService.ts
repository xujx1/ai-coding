import { BUILTIN_MRD_TO_CODE_WORKFLOW_ID } from '../workflows/builtinDefinitions.js';
import {
  getDefaultWorkflowDefinition,
  listWorkflowDefinitions,
  updateDefaultWorkflowConfig,
} from '../workflows/storage.js';
import { validateWorkflowDefinition } from '../workflows/validation.js';

export interface RequirementPiServiceInfo {
  module: 'requirement-pi';
  responsibility: string;
}

export function describeRequirementPiService(): RequirementPiServiceInfo {
  return {
    module: 'requirement-pi',
    responsibility: 'Requirement PI orchestration facade over shared workflow and pipeline runtime capabilities.',
  };
}

export function listRequirementPiWorkflows() {
  return listWorkflowDefinitions();
}

export function getDefaultRequirementPiWorkflow() {
  return getDefaultWorkflowDefinition();
}

export function validateRequirementPiWorkflow(workflowId: string) {
  if (workflowId !== BUILTIN_MRD_TO_CODE_WORKFLOW_ID) return undefined;
  return validateWorkflowDefinition(getDefaultWorkflowDefinition());
}

export function updateDefaultRequirementPiWorkflowConfig(body: Record<string, unknown>) {
  return updateDefaultWorkflowConfig({
    globalConfig: isRecord(body.globalConfig) ? body.globalConfig : undefined,
    nodes: isRecord(body.nodes) ? normalizeWorkflowNodePatch(body.nodes) : undefined,
  });
}

function normalizeWorkflowNodePatch(nodes: Record<string, unknown>): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(nodes)
      .filter(([, value]) => isRecord(value))
      .map(([nodeId, value]) => [nodeId, value as Record<string, unknown>]),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
