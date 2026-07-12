import { listManagedApplications } from '../application/applicationService.js';
import type { OpsApplication } from '../agents/ops/types.js';

export function listOpsApplications(workspaceRoot = process.cwd()): OpsApplication[] {
  return listManagedApplications(workspaceRoot).map(app => ({
    appId: app.appId,
    name: app.name,
    root: app.root,
    description: app.description,
    dependencies: app.dependencies,
    apiCount: app.apiCount,
    codeSignals: app.codeSignals,
  }));
}
