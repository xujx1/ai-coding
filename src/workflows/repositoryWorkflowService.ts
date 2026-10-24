import type { StorageContext } from '../storage/contracts/common.js';
import type { WorkflowRepository } from '../storage/contracts/workflowRepository.js';
import { BUILTIN_MRD_TO_CODE_WORKFLOW_ID, createBuiltInMrdToCodeWorkflow } from './builtinDefinitions.js';
import type { WorkflowConfigPatch } from './storage.js';
import type { WorkflowDefinition } from './types.js';
import { validateWorkflowDefinition } from './validation.js';

/** Repository-backed workflow facade used by HTTP controllers. */
export class RepositoryWorkflowService {
  constructor(private readonly dependencies: {
    workflows: WorkflowRepository;
    context: StorageContext;
  }) {}

  async list(): Promise<WorkflowDefinition[]> {
    const definitions: WorkflowDefinition[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.dependencies.workflows.list(this.dependencies.context, { cursor, limit: 250 });
      definitions.push(...page.items.map(record => record.value));
      cursor = page.nextCursor;
    } while (cursor);

    if (!definitions.some(workflow => workflow.id === BUILTIN_MRD_TO_CODE_WORKFLOW_ID)) {
      definitions.push(builtInWorkflow());
    }
    return definitions.sort((a, b) => a.name.localeCompare(b.name));
  }

  async get(workflowId: string): Promise<WorkflowDefinition | undefined> {
    const record = await this.dependencies.workflows.findById(this.dependencies.context, workflowId);
    if (record) return record.value;
    return workflowId === BUILTIN_MRD_TO_CODE_WORKFLOW_ID ? builtInWorkflow() : undefined;
  }

  async validate(workflowId: string) {
    const workflow = await this.get(workflowId);
    return workflow ? validateWorkflowDefinition(workflow) : undefined;
  }

  async updateDefaultConfig(patch: WorkflowConfigPatch): Promise<WorkflowDefinition> {
    const current = await this.dependencies.workflows.findById(
      this.dependencies.context,
      BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    );
    const workflow = current?.value ?? builtInWorkflow();
    const next: WorkflowDefinition = {
      ...workflow,
      updatedAt: new Date().toISOString(),
      globalConfig: {
        ...workflow.globalConfig,
        ...patch.globalConfig,
      },
      nodes: workflow.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          ...(patch.nodes?.[node.id] ?? {}),
        },
      })),
    };
    const validation = validateWorkflowDefinition(next);
    if (!validation.valid) {
      throw new Error(validation.issues.map(issue => issue.message).join('; '));
    }
    return (await this.dependencies.workflows.save(
      this.dependencies.context,
      next,
      current?.version,
    )).value;
  }
}

function builtInWorkflow(): WorkflowDefinition {
  return createBuiltInMrdToCodeWorkflow({
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  });
}
