import * as fs from 'node:fs';
import * as path from 'node:path';

/** A configured application/repository registry; it never discovers bundled examples. */
export interface CatalogApplication {
  appId: string;
  repoId: string;
  name: string;
  root: string;
  description?: string;
  dependencies: string[];
  provider?: string;
  remoteUrl?: string;
  defaultBranch?: string;
}

export interface ApplicationCatalog {
  list(): CatalogApplication[];
  find(appId: string): CatalogApplication | undefined;
}

export class InMemoryApplicationCatalog implements ApplicationCatalog {
  constructor(private readonly applications: readonly CatalogApplication[] = []) {}

  list(): CatalogApplication[] { return this.applications.map(application => ({ ...application, dependencies: [...application.dependencies] })); }
  find(appId: string): CatalogApplication | undefined { return this.list().find(application => application.appId === appId); }
}

/** Adapter boundary for database-backed catalogs; SQL ownership stays in the composition layer. */
export class DatabaseApplicationCatalog implements ApplicationCatalog {
  constructor(private readonly load: () => CatalogApplication[]) {}
  list(): CatalogApplication[] { return this.load().map(application => ({ ...application, dependencies: [...application.dependencies] })); }
  find(appId: string): CatalogApplication | undefined { return this.list().find(application => application.appId === appId); }
}

/** Directory-backed catalog for explicitly supplied local manifests (including Demo). */
export class ManifestDirectoryApplicationCatalog implements ApplicationCatalog {
  constructor(private readonly manifestPath: string) {}

  list(): CatalogApplication[] {
    if (!fs.existsSync(this.manifestPath)) return [];
    const parsed = JSON.parse(fs.readFileSync(this.manifestPath, 'utf8')) as unknown;
    const applications = Array.isArray(parsed) ? parsed : isObject(parsed) && Array.isArray(parsed.applications) ? parsed.applications : [];
    return applications.flatMap(value => normalize(value, path.dirname(this.manifestPath)) ? [normalize(value, path.dirname(this.manifestPath))!] : []);
  }

  find(appId: string): CatalogApplication | undefined { return this.list().find(application => application.appId === appId); }
}

function normalize(value: unknown, baseDir: string): CatalogApplication | undefined {
  if (!isObject(value) || typeof value.appId !== 'string' || typeof value.repoId !== 'string' || typeof value.name !== 'string' || typeof value.root !== 'string') return undefined;
  return {
    appId: value.appId, repoId: value.repoId, name: value.name,
    root: path.resolve(baseDir, value.root), description: typeof value.description === 'string' ? value.description : undefined,
    dependencies: Array.isArray(value.dependencies) ? value.dependencies.filter((item): item is string => typeof item === 'string') : [],
    provider: typeof value.provider === 'string' ? value.provider : undefined,
    remoteUrl: typeof value.remoteUrl === 'string' ? value.remoteUrl : undefined,
    defaultBranch: typeof value.defaultBranch === 'string' ? value.defaultBranch : undefined,
  };
}

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null; }
