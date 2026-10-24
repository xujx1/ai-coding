import {
  getKnowledgeBaseFileContent as readKnowledgeBaseFileContent,
  getKnowledgeBaseFiles as listKnowledgeBaseFiles,
  initAllKnowledgeBases as runInitAllKnowledgeBases,
} from '../../knowledge/index.js';
import type { ApplicationCatalog } from '../../platform-sources/applicationCatalog.js';

export async function initAllKnowledgeBases(c: any, catalog: ApplicationCatalog, knowledgeRoot?: string) {
  try {
    if (!knowledgeRoot) return c.json({ error: 'Knowledge generation is not configured for this profile.' }, 503);
    const body = await c.req.json().catch(() => ({}));
    const appIds = Array.isArray(body?.appIds)
      ? body.appIds.filter((item: unknown): item is string => typeof item === 'string' && item.trim().length > 0)
      : undefined;
    return c.json(await runInitAllKnowledgeBases({ catalog, knowledgeRoot, appIds }));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export function getKnowledgeBaseFiles(c: any, knowledgeRoot?: string) {
  const result = listKnowledgeBaseFiles(c.req.param('knowledgeId'), knowledgeRoot);
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ knowledgeId: result.knowledgeId, tree: result.tree });
}

export function getKnowledgeBaseFileContent(c: any, knowledgeRoot?: string) {
  const result = readKnowledgeBaseFileContent(c.req.param('knowledgeId'), c.req.query('path'), knowledgeRoot);
  if (!result.ok) return c.json({ error: result.error, path: result.path }, result.status);
  return c.json({ path: result.path, content: result.content, size: result.size });
}
