import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { initAllAppKnowledge } from '../knowledge/initAllAppKnowledge.js';
import { InMemoryApplicationCatalog } from '../platform-sources/applicationCatalog.js';

test('initAllAppKnowledge writes app and global knowledge repository structure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'init-all-app-knowledge-'));
  const ecomRoot = path.join(root, 'ecom');
  const knowledgeRoot = path.join(root, 'knowledge-base');
  const gitNexusHome = path.join(root, 'gitnexus-home');
  const gitNexusBinPath = createFakeGitNexus(root);

  createApp(ecomRoot, 'console', {
    domainName: '控制台',
    capabilities: ['后台操作入口'],
    owns: ['运营控制台'],
    sampleRoutes: ['/api/console/dashboard'],
  });
  createApp(ecomRoot, 'ecom-product', {
    domainName: '商品域',
    capabilities: ['商品上架', '商品查询'],
    owns: ['商品', '类目'],
    upstreamDependencies: ['merchant'],
    sampleRoutes: ['/api/products', '/api/products/publish'],
  });
  createApp(ecomRoot, 'ecom-merchant', {
    domainName: '商家域',
    capabilities: ['商家入驻'],
    owns: ['商家'],
    sampleRoutes: ['/api/merchants'],
  });

  const result = await initAllAppKnowledge({
    catalog: new InMemoryApplicationCatalog(['console', 'ecom-product', 'ecom-merchant'].map(appId => ({
      appId, repoId: appId, name: appId, root: path.join(ecomRoot, appId), dependencies: appId === 'ecom-product' ? ['ecom-merchant'] : [],
    }))),
    repositoryBaseRoot: ecomRoot,
    knowledgeRoot,
    gitNexusHome,
    gitNexusBinPath,
    knowledgeProvider: 'template',
    now: new Date('2026-07-11T10:20:30.000Z'),
  });

  assert.equal(result.versionId, 'kb-20260711T102030Z');
  assert.equal(result.appCount, 3);
  assert.equal(result.gitNexusIndexed, 3);
  assert.equal(result.gitNexusFailed, 0);
  assert.equal(result.apps.find(app => app.appId === 'ecom-product')?.generationMode, 'template');

  assertFileIncludes(
    path.join(knowledgeRoot, 'apps', 'ecom-product', 'app-knowledge-base', 'CONTEXT.md'),
    ['App ID: ecom-product', 'GitNexus: indexed (7 nodes, 9 edges, 2 flows)'],
  );
  assertFileIncludes(
    path.join(knowledgeRoot, 'apps', 'ecom-product', 'app-knowledge-base', 'api-index.md'),
    ['/api/products/publish'],
  );
  assertFileIncludes(
    path.join(knowledgeRoot, 'global', 'GLOBAL_CONTEXT.md'),
    ['Applications: 3', 'ecom-product -> ecom-merchant'],
  );
  assert.equal(fs.existsSync(path.join(ecomRoot, 'ecom-product', '.gitnexus')), false);
  assertFileIncludes(
    path.join(knowledgeRoot, 'global', 'gitnexus-indexes', 'ecom-product', 'gitnexus.json'),
    ['"nodes": 7'],
  );

  const appsRegistry = JSON.parse(fs.readFileSync(path.join(knowledgeRoot, 'registry', 'apps.json'), 'utf-8')) as {
    apps: Array<{ appId: string; knowledgeRepo: { kbPath: string } }>;
  };
  assert.deepEqual(appsRegistry.apps.map(app => app.appId), ['console', 'ecom-merchant', 'ecom-product']);
  assert.equal(appsRegistry.apps.find(app => app.appId === 'ecom-product')?.knowledgeRepo.kbPath, 'apps/ecom-product/app-knowledge-base');

  const report = JSON.parse(fs.readFileSync(path.join(knowledgeRoot, 'global', 'init-report.json'), 'utf-8')) as {
    versionId: string;
    generatedFiles: string[];
  };
  assert.equal(report.versionId, result.versionId);
  assert.ok(report.generatedFiles.includes('global/gitnexus-graph/capability-to-code-map.json'));
  assert.equal(result.apps.find(app => app.appId === 'ecom-product')?.gitNexus.indexPath, path.join(knowledgeRoot, 'global', 'gitnexus-indexes', 'ecom-product'));
});

function createApp(ecomRoot: string, appId: string, domain: Record<string, unknown>): void {
  const appRoot = path.join(ecomRoot, appId);
  fs.mkdirSync(path.join(appRoot, 'knowledge'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'src', 'main', 'java', 'com', 'example'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'src', 'main', 'resources'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'knowledge', 'domain-context.json'), `${JSON.stringify({
    domain: appId.replace(/^ecom-/, ''),
    serviceName: appId,
    summary: `${appId} summary`,
    requirementKeywords: ['知识库初始化'],
    ...domain,
  }, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(path.join(appRoot, 'docs', 'openapi.json'), `${JSON.stringify({
    paths: Object.fromEntries(((domain.sampleRoutes as string[] | undefined) ?? []).map(route => [route, {}])),
  }, null, 2)}\n`, 'utf-8');
  fs.writeFileSync(
    path.join(appRoot, 'src', 'main', 'java', 'com', 'example', 'DemoController.java'),
    'class DemoController { void handle() {} }\n',
    'utf-8',
  );
  fs.writeFileSync(
    path.join(appRoot, 'src', 'main', 'resources', 'schema.sql'),
    `CREATE TABLE IF NOT EXISTS ${appId.replace(/-/g, '_')}_demo (id BIGINT);\n`,
    'utf-8',
  );
}

function createFakeGitNexus(root: string): string {
  const binPath = path.join(root, 'fake-gitnexus.js');
  fs.writeFileSync(binPath, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const repoRoot = process.argv[process.argv.length - 1];
const indexPath = path.join(repoRoot, '.gitnexus');
fs.mkdirSync(indexPath, { recursive: true });
fs.writeFileSync(path.join(indexPath, 'gitnexus.json'), JSON.stringify({
  indexedAt: '2026-07-11T10:20:31.000Z',
  stats: { files: 3, nodes: 7, edges: 9, communities: 1, processes: 2, embeddings: 0 }
}, null, 2));
`, 'utf-8');
  fs.chmodSync(binPath, 0o755);
  return binPath;
}

function assertFileIncludes(file: string, values: string[]): void {
  const content = fs.readFileSync(file, 'utf-8');
  for (const value of values) {
    assert.ok(content.includes(value), `${file} should include ${value}`);
  }
}
