import { listManagedApplications } from '../application/applicationService.js';
import type { OpsApplication } from '../agents/ops/types.js';
import { InMemoryApplicationCatalog, type ApplicationCatalog } from '../platform-sources/applicationCatalog.js';

export function listOpsApplications(catalog: ApplicationCatalog | string = new InMemoryApplicationCatalog()): OpsApplication[] {
  // A legacy workspace-root argument no longer triggers repository discovery.
  if (typeof catalog === 'string') return [];
  return listManagedApplications(catalog).map(app => ({
    appId: app.appId,
    name: app.name,
    root: app.root,
    description: app.description,
    dependencies: app.dependencies,
    apiCount: app.apiCount,
    codeSignals: app.codeSignals,
  }));
}
