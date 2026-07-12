import * as path from 'path';

export const KNOWLEDGE_APP_WORKFLOW_RESOURCE_ROOT = path.join(
  process.cwd(),
  'src',
  'workflows',
  'definitions',
  'knowledge-app-workflow'
);

export const KNOWLEDGE_APP_WORKFLOW_FILES = [
  'workflow-and-constraints.md',
] as const;

export function getKnowledgeAppWorkflowResourcePath(relativePath: string): string {
  return path.join(KNOWLEDGE_APP_WORKFLOW_RESOURCE_ROOT, relativePath);
}
