import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../config/index.js';
import {
  BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
  createBuiltInMrdToCodeWorkflow,
} from './builtinDefinitions.js';
import { validateWorkflowDefinition } from './validation.js';
import {
  WorkflowDefinition,
  WorkflowGlobalConfig,
  WorkflowNodeData,
  WorkflowValidationResult,
} from './types.js';

export interface WorkflowConfigPatch {
  globalConfig?: Partial<WorkflowGlobalConfig>;
  nodes?: Record<string, Partial<WorkflowNodeData>>;
}

export function getWorkflowsDir(): string {
  return path.join(getConfig().runtimeDir, 'workflows');
}

export function listWorkflowDefinitions(): WorkflowDefinition[] {
  ensureWorkflowsDir();
  const workflows = new Map<string, WorkflowDefinition>();
  const builtIn = getDefaultWorkflowDefinition();
  workflows.set(builtIn.id, builtIn);

  for (const entry of fs.readdirSync(getWorkflowsDir(), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const workflow = loadWorkflowFile(path.join(getWorkflowsDir(), entry.name));
    if (workflow) workflows.set(workflow.id, workflow);
  }

  return [...workflows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function getDefaultWorkflowDefinition(): WorkflowDefinition {
  return getWorkflowDefinition(BUILTIN_MRD_TO_CODE_WORKFLOW_ID);
}

export function getWorkflowDefinition(workflowId: string): WorkflowDefinition {
  ensureWorkflowsDir();
  const workflowPath = getWorkflowPath(workflowId);
  const stored = loadWorkflowFile(workflowPath);
  if (stored) return stored;

  if (workflowId === BUILTIN_MRD_TO_CODE_WORKFLOW_ID) {
    return createBuiltInMrdToCodeWorkflow({
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    });
  }

  throw new Error(`Workflow '${workflowId}' not found`);
}

export function saveWorkflowDefinition(
  workflow: WorkflowDefinition
): WorkflowValidationResult {
  const validation = validateWorkflowDefinition(workflow);
  if (!validation.valid) return validation;

  ensureWorkflowsDir();
  fs.writeFileSync(
    getWorkflowPath(workflow.id),
    JSON.stringify(workflow, null, 2),
    'utf-8'
  );
  return validation;
}

export function updateDefaultWorkflowConfig(
  patch: WorkflowConfigPatch
): WorkflowDefinition {
  const workflow = getDefaultWorkflowDefinition();
  const now = new Date().toISOString();
  const next: WorkflowDefinition = {
    ...workflow,
    updatedAt: now,
    globalConfig: {
      ...workflow.globalConfig,
      ...patch.globalConfig,
    },
    nodes: workflow.nodes.map((node) => {
      const nodePatch = patch.nodes?.[node.id];
      if (!nodePatch) return node;
      return {
        ...node,
        data: {
          ...node.data,
          ...nodePatch,
        },
      };
    }),
  };
  const validation = saveWorkflowDefinition(next);
  if (!validation.valid) {
    throw new Error(validation.issues.map((issue) => issue.message).join('; '));
  }
  return next;
}

export function captureWorkflowSnapshot(workflowId: string) {
  const definition = getWorkflowDefinition(workflowId);
  return {
    workflowId: definition.id,
    workflowVersion: definition.version,
    capturedAt: new Date().toISOString(),
    definition,
  };
}

function ensureWorkflowsDir(): void {
  fs.mkdirSync(getWorkflowsDir(), { recursive: true });
}

function getWorkflowPath(workflowId: string): string {
  return path.join(getWorkflowsDir(), `${workflowId}.json`);
}

function loadWorkflowFile(workflowPath: string): WorkflowDefinition | null {
  try {
    if (!fs.existsSync(workflowPath)) return null;
    return JSON.parse(fs.readFileSync(workflowPath, 'utf-8')) as WorkflowDefinition;
  } catch {
    return null;
  }
}
