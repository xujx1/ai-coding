import {
  downloadApplicationRepository as createApplicationRepositoryDownload,
  getManagementOverview as buildLocalManagementOverviewResponse,
  getManagementOverviewFromSource,
  type ManagementRunSource,
} from '../../application/index.js';
import { InMemoryApplicationCatalog, type ApplicationCatalog } from '../../platform-sources/applicationCatalog.js';
import { InMemoryRequirementSource, type RequirementSource } from '../../platform-sources/requirementSource.js';

export async function getManagementOverview(c: any, catalog: ApplicationCatalog = new InMemoryApplicationCatalog(), requirementSource: RequirementSource = new InMemoryRequirementSource(), knowledgeRoot?: string, runs?: ManagementRunSource) {
  const overview = runs
    ? await getManagementOverviewFromSource(catalog, requirementSource, knowledgeRoot, runs)
    : await Promise.resolve(buildLocalManagementOverviewResponse(catalog, requirementSource, knowledgeRoot));
  return c.json(overview);
}

export function downloadApplicationRepository(c: any, catalog: ApplicationCatalog = new InMemoryApplicationCatalog()) {
  const appId = c.req.param('appId');
  const result = createApplicationRepositoryDownload(appId, catalog);
  if (!result.ok) {
    return c.json({ error: result.error, root: result.root }, result.status);
  }

  const encodedFileName = encodeURIComponent(result.fileName);
  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="repository-code.zip"; filename*=UTF-8''${encodedFileName}`);
  c.header('Content-Length', String(result.zipBuffer.length));
  return c.body(result.zipBuffer);
}
