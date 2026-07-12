import * as path from 'path';

export const APP_KNOWLEDGE_AGENT_RESOURCE_ROOT = path.join(
  process.cwd(),
  'prompts',
  'agents',
  'knowledge',
  'app-knowledge-agent'
);

export const APP_KNOWLEDGE_AGENT_PROMPT_FILES = [
  'app-knowledge-agent.md',
  'assets/checkpoints.md',
  'assets/step2-code-scan.md',
  'assets/step3-db-scan.md',
  'assets/doc-templates.md',
] as const;

export function getAppKnowledgeAgentResourcePath(relativePath: string): string {
  return path.join(APP_KNOWLEDGE_AGENT_RESOURCE_ROOT, relativePath);
}
