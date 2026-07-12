import * as fs from 'fs';
import * as path from 'path';
import type { GitNexusAnalyzeResult } from '../../integrations/gitnexus.js';
import type {
  KnowledgeAgentDefinition,
  KnowledgeAgentRunResult,
  KnowledgeGeneratedFile,
  KnowledgeRepositoryScan,
} from './types.js';

export const APP_KNOWLEDGE_GENERATE_AGENT: KnowledgeAgentDefinition = {
  id: 'app-knowledge-generate',
  label: '应用知识库生成 Agent',
  description: '按 app-knowledge-agent 模板生成应用级 CONTEXT、KB_INDEX、API、组件、数据库和分层知识文档。',
  defaultTools: ['read_file', 'write_file', 'knowledge_base_search'],
  outputArtifacts: ['apps/{appId}/app-knowledge-base/**'],
};

export async function runAppKnowledgeGenerateAgent(args: {
  scans: KnowledgeRepositoryScan[];
  knowledgeRoot: string;
  versionId?: string;
  gitNexusIndexes?: GitNexusAnalyzeResult[];
  templateRoot?: string;
}): Promise<KnowledgeAgentRunResult<{
  generatedFiles: KnowledgeGeneratedFile[];
}>> {
  const generatedFiles: KnowledgeGeneratedFile[] = [];
  const versionId = args.versionId ?? `kb-${timestamp()}`;
  const gitNexusByApp = new Map((args.gitNexusIndexes ?? []).map(index => [index.repoName, index]));
  for (const scan of args.scans) {
    const appRoot = path.join(args.knowledgeRoot, 'apps', scan.appId, 'app-knowledge-base');
    fs.mkdirSync(path.join(appRoot, 'gitnexus'), { recursive: true });
    const gitNexus = gitNexusByApp.get(scan.appId);
    const files = buildAppKnowledgeFiles(scan, {
      versionId,
      gitNexus,
      templateRoot: args.templateRoot ?? path.join(process.cwd(), 'prompts', 'template', 'app-knowledge-templates'),
    });
    for (const [relativePath, content] of files) {
      const file = path.join(appRoot, relativePath);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content.endsWith('\n') ? content : `${content}\n`, 'utf-8');
      generatedFiles.push({ path: file, bytes: fs.statSync(file).size, summary: `${scan.appId} ${relativePath}` });
    }
  }
  return {
    nodeId: APP_KNOWLEDGE_GENERATE_AGENT.id,
    status: 'completed',
    output: `app_knowledge_generate => 为 ${args.scans.length} 个应用生成 ${generatedFiles.length} 个知识库文件。`,
    data: { generatedFiles },
  };
}

function buildAppKnowledgeFiles(scan: KnowledgeRepositoryScan, args: {
  versionId: string;
  gitNexus?: GitNexusAnalyzeResult;
  templateRoot: string;
}): Map<string, string> {
  const templateNames = [
    'app-kb-template.md',
    'kb-index-template.md',
    '01-biz-domain-template.md',
    '02-arch-design-template.md',
    '03-core-flow-template.md',
    '04-engineering-spec-template.md',
    '05-evolution-adr-template.md',
    'KB_FRESHNESS-template.md',
  ];
  const templateSummary = templateNames
    .map(file => `- ${file}: ${safeRead(path.join(args.templateRoot, file)) ? 'loaded' : 'missing'}`)
    .join('\n');
  const files = new Map<string, string>();
  files.set('00_概览.md', [
    `# ${scan.name} 应用知识库概览`,
    '',
    `- App ID: ${scan.appId}`,
    `- 版本: ${args.versionId}`,
    `- 源码: ${scan.relativeRoot}`,
    `- Commit: ${scan.sourceCommitSha ?? 'unknown'}`,
    `- GitNexus: ${formatGitNexus(args.gitNexus)}`,
    '',
    '## 模板加载',
    templateSummary,
    '',
  ].join('\n'));
  files.set('CONTEXT.md', [
    `# ${scan.name} Context`,
    '',
    `- 领域: ${scan.domain.domainName ?? scan.domain.domain ?? '未声明'}`,
    `- 服务: ${scan.domain.serviceName ?? scan.name}`,
    `- 端口: ${scan.domain.port ?? '未知'}`,
    `- 摘要: ${scan.domain.summary ?? '未声明'}`,
    '',
    '## 能力',
    ...listOrFallback(scan.domain.capabilities),
    '',
    '## 上下游',
    `- Upstream: ${(scan.domain.upstreamDependencies ?? []).join(', ') || 'none'}`,
    `- Downstream: ${(scan.domain.downstreamConsumers ?? []).join(', ') || 'none'}`,
    '',
  ].join('\n'));
  files.set('KB_INDEX.md', [
    `# ${scan.name} KB Index`,
    '',
    '- CONTEXT.md',
    '- api-index.md',
    '- component-index.md',
    '- db-schema.md',
    '- 01_业务与领域知识层.md',
    '- 02_架构与设计层.md',
    '- 03_核心流程与逻辑层.md',
    '- 04_工程与规范层.md',
    '- 05_数据库设计层.md',
    '- 06_演进与决策记录层.md',
    '',
  ].join('\n'));
  files.set('api-index.md', renderListDoc(`${scan.name} API Index`, scan.routes, '未扫描到显式 API 路由。'));
  files.set('component-index.md', renderListDoc(`${scan.name} Component Index`, scan.components, '未扫描到显式组件。'));
  files.set('db-schema.md', renderListDoc(`${scan.name} DB Schema Signals`, scan.dbTables, '未扫描到显式数据库表。'));
  files.set('01_业务与领域知识层.md', renderSection('业务与领域知识层', [
    `领域: ${scan.domain.domainName ?? scan.domain.domain ?? scan.appId}`,
    `拥有对象: ${(scan.domain.owns ?? []).join(', ') || '未声明'}`,
    `需求关键词: ${(scan.domain.requirementKeywords ?? []).join(', ') || '未声明'}`,
  ]));
  files.set('02_架构与设计层.md', renderSection('架构与设计层', [
    `源码文件数: ${scan.sourceFiles.length}`,
    `核心组件数: ${scan.components.length}`,
    `GitNexus: ${formatGitNexus(args.gitNexus)}`,
  ]));
  files.set('03_核心流程与逻辑层.md', renderListDoc('核心流程与逻辑层', scan.routes, '暂无路由流程信号。'));
  files.set('04_工程与规范层.md', renderSection('工程与规范层', [
    `源码根: ${scan.relativeRoot}`,
    `样例文件: ${scan.sourceFiles.slice(0, 20).join(', ') || 'none'}`,
  ]));
  files.set('05_数据库设计层.md', renderListDoc('数据库设计层', scan.dbTables, '暂无数据库信号。'));
  files.set('06_演进与决策记录层.md', renderSection('演进与决策记录层', [
    `生成版本: ${args.versionId}`,
    `源提交: ${scan.sourceCommitSha ?? 'unknown'}`,
  ]));
  files.set('KB_FRESHNESS.md', [
    `# ${scan.name} KB Freshness`,
    '',
    `- versionId: ${args.versionId}`,
    `- generatedAt: ${new Date().toISOString()}`,
    `- sourceCommitSha: ${scan.sourceCommitSha ?? 'unknown'}`,
    `- gitNexusStatus: ${args.gitNexus?.status ?? 'unknown'}`,
    '',
  ].join('\n'));
  if (args.gitNexus) {
    files.set('gitnexus/graph-summary.md', [
      `# ${scan.name} GitNexus Summary`,
      '',
      `- status: ${args.gitNexus.status}`,
      `- indexPath: ${args.gitNexus.indexPath ?? 'unknown'}`,
      `- nodes: ${args.gitNexus.stats?.nodes ?? 0}`,
      `- edges: ${args.gitNexus.stats?.edges ?? 0}`,
      `- flows: ${args.gitNexus.stats?.processes ?? 0}`,
      args.gitNexus.error ? `- error: ${args.gitNexus.error}` : '',
      '',
    ].filter(Boolean).join('\n'));
  }
  return files;
}

function renderListDoc(title: string, items: string[], fallback: string): string {
  return [
    `# ${title}`,
    '',
    ...(items.length ? items.map(item => `- ${item}`) : [`> ${fallback}`]),
    '',
  ].join('\n');
}

function renderSection(title: string, lines: string[]): string {
  return [`# ${title}`, '', ...lines.map(line => `- ${line}`), ''].join('\n');
}

function listOrFallback(items?: string[]): string[] {
  return items?.length ? items.map(item => `- ${item}`) : ['- 未声明'];
}

function formatGitNexus(index?: GitNexusAnalyzeResult): string {
  if (!index) return 'not-run';
  return `${index.status} (${index.stats?.nodes ?? 0} nodes / ${index.stats?.edges ?? 0} edges / ${index.stats?.processes ?? 0} flows)`;
}

function safeRead(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}
