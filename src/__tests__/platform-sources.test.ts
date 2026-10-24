import * as assert from 'assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { DatabaseApplicationCatalog, InMemoryApplicationCatalog, ManifestDirectoryApplicationCatalog } from '../platform-sources/applicationCatalog.js';
import { DatabaseRequirementSource, DirectoryRequirementSource, InMemoryRequirementSource, UnavailableRequirementSource } from '../platform-sources/requirementSource.js';
import { createPlatformSources } from '../platform-sources/profiles.js';
import { InMemoryTestingRepositoryResolver } from '../platform-sources/testingRepositoryResolver.js';
import { DirectoryAlertHistoryRepository, DirectoryKnowledgeEvidenceProvider, DirectoryLogEvidenceProvider, InMemoryAlertHistoryRepository, InMemoryEvidenceProvider, UnavailableEvidenceProvider } from '../platform-sources/opsEvidenceProviders.js';
import { getRequirementFileContent, getRequirementFiles } from '../requirements/requirementService.js';
import { listManagedApplications } from '../application/applicationService.js';
import { listOpsApplications } from '../app-ops/applications.js';
import type { OpsKnowledgeEvidence, OpsLogEvidence, OpsSimilarAlertEvidence } from '../tools/ops/evidence.js';
import { runOpsFaultAnalysisWorkflow } from '../workflows/runtime/ops/opsFaultAnalysisRunner.js';
import { analyzeOpsAlert, streamOpsAlertAnalysis } from '../app-ops/analysis.js';
import { FileOpsAnalysisHistoryRepository, InMemoryOpsAnalysisHistoryRepository } from '../app-ops/history.js';
import { runKnowledgeRepositoryScanAgent } from '../agents/knowledge/repositoryScanAgent.js';
import { runLocalLogTraceAgent, runAppKnowledgeAgent, runSimilarAlertAgent } from '../agents/ops/index.js';
import { generateProjectManifest } from '../agents/codegen/upload-init.js';
import { ensureRunDirectories, getRunPaths } from '../runtime/paths.js';

test('application catalogs are explicit and return no implicit bundled applications', () => {
  assert.deepEqual(new InMemoryApplicationCatalog().list(), []);
  const database = new DatabaseApplicationCatalog(() => [{ appId: 'orders', repoId: 'orders-repo', name: 'Orders', root: '/repos/orders', dependencies: ['catalog'] }]);
  assert.equal(database.find('orders')?.repoId, 'orders-repo');
});

test('directory and in-memory requirement sources isolate configured data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'requirements-source-'));
  fs.writeFileSync(path.join(root, 'one.md'), '# One\nBody\n');
  const directory = new DirectoryRequirementSource(root);
  assert.deepEqual(directory.list().map(item => item.id), ['one']);
  assert.equal(directory.read('one', 'one.md'), '# One\nBody\n');
  assert.equal(directory.read('one', '../secret'), undefined);
  const memory = new InMemoryRequirementSource([{ id: 'two', name: 'Two', updatedAt: new Date().toISOString(), paths: ['two.md'], files: { 'two.md': '# Two' } }]);
  assert.equal(memory.read('two', 'two.md'), '# Two');
  const database = new DatabaseRequirementSource(() => memory.list(), (id, file) => memory.read(id, file));
  assert.equal(database.read('two', 'two.md'), '# Two');
  assert.equal(new UnavailableRequirementSource('offline').availability().available, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('manifest directory catalog does not infer entries outside its manifest', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'application-catalog-'));
  fs.writeFileSync(path.join(root, 'catalog.json'), JSON.stringify({ applications: [{ appId: 'catalog', repoId: 'catalog-repo', name: 'Catalog', root: './catalog', dependencies: [] }] }));
  const catalog = new ManifestDirectoryApplicationCatalog(path.join(root, 'catalog.json'));
  assert.equal(catalog.list()[0]?.root, path.join(root, 'catalog'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('project manifest uses its injected application catalog instead of an implicit Demo root', () => {
  const applicationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-project-'));
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'catalog-runtime-'));
  const originalRuntimeDir = process.env.RUNTIME_DIR;
  const runId = `catalog-manifest-${Date.now()}`;
  try {
    fs.writeFileSync(path.join(applicationRoot, 'package.json'), '{"name":"orders"}\n');
    process.env.RUNTIME_DIR = runtimeRoot;
    const paths = ensureRunDirectories(runId);
    const catalog = new InMemoryApplicationCatalog([{
      appId: 'orders', repoId: 'orders-repo', name: 'Orders', root: applicationRoot,
      description: 'Configured orders application', dependencies: ['catalog'],
    }]);

    const manifest = generateProjectManifest(paths, catalog);

    assert.deepEqual(manifest.projects.map(project => ({
      name: project.name, appId: project.appId, dependencies: project.dependencies, source: project.source,
    })), [{
      name: 'orders', appId: 'orders', dependencies: ['catalog'], source: 'application-management',
    }]);
    assert.ok(fs.existsSync(path.join(getRunPaths(runId).projectDir, 'orders', '.ai-coding-app.json')));
  } finally {
    if (originalRuntimeDir === undefined) delete process.env.RUNTIME_DIR;
    else process.env.RUNTIME_DIR = originalRuntimeDir;
    fs.rmSync(applicationRoot, { recursive: true, force: true });
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('knowledge repository scan requires an explicit application catalog', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-catalog-'));
  fs.writeFileSync(path.join(root, 'service.ts'), "app.get('/health')\n");
  const catalog = new InMemoryApplicationCatalog([{
    appId: 'catalog-app', repoId: 'catalog-app', name: 'Catalog app', root, dependencies: [],
  }]);
  const result = await runKnowledgeRepositoryScanAgent({ catalog, repositoryBaseRoot: path.dirname(root), maxSourceFiles: 10 });
  assert.ok(result.data);
  assert.equal(result.data.scans[0]?.appId, 'catalog-app');
  assert.equal(result.data.scans[0]?.relativeRoot, path.basename(root));
  fs.rmSync(root, { recursive: true, force: true });
});

test('production profile never discovers Demo sources while ecom-demo opts in explicitly', (t) => {
  const production = createPlatformSources('production');
  assert.deepEqual(production.applications.list(), []);
  assert.deepEqual(production.requirements.list(), []);
  if (!fs.existsSync(path.join(process.cwd(), 'demo'))) {
    t.skip('explicit Demo assets are unavailable in this production-only checkout');
    return;
  }
  const demo = createPlatformSources('ecom-demo');
  assert.ok(demo.applications.list().length > 0);
  assert.ok(demo.requirements.list().length > 0);
  assert.ok(demo.testingRepositories.resolve({ requirementId: 'req', applicationIds: [] }));
  assert.equal(demo.logEvidence.availability().available, true);
  assert.equal(demo.knowledgeEvidence.availability().available, true);
  assert.equal(demo.alertHistory.availability().available, true);
  assert.ok(demo.analysisHistory instanceof FileOpsAnalysisHistoryRepository);
});

test('ecom-demo profile end-to-end exposes only its configured application, requirement, testing, and Ops sources', async (t) => {
  if (!fs.existsSync(path.join(process.cwd(), 'demo'))) {
    t.skip('explicit Demo assets are unavailable in this production-only checkout');
    return;
  }
  const sources = createPlatformSources('ecom-demo');
  const applications = listManagedApplications(sources.applications);
  const requirements = sources.requirements.list();
  assert.ok(applications.length > 0, 'the explicit Demo catalog must expose applications');
  assert.ok(requirements.length > 0, 'the explicit Demo requirement source must expose MRDs');
  assert.equal(listOpsApplications(sources.applications).length, applications.length);

  const requirement = requirements[0]!;
  const requirementFile = requirement.paths[0]!;
  const content = getRequirementFileContent(requirement.id, requirementFile, sources.requirements);
  assert.equal(content.ok, true);
  if (content.ok) assert.ok(content.content.length > 0);

  const testingRepository = sources.testingRepositories.resolve({
    requirementId: requirement.id,
    applicationIds: applications.map(application => application.appId),
  });
  assert.ok(testingRepository, 'the Demo testing repository must be resolved explicitly');
  assert.ok(testingRepository?.commands.test);

  const opsResult = await runOpsFaultAnalysisWorkflow({
    app: listOpsApplications(sources.applications)[0]!,
    applications: listOpsApplications(sources.applications),
    alert: 'ecom demo timeout', workspaceRoot: process.cwd(),
    workflowConfig: { enabledNodeIds: ['local-log-trace'] },
    evidenceSources: {
      logEvidence: sources.logEvidence,
      knowledgeEvidence: sources.knowledgeEvidence,
      alertHistory: sources.alertHistory,
    },
  });
  const logTrace = opsResult.analysis.toolResults.find(result => result.nodeId === 'local-log-trace');
  assert.ok(logTrace, 'the configured Ops log provider must be used by the Demo workflow');
  assert.doesNotMatch(logTrace.output, /no local fallback was used/);
});

test('testing repository resolution is scoped by application and returns explicit absence', () => {
  const resolver = new InMemoryTestingRepositoryResolver([{
    repositoryId: 'integration', root: '/tmp/integration', repositoryType: 'integration',
    commands: { test: 'npm run test' }, capabilities: ['http'], applicationIds: ['orders'],
  }]);
  assert.equal(resolver.resolve({ requirementId: 'req', applicationIds: ['orders'] })?.repositoryId, 'integration');
  assert.equal(resolver.resolve({ requirementId: 'req', applicationIds: ['payments'] }), null);
});

test('Ops evidence providers expose availability instead of substituting local example evidence', async () => {
  const logs = new InMemoryEvidenceProvider([{ path: 'managed/log', score: 1 }]);
  assert.deepEqual(await logs.search({ appId: 'orders', alert: 'timeout' }), [{ path: 'managed/log', score: 1 }]);
  const history = new InMemoryAlertHistoryRepository([{ id: 'previous' }]);
  assert.deepEqual(await history.findSimilar('timeout'), [{ id: 'previous' }]);
  assert.deepEqual(new UnavailableEvidenceProvider('not configured').availability(), { available: false, reason: 'not configured' });
});

test('directory Ops providers are explicit and report unavailable fixture roots', () => {
  const root = path.join(os.tmpdir(), `missing-ops-source-${Date.now()}`);
  assert.equal(new DirectoryLogEvidenceProvider(root).availability().available, false);
  assert.equal(new DirectoryKnowledgeEvidenceProvider(root).availability().available, false);
  assert.equal(new DirectoryAlertHistoryRepository(root).availability().available, false);
});

test('Ops workflow reads configured evidence providers and does not infer an application parent directory', async () => {
  const result = await runOpsFaultAnalysisWorkflow({
    app: { appId: 'orders', name: 'Orders', root: '/not/a/demo/root/orders', dependencies: [], apiCount: 0, codeSignals: [] },
    applications: [], alert: 'orders timeout', workspaceRoot: process.cwd(),
    workflowConfig: { enabledNodeIds: ['similar-alert', 'local-log-trace', 'app-knowledge'] },
    evidenceSources: {
      logEvidence: new InMemoryEvidenceProvider([{ path: 'managed/log', reason: 'managed log' }]),
      knowledgeEvidence: new InMemoryEvidenceProvider([{ path: 'managed/knowledge', source: 'knowledge-base' as const, reason: 'managed knowledge' }]),
      alertHistory: new InMemoryAlertHistoryRepository([{ path: 'managed/history', reason: 'managed history' }]),
    },
  });
  assert.deepEqual(result.analysis.logEvidence, [{ path: 'managed/log', reason: 'managed log' }]);
  assert.deepEqual(result.analysis.knowledgeEvidence, [{ path: 'managed/knowledge', source: 'knowledge-base', reason: 'managed knowledge' }]);
  assert.deepEqual(result.analysis.similarAlertEvidence, [{ path: 'managed/history', reason: 'managed history' }]);
});

test('Ops workflow records unavailable evidence sources without a local Demo fallback', async () => {
  const logUnavailable = new UnavailableEvidenceProvider<OpsLogEvidence>('managed evidence is offline');
  const knowledgeUnavailable = new UnavailableEvidenceProvider<OpsKnowledgeEvidence>('managed evidence is offline');
  const historyUnavailable = new UnavailableEvidenceProvider<OpsSimilarAlertEvidence>('managed evidence is offline');
  const result = await runOpsFaultAnalysisWorkflow({
    app: { appId: 'orders', name: 'Orders', root: process.cwd(), dependencies: [], apiCount: 0, codeSignals: [] },
    applications: [], alert: 'orders timeout', workspaceRoot: process.cwd(),
    workflowConfig: { enabledNodeIds: ['similar-alert', 'local-log-trace', 'app-knowledge'] },
    evidenceSources: { logEvidence: logUnavailable, knowledgeEvidence: knowledgeUnavailable, alertHistory: historyUnavailable },
  });
  assert.deepEqual(result.analysis.logEvidence, []);
  assert.match(result.analysis.toolResults.find(item => item.nodeId === 'local-log-trace')?.output ?? '', /unavailable: managed evidence is offline/);
  assert.match(result.analysis.toolResults.find(item => item.nodeId === 'app-knowledge')?.output ?? '', /no local fallback was used/);
});

test('Ops evidence agents use injected providers directly', async () => {
  const logs = new InMemoryEvidenceProvider<OpsLogEvidence>([{ path: 'managed/log', reason: 'managed' }]);
  const knowledge = new InMemoryEvidenceProvider<OpsKnowledgeEvidence>([{ path: 'managed/kb', source: 'knowledge-base', reason: 'managed' }]);
  const history = new InMemoryAlertHistoryRepository<OpsSimilarAlertEvidence>([{ path: 'managed/history', reason: 'managed' }]);
  assert.equal((await runLocalLogTraceAgent({ provider: logs, appId: 'orders', classification: { codeHints: [] }, alert: 'timeout' })).data?.length, 1);
  assert.equal((await runAppKnowledgeAgent({ provider: knowledge, appId: 'orders', classification: { codeHints: [] }, alert: 'timeout' })).data?.length, 1);
  assert.equal((await runSimilarAlertAgent({ provider: history, alert: 'timeout' })).data?.length, 1);
});

test('Ops analyses persist history only through the configured repository', async () => {
  const catalog = new InMemoryApplicationCatalog([{
    appId: 'orders', repoId: 'orders', name: 'Orders', root: process.cwd(), dependencies: [],
  }]);
  const history = new InMemoryOpsAnalysisHistoryRepository();
  const evidenceSources = {
    logEvidence: new InMemoryEvidenceProvider<OpsLogEvidence>(),
    knowledgeEvidence: new InMemoryEvidenceProvider<OpsKnowledgeEvidence>(),
    alertHistory: new InMemoryAlertHistoryRepository<OpsSimilarAlertEvidence>(),
  };
  await analyzeOpsAlert({
    appId: 'orders', alert: 'orders timeout', catalog, evidenceSources, analysisHistory: history,
    workflowConfig: { enabledNodeIds: [] },
  });
  assert.equal((await history.list()).length, 1);
  assert.deepEqual((await history.list())[0]?.vector, { orders: 1, timeout: 1 });

  for await (const _event of streamOpsAlertAnalysis({
    appId: 'orders', alert: 'orders unavailable', catalog, evidenceSources, analysisHistory: history,
    workflowConfig: { enabledNodeIds: [] },
  })) { /* consume the configured stream */ }
  assert.equal((await history.list()).length, 2);
});

test('requirement file APIs read only the explicitly supplied source', () => {
  const source = new InMemoryRequirementSource([{
    id: 'configured-requirement', name: 'Configured requirement', updatedAt: new Date().toISOString(),
    paths: ['nested/requirement.md'], files: { 'nested/requirement.md': '# Configured\n' },
  }]);
  const files = getRequirementFiles('configured-requirement', source);
  assert.equal(files.ok, true);
  if (files.ok) assert.deepEqual(files.tree, [{
    name: 'nested', path: 'nested', type: 'directory', children: [{
      name: 'requirement.md', path: 'nested/requirement.md', type: 'file', size: 13, modified: (files.tree as any)[0].children[0].modified,
    }],
  }]);
  const content = getRequirementFileContent('configured-requirement', 'nested/requirement.md', source);
  assert.deepEqual(content, { ok: true, path: 'nested/requirement.md', content: '# Configured\n', size: 13 });
  assert.equal(getRequirementFiles('configured-requirement').ok, false);
  assert.equal(getRequirementFiles('configured-requirement', new UnavailableRequirementSource('offline')).ok, false);
});
