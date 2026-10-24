import type { StorageContext } from '../../storage/contracts/common.js';
import type { WorkflowRepository } from '../../storage/contracts/workflowRepository.js';
import { RepositoryWorkflowService } from '../../workflows/repositoryWorkflowService.js';

export interface WorkflowControllerDependencies {
  workflows: WorkflowRepository;
  context: StorageContext;
}

export async function listWorkflows(c: any, dependencies: WorkflowControllerDependencies) {
  const service = new RepositoryWorkflowService(dependencies);
  return c.json({ workflows: await service.list() });
}

export async function getDefaultWorkflow(c: any, dependencies: WorkflowControllerDependencies) {
  const service = new RepositoryWorkflowService(dependencies);
  return c.json({ workflow: await service.get('default-mrd-to-code') });
}

export async function validateWorkflow(c: any, dependencies: WorkflowControllerDependencies) {
  const service = new RepositoryWorkflowService(dependencies);
  const workflowId = c.req.param('workflowId');
  const validation = await service.validate(workflowId);
  if (!validation) return c.json({ error: `Workflow '${workflowId}' not found` }, 404);
  return c.json({ validation });
}

export async function updateDefaultWorkflowConfig(c: any, dependencies: WorkflowControllerDependencies) {
  const body = await c.req.json().catch(() => ({}));
  try {
    const service = new RepositoryWorkflowService(dependencies);
    return c.json({ workflow: await service.updateDefaultConfig({
      globalConfig: isRecord(body.globalConfig) ? body.globalConfig : undefined,
      nodes: isRecord(body.nodes) ? normalizeWorkflowNodePatch(body.nodes) : undefined,
    }) });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 400);
  }
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
