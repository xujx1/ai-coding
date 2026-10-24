import {
  getRequirementFileContent as readRequirementFileContent,
  getRequirementFiles as listRequirementFiles,
} from '../../requirements/index.js';
import { InMemoryRequirementSource, type RequirementSource } from '../../platform-sources/requirementSource.js';

export function getRequirementFiles(c: any, source: RequirementSource = new InMemoryRequirementSource()) {
  const result = listRequirementFiles(c.req.param('requirementId'), source);
  if (!result.ok) return c.json({ error: result.error }, result.status);
  return c.json({ requirementId: result.requirementId, tree: result.tree });
}

export function getRequirementFileContent(c: any, source: RequirementSource = new InMemoryRequirementSource()) {
  const result = readRequirementFileContent(c.req.param('requirementId'), c.req.query('path'), source);
  if (!result.ok) return c.json({ error: result.error, path: result.path }, result.status);
  return c.json({ path: result.path, content: result.content, size: result.size });
}
