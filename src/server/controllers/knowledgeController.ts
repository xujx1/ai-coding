import {
  getKnowledgeBaseFileContent as readKnowledgeBaseFileContent,
  getKnowledgeBaseFiles as listKnowledgeBaseFiles,
  initAllKnowledgeBases as runInitAllKnowledgeBases,
} from '../../knowledge/index.js';

export async function initAllKnowledgeBases(c: any) {
  try {
    return c.json(await runInitAllKnowledgeBases());
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export function getKnowledgeBaseFiles(c: any) {
  const result = listKnowledgeBaseFiles(c.req.param('knowledgeId'));
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ knowledgeId: result.knowledgeId, tree: result.tree });
}

export function getKnowledgeBaseFileContent(c: any) {
  const result = readKnowledgeBaseFileContent(c.req.param('knowledgeId'), c.req.query('path'));
  if (!result.ok) return c.json({ error: result.error, path: result.path }, result.status);
  return c.json({ path: result.path, content: result.content, size: result.size });
}
