import {
  getDefaultRequirementPiWorkflow,
  listRequirementPiWorkflows,
  updateDefaultRequirementPiWorkflowConfig,
  validateRequirementPiWorkflow,
} from '../../requirement-pi/index.js';

export function listWorkflows(c: any) {
  return c.json({ workflows: listRequirementPiWorkflows() });
}

export function getDefaultWorkflow(c: any) {
  return c.json({ workflow: getDefaultRequirementPiWorkflow() });
}

export function validateWorkflow(c: any) {
  const workflowId = c.req.param('workflowId');
  const validation = validateRequirementPiWorkflow(workflowId);
  if (!validation) return c.json({ error: `Workflow '${workflowId}' not found` }, 404);
  return c.json({ validation });
}

export async function updateDefaultWorkflowConfig(c: any) {
  const body = await c.req.json().catch(() => ({}));
  try {
    return c.json({ workflow: updateDefaultRequirementPiWorkflowConfig(body) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
}
