import * as fs from 'fs';
import * as path from 'path';
import type { GitNexusAnalyzeResult } from '../../integrations/gitnexus.js';
import type {
  KnowledgeAgentDefinition,
  KnowledgeAgentRunResult,
  KnowledgeGeneratedFile,
  KnowledgeRepositoryScan,
} from './types.js';

export const GLOBAL_KNOWLEDGE_MERGE_AGENT: KnowledgeAgentDefinition = {
  id: 'global-knowledge-merge',
  label: '全局知识合并 Agent',
  description: '汇总应用知识库、依赖图谱、能力地图、API 路由图和业务词汇表。',
  defaultTools: ['read_file', 'write_file', 'knowledge_base_search', 'dependency_graph_search'],
  outputArtifacts: ['global/**', 'registry/**'],
};

export async function runGlobalKnowledgeMergeAgent(args: {
  scans: KnowledgeRepositoryScan[];
  knowledgeRoot: string;
  gitNexusIndexes?: GitNexusAnalyzeResult[];
}): Promise<KnowledgeAgentRunResult<{
  generatedFiles: KnowledgeGeneratedFile[];
}>> {
  const generatedFiles: KnowledgeGeneratedFile[] = [];
  const globalRoot = path.join(args.knowledgeRoot, 'global');
  const registryRoot = path.join(args.knowledgeRoot, 'registry');
  const graphRoot = path.join(globalRoot, 'gitnexus-graph');
  fs.mkdirSync(graphRoot, { recursive: true });
  fs.mkdirSync(registryRoot, { recursive: true });
  const nodes = buildNodes(args.scans, args.gitNexusIndexes ?? []);
  const edges = buildEdges(args.scans);
  generatedFiles.push(writeJson(path.join(graphRoot, 'nodes.json'), nodes, 'Global knowledge graph nodes'));
  generatedFiles.push(writeJson(path.join(graphRoot, 'edges.json'), edges, 'Global knowledge graph edges'));
  generatedFiles.push(writeJson(path.join(graphRoot, 'impact-map.json'), buildImpactMap(args.scans, edges), 'Global impact map'));
  generatedFiles.push(writeJson(path.join(registryRoot, 'knowledge-registry.json'), {
    generatedAt: new Date().toISOString(),
    apps: args.scans.map(scan => ({
      appId: scan.appId,
      name: scan.name,
      knowledgePath: `apps/${scan.appId}/app-knowledge-base`,
      routes: scan.routes.length,
      components: scan.components.length,
      dbTables: scan.dbTables.length,
    })),
  }, 'Knowledge registry'));
  generatedFiles.push(writeText(path.join(globalRoot, 'README.md'), renderGlobalReadme(args.scans, args.gitNexusIndexes ?? []), 'Global knowledge README'));
  return {
    nodeId: GLOBAL_KNOWLEDGE_MERGE_AGENT.id,
    status: 'completed',
    output: `global_knowledge_merge => 合并 ${args.scans.length} 个应用，生成 ${generatedFiles.length} 个全局文件。`,
    data: { generatedFiles },
  };
}

function buildNodes(scans: KnowledgeRepositoryScan[], indexes: GitNexusAnalyzeResult[]): unknown[] {
  const indexByApp = new Map(indexes.map(index => [index.repoName, index]));
  return scans.flatMap(scan => [
    { id: `app:${scan.appId}`, kind: 'app', label: scan.name, path: `apps/${scan.appId}/app-knowledge-base` },
    { id: `gitnexus:${scan.appId}`, kind: 'gitnexus-index', label: indexByApp.get(scan.appId)?.status ?? 'not-run', stats: indexByApp.get(scan.appId)?.stats },
    ...scan.routes.slice(0, 80).map(route => ({ id: `api:${scan.appId}:${route}`, kind: 'api', appId: scan.appId, label: route })),
    ...scan.components.slice(0, 80).map(component => ({ id: `component:${scan.appId}:${component}`, kind: 'component', appId: scan.appId, label: component })),
  ]);
}

function buildEdges(scans: KnowledgeRepositoryScan[]): Array<{ from: string; to: string; kind: string; evidence: string }> {
  const edges: Array<{ from: string; to: string; kind: string; evidence: string }> = [];
  for (const scan of scans) {
    for (const route of scan.routes.slice(0, 80)) {
      edges.push({ from: `app:${scan.appId}`, to: `api:${scan.appId}:${route}`, kind: 'exposes-api', evidence: route });
    }
    for (const component of scan.components.slice(0, 80)) {
      edges.push({ from: `app:${scan.appId}`, to: `component:${scan.appId}:${component}`, kind: 'contains-component', evidence: component });
    }
    for (const dependency of scan.domain.upstreamDependencies ?? []) {
      edges.push({ from: `app:${scan.appId}`, to: `app:${dependency}`, kind: 'depends-on', evidence: 'domain-context.upstreamDependencies' });
    }
    for (const consumer of scan.domain.downstreamConsumers ?? []) {
      edges.push({ from: `app:${consumer}`, to: `app:${scan.appId}`, kind: 'depends-on', evidence: 'domain-context.downstreamConsumers' });
    }
  }
  return edges;
}

function buildImpactMap(scans: KnowledgeRepositoryScan[], edges: Array<{ from: string; to: string; kind: string; evidence: string }>): unknown {
  return {
    generatedAt: new Date().toISOString(),
    apps: scans.map(scan => {
      const appNode = `app:${scan.appId}`;
      return {
        appId: scan.appId,
        upstream: edges.filter(edge => edge.kind === 'depends-on' && edge.from === appNode).map(edge => edge.to.replace(/^app:/, '')),
        downstream: edges.filter(edge => edge.kind === 'depends-on' && edge.to === appNode).map(edge => edge.from.replace(/^app:/, '')),
      };
    }),
  };
}

function renderGlobalReadme(scans: KnowledgeRepositoryScan[], indexes: GitNexusAnalyzeResult[]): string {
  const indexByApp = new Map(indexes.map(index => [index.repoName, index]));
  return [
    '# Global Knowledge Base',
    '',
    `Generated at: ${new Date().toISOString()}`,
    '',
    '| App | Routes | Components | DB Tables | GitNexus |',
    '| --- | ---: | ---: | ---: | --- |',
    ...scans.map(scan => `| ${scan.appId} | ${scan.routes.length} | ${scan.components.length} | ${scan.dbTables.length} | ${indexByApp.get(scan.appId)?.status ?? 'not-run'} |`),
    '',
  ].join('\n');
}

function writeJson(file: string, value: unknown, summary: string): KnowledgeGeneratedFile {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  return { path: file, bytes: fs.statSync(file).size, summary };
}

function writeText(file: string, value: string, summary: string): KnowledgeGeneratedFile {
  fs.writeFileSync(file, value, 'utf-8');
  return { path: file, bytes: fs.statSync(file).size, summary };
}
