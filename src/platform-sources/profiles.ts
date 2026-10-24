import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RuntimeProfile } from '../config/types.js';
import type { OpsKnowledgeEvidence, OpsLogEvidence, OpsSimilarAlertEvidence } from '../tools/ops/evidence.js';
import { FileOpsAnalysisHistoryRepository, InMemoryOpsAnalysisHistoryRepository, type OpsAnalysisHistoryRepository } from '../app-ops/history.js';
import { InMemoryApplicationCatalog, type ApplicationCatalog, type CatalogApplication } from './applicationCatalog.js';
import { DirectoryRequirementSource, InMemoryRequirementSource, type RequirementSource } from './requirementSource.js';
import { InMemoryTestingRepositoryResolver, type TestingRepositoryResolver } from './testingRepositoryResolver.js';
import {
  DirectoryAlertHistoryRepository,
  DirectoryKnowledgeEvidenceProvider,
  DirectoryLogEvidenceProvider,
  UnavailableEvidenceProvider,
  type AlertHistoryRepository,
  type KnowledgeEvidenceProvider,
  type LogEvidenceProvider,
} from './opsEvidenceProviders.js';
import { getStorageMetrics } from '../storage/metrics.js';

/** Explicit profile composition. Production is intentionally empty until managed sources are configured. */
export interface PlatformSources {
  applications: ApplicationCatalog;
  requirements: RequirementSource;
  testingRepositories: TestingRepositoryResolver;
  logEvidence: LogEvidenceProvider<OpsLogEvidence>;
  knowledgeEvidence: KnowledgeEvidenceProvider<OpsKnowledgeEvidence>;
  alertHistory: AlertHistoryRepository<OpsSimilarAlertEvidence>;
  knowledgeRoot?: string;
  analysisHistory: OpsAnalysisHistoryRepository;
  profile: RuntimeProfile;
}

export function createPlatformSources(profile: RuntimeProfile, workspaceRoot = process.cwd()): PlatformSources {
  if (profile !== 'ecom-demo') {
    // Production must not fall back to Demo. Keep a zero-valued metric visible
    // to distinguish that invariant from a missing metric series.
    getStorageMetrics().increment('storage_prohibited_demo_fallback_total', 0);
    return {
      profile, applications: new InMemoryApplicationCatalog(), requirements: new InMemoryRequirementSource(),
      testingRepositories: new InMemoryTestingRepositoryResolver(),
      logEvidence: new UnavailableEvidenceProvider('Log evidence provider is not configured.'),
      knowledgeEvidence: new UnavailableEvidenceProvider('Knowledge evidence provider is not configured.'),
      alertHistory: new UnavailableEvidenceProvider('Alert history repository is not configured.'),
      knowledgeRoot: undefined,
      analysisHistory: new InMemoryOpsAnalysisHistoryRepository(),
    };
  }
  const root = path.join(workspaceRoot, 'demo', 'ecom');
  const integrationRoot = path.join(root, 'ecom-integration-tests');
  const testingRepositories = fs.existsSync(path.join(integrationRoot, 'package.json'))
    ? new InMemoryTestingRepositoryResolver([{
      repositoryId: 'ecom-demo-integration', root: integrationRoot, repositoryType: 'integration',
      commands: { start: '../scripts/start-all.sh', seed: 'npm run seed', test: 'npm run test:live' },
      capabilities: ['http', 'integration'],
    }])
    : new InMemoryTestingRepositoryResolver();
  return {
    profile,
    applications: new InMemoryApplicationCatalog(readDemoApplications(root)),
    requirements: new DirectoryRequirementSource(path.join(workspaceRoot, 'demo', 'mrd')),
    testingRepositories,
    // Directory-backed adapters are a deliberate ecom-demo-only composition.
    logEvidence: new DirectoryLogEvidenceProvider(root),
    knowledgeEvidence: new DirectoryKnowledgeEvidenceProvider(root),
    alertHistory: new DirectoryAlertHistoryRepository(root),
    knowledgeRoot: path.join(root, 'spaces', 'knowledge', 'knowledge-base'),
    analysisHistory: new FileOpsAnalysisHistoryRepository(root),
  };
}

function readDemoApplications(root: string): CatalogApplication[] {
  const registry = path.join(root, '.git-service', 'repositories.json');
  if (!fs.existsSync(registry)) return readTrackedDemoApplicationManifest(root);
  try {
    const value = JSON.parse(fs.readFileSync(registry, 'utf8')) as { repositories?: Array<Record<string, unknown>> };
    return (value.repositories ?? []).flatMap(repository => {
      if (repository.implementationApp === false || repository.repositoryType === 'testing') return [];
      if (typeof repository.repoId !== 'string' || typeof repository.root !== 'string') return [];
      return [{
        appId: typeof repository.appId === 'string' ? repository.appId : repository.repoId,
        repoId: repository.repoId,
        name: typeof repository.name === 'string' ? repository.name : repository.repoId,
        root: repository.root,
        dependencies: [],
        provider: typeof repository.provider === 'string' ? repository.provider : 'ecom-demo',
        remoteUrl: typeof repository.remoteUrl === 'string' ? repository.remoteUrl : undefined,
        defaultBranch: typeof repository.defaultBranch === 'string' ? repository.defaultBranch : undefined,
      }];
    });
  } catch { return []; }
}

/** A clean checkout does not contain the generated .git-service registry. */
function readTrackedDemoApplicationManifest(root: string): CatalogApplication[] {
  const manifest = path.join(root, '.workflow', 'apps.json');
  if (!fs.existsSync(manifest)) return [];
  try {
    const value = JSON.parse(fs.readFileSync(manifest, 'utf8')) as {
      apps?: Array<{ appId?: unknown; repoPath?: unknown }>;
    };
    return (value.apps ?? []).flatMap(application => {
      if (typeof application.appId !== 'string') return [];
      const directoryName = typeof application.repoPath === 'string'
        ? path.basename(application.repoPath)
        : application.appId;
      const applicationRoot = path.join(root, directoryName);
      if (!fs.existsSync(applicationRoot)) return [];
      return [{
        appId: application.appId,
        repoId: application.appId,
        name: application.appId,
        root: applicationRoot,
        dependencies: [],
        provider: 'ecom-demo-manifest',
        defaultBranch: 'main',
      }];
    });
  } catch { return []; }
}
