import * as path from 'path';

export const APP_KNOWLEDGE_TOOL_RESOURCE_ROOT = path.join(
  process.cwd(),
  'src',
  'tools',
  'knowledge',
  'app-knowledge'
);

export const APP_KNOWLEDGE_TOOL_FILES = [
  'buildSearchDocsMd.ts',
  'kbMerge.ts',
  'kbSplitter.ts',
] as const;

export function getAppKnowledgeToolResourcePath(relativePath: string): string {
  return path.join(APP_KNOWLEDGE_TOOL_RESOURCE_ROOT, relativePath);
}
