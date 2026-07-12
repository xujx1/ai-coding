import {
  downloadApplicationRepository as createApplicationRepositoryDownload,
  getManagementOverview as buildManagementOverviewResponse,
} from '../../application/index.js';

export function getManagementOverview(c: any) {
  return c.json(buildManagementOverviewResponse());
}

export function downloadApplicationRepository(c: any) {
  const appId = c.req.param('appId');
  const result = createApplicationRepositoryDownload(appId);
  if (!result.ok) {
    return c.json({ error: result.error, root: result.root }, result.status);
  }

  const encodedFileName = encodeURIComponent(result.fileName);
  c.header('Content-Type', 'application/zip');
  c.header('Content-Disposition', `attachment; filename="repository-code.zip"; filename*=UTF-8''${encodedFileName}`);
  c.header('Content-Length', String(result.zipBuffer.length));
  return c.body(result.zipBuffer);
}
