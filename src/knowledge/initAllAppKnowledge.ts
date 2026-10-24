import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { ApplicationCatalog } from '../platform-sources/applicationCatalog.js';
import { analyzeGitNexusRepository, type GitNexusAnalyzeResult } from '../integrations/gitnexus.js';
import { createLLMProvider } from '../models/providers.js';
import { getCustomStageOverrides, getModel, getModelForStage } from '../models/registry.js';
import {
  APP_KNOWLEDGE_AGENT_PROMPT_FILES,
  APP_KNOWLEDGE_AGENT_RESOURCE_ROOT,
} from '../agents/knowledge/appKnowledgeAgentResources.js';
import {
  KNOWLEDGE_APP_WORKFLOW_FILES,
  KNOWLEDGE_APP_WORKFLOW_RESOURCE_ROOT,
} from '../workflows/definitions/knowledgeAppWorkflowResources.js';

export interface InitAllAppKnowledgeOptions {
  catalog: ApplicationCatalog;
  knowledgeRoot: string;
  repositoryBaseRoot?: string;
  gitNexusBinPath?: string;
  gitNexusHome?: string;
  now?: Date;
  knowledgeProvider?: 'ai-agent' | 'template';
  allowTemplateFallback?: boolean;
  modelId?: string;
  appConcurrency?: number;
  appIds?: string[];
  updateGlobalKnowledge?: boolean;
  onProgress?: (event: InitAllAppKnowledgeProgressEvent) => void;
}

export type InitAllAppKnowledgeProgressEvent =
  | { type: 'app-start'; appId: string }
  | { type: 'app-complete'; appId: string; status: 'created' | 'failed'; generationMode?: AppKnowledgeResult['generationMode']; error?: string };

export interface InitAllAppKnowledgeResult {
  versionId: string;
  knowledgeRoot: string;
  appCount: number;
  gitNexusIndexed: number;
  gitNexusFailed: number;
  apps: AppKnowledgeResult[];
  generatedFiles: string[];
  startedAt: string;
  finishedAt: string;
}

export interface AppKnowledgeResult {
  appId: string;
  name: string;
  root: string;
  knowledgePath: string;
  status: 'created' | 'failed';
  generationMode: 'ai-agent' | 'template' | 'template-fallback';
  modelId?: string;
  sourceCommitSha?: string;
  gitNexus: Pick<GitNexusAnalyzeResult, 'status' | 'stats' | 'indexedAt' | 'indexPath' | 'error'>;
  generatedFiles: string[];
  error?: string;
}

interface DomainContext {
  repository?: string;
  domain?: string;
  domainName?: string;
  serviceName?: string;
  port?: number;
  summary?: string;
  capabilities?: string[];
  owns?: string[];
  upstreamDependencies?: string[];
  downstreamConsumers?: string[];
  requirementKeywords?: string[];
  sampleRoutes?: string[];
}

interface AppScan {
  appId: string;
  name: string;
  root: string;
  relativeRoot: string;
  domain: DomainContext;
  routes: string[];
  components: string[];
  dbTables: string[];
  sourceFiles: string[];
  sourceCommitSha?: string;
}

interface AppKnowledgeGeneration {
  mode: 'ai-agent' | 'template' | 'template-fallback';
  modelId?: string;
  files: Map<string, string>;
  summary: string;
  error?: string;
}

interface AppKnowledgeFacts {
  appId: string;
  name: string;
  root: string;
  relativeRoot: string;
  domain: DomainContext;
  routes: string[];
  components: string[];
  dbTables: string[];
  sourceFiles: string[];
  sourceCommitSha?: string;
  gitNexus: Pick<GitNexusAnalyzeResult, 'status' | 'stats' | 'indexedAt' | 'indexPath' | 'error'>;
}

interface AppKnowledgeSummary {
  appId: string;
  name: string;
  knowledgePath: string;
  contextExcerpt: string;
  indexExcerpt: string;
  apiExcerpt: string;
}

const APP_KNOWLEDGE_FILES = [
  '00_概览.md',
  'CONTEXT.md',
  'KB_INDEX.md',
  'api-index.md',
  'component-index.md',
  '01_业务与领域知识层.md',
  '02_架构与设计层.md',
  '03_核心流程与逻辑层.md',
  '04_工程与规范层.md',
  '05_数据库设计层.md',
  '06_演进与决策记录层.md',
  'db-schema.md',
] as const;

const APP_KNOWLEDGE_AGENT_DIR = APP_KNOWLEDGE_AGENT_RESOURCE_ROOT;
const APP_KNOWLEDGE_WORKFLOW_DIR = KNOWLEDGE_APP_WORKFLOW_RESOURCE_ROOT;
const APP_KNOWLEDGE_TEMPLATE_DIR = path.join(process.cwd(), 'prompts', 'template', 'app-knowledge-templates');
const APP_KNOWLEDGE_PROMPT_FILES = APP_KNOWLEDGE_AGENT_PROMPT_FILES
  .filter(file => file !== 'assets/checkpoints.md');
const APP_KNOWLEDGE_WORKFLOW_PROMPT_FILES = KNOWLEDGE_APP_WORKFLOW_FILES;
const APP_KNOWLEDGE_TEMPLATE_FILES = [
  'app-kb-template.md',
  'kb-index-template.md',
  '01-biz-domain-template.md',
  '02-arch-design-template.md',
  '03-core-flow-template.md',
  '04-engineering-spec-template.md',
  '05-evolution-adr-template.md',
  'KB_FRESHNESS-template.md',
] as const;

export async function initAllAppKnowledge(options: InitAllAppKnowledgeOptions): Promise<InitAllAppKnowledgeResult> {
  const startedAt = (options.now ?? new Date()).toISOString();
  const versionId = `kb-${timestampForVersion(options.now ?? new Date())}`;
  const knowledgeRoot = path.resolve(options.knowledgeRoot);
  const repositoryBaseRoot = path.resolve(options.repositoryBaseRoot ?? process.cwd());
  const gitNexusHome = path.resolve(options.gitNexusHome ?? path.join(knowledgeRoot, '.gitnexus-home'));
  const gitNexusIndexRoot = path.join(knowledgeRoot, 'global', 'gitnexus-indexes');
  const requestedAppIds = new Set((options.appIds ?? []).map(appId => appId.trim()).filter(Boolean));
  const repos = options.catalog.list()
    .filter(repo => {
      if (requestedAppIds.size) return requestedAppIds.has(repo.appId) || requestedAppIds.has(repo.repoId);
      return true;
    })
    .sort((left, right) => left.appId.localeCompare(right.appId));
  if (requestedAppIds.size && repos.length === 0) {
    throw new Error(`No repositories matched selected appIds: ${Array.from(requestedAppIds).join(', ')}`);
  }
  const generatedFiles: string[] = [];
  fs.mkdirSync(knowledgeRoot, { recursive: true });

  const scans = repos.map(repo => scanApp(repo.appId, repo.name, repo.root, repositoryBaseRoot));
  const gitNexusResults = new Map<string, GitNexusAnalyzeResult>();

  const perApp = await mapWithConcurrency(scans, options.appConcurrency ?? 3, async (scan) => {
    const appKbRoot = path.join(knowledgeRoot, 'apps', scan.appId, 'app-knowledge-base');
    const relativeKbRoot = path.relative(knowledgeRoot, appKbRoot).replace(/\\/g, '/');
    options.onProgress?.({ type: 'app-start', appId: scan.appId });
    try {
      fs.mkdirSync(path.join(appKbRoot, 'gitnexus'), { recursive: true });
      const gitNexus = analyzeGitNexusRepository({
        repoRoot: scan.root,
        repoName: scan.appId,
        gitNexusHome,
        indexOutputRoot: gitNexusIndexRoot,
        binPath: options.gitNexusBinPath,
      });
      gitNexusResults.set(scan.appId, gitNexus);
      const appFiles = await writeAppKnowledge({
        scan,
        appKbRoot,
        relativeKbRoot,
        versionId,
        startedAt,
        gitNexus,
        options,
      });
      const appResult: AppKnowledgeResult = {
        appId: scan.appId,
        name: scan.name,
        root: scan.root,
        knowledgePath: relativeKbRoot,
        status: 'created',
        generationMode: appFiles.generation.mode,
        modelId: appFiles.generation.modelId,
        sourceCommitSha: scan.sourceCommitSha,
        gitNexus: summarizeGitNexus(gitNexus),
        generatedFiles: appFiles.files.map(file => relative(knowledgeRoot, file)),
      };
      options.onProgress?.({ type: 'app-complete', appId: scan.appId, status: 'created', generationMode: appResult.generationMode });
      return { result: appResult, files: appFiles.files };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const appResult: AppKnowledgeResult = {
        appId: scan.appId,
        name: scan.name,
        root: scan.root,
        knowledgePath: relativeKbRoot,
        status: 'failed',
        generationMode: 'template-fallback',
        sourceCommitSha: scan.sourceCommitSha,
        gitNexus: {
          status: 'failed',
          indexPath: path.join(gitNexusIndexRoot, scan.appId),
          error: message,
        },
        generatedFiles: [],
        error: message,
      };
      options.onProgress?.({ type: 'app-complete', appId: scan.appId, status: 'failed', generationMode: appResult.generationMode, error: message });
      return { result: appResult, files: [] };
    }
  });

  const appResults = perApp.map(item => item.result);
  for (const item of perApp) generatedFiles.push(...item.files);
  if (options.updateGlobalKnowledge !== false) {
    const appKnowledgeSummaries = readAppKnowledgeSummaries(knowledgeRoot, appResults);
    generatedFiles.push(...writeGlobalKnowledge({
      knowledgeRoot,
      versionId,
      startedAt,
      scans,
      appResults,
      appKnowledgeSummaries,
      gitNexusResults,
    }));
  } else {
    updateRegistryFreshnessForApps(knowledgeRoot, appResults, versionId, startedAt);
  }
  const finishedAt = new Date().toISOString();
  const result: InitAllAppKnowledgeResult = {
    versionId,
    knowledgeRoot,
    appCount: appResults.length,
    gitNexusIndexed: appResults.filter(app => app.gitNexus.status === 'indexed').length,
    gitNexusFailed: appResults.filter(app => app.gitNexus.status === 'failed').length,
    apps: appResults,
    generatedFiles: generatedFiles.map(file => relative(knowledgeRoot, file)),
    startedAt,
    finishedAt,
  };
  if (options.updateGlobalKnowledge !== false) {
    const reportJson = path.join(knowledgeRoot, 'global', 'init-report.json');
    fs.writeFileSync(reportJson, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
  }
  return result;
}

function scanApp(appId: string, name: string, root: string, repositoryBaseRoot: string): AppScan {
  const domain = readJson<DomainContext>(path.join(root, 'knowledge', 'domain-context.json')) ?? {};
  const openApi = readJson<{ paths?: Record<string, unknown> }>(path.join(root, 'docs', 'openapi.json'));
  const schemaPath = path.join(root, 'src', 'main', 'resources', 'schema.sql');
  const sourceFiles = listSourceFiles(root);
  const sourceTexts = sourceFiles.map(file => readText(file)).join('\n');
  return {
    appId,
    name,
    root,
    relativeRoot: relative(repositoryBaseRoot, root),
    domain,
    routes: unique([
      ...Object.keys(openApi?.paths ?? {}),
      ...(domain.sampleRoutes ?? []),
      ...extractRoutes(sourceTexts),
    ]).slice(0, 80),
    components: unique(extractComponents(sourceTexts)).slice(0, 120),
    dbTables: fs.existsSync(schemaPath) ? extractTables(readText(schemaPath)) : [],
    sourceFiles: sourceFiles.map(file => relative(root, file)).slice(0, 240),
    sourceCommitSha: gitHead(root),
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(values.length || 1, concurrency));
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function writeAppKnowledge(args: {
  scan: AppScan;
  appKbRoot: string;
  relativeKbRoot: string;
  versionId: string;
  startedAt: string;
  gitNexus: GitNexusAnalyzeResult;
  options: InitAllAppKnowledgeOptions;
}): Promise<{ files: string[]; generation: AppKnowledgeGeneration }> {
  const { scan, appKbRoot, versionId, startedAt, gitNexus } = args;
  const generation = await generateAppKnowledge(args);
  const files = new Map(generation.files);
  files.set('KB_FRESHNESS.md', renderFreshness(scan, versionId, startedAt, gitNexus, generation));
  files.set('gitnexus/graph-summary.md', renderAppGitNexusSummary(scan, gitNexus));
  files.set('gitnexus/nodes.json', `${JSON.stringify(buildAppNodes(scan, gitNexus), null, 2)}\n`);
  files.set('gitnexus/edges.json', `${JSON.stringify(buildAppEdges(scan), null, 2)}\n`);

  const written: string[] = [];
  for (const [name, content] of files) {
    const file = path.join(appKbRoot, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf-8');
    written.push(file);
  }
  return { files: written, generation };
}

async function generateAppKnowledge(args: {
  scan: AppScan;
  appKbRoot: string;
  relativeKbRoot: string;
  versionId: string;
  startedAt: string;
  gitNexus: GitNexusAnalyzeResult;
  options: InitAllAppKnowledgeOptions;
}): Promise<AppKnowledgeGeneration> {
  const provider = args.options.knowledgeProvider ?? (process.env.AI_CODING_KB_PROVIDER === 'template' ? 'template' : 'ai-agent');
  if (provider === 'template') {
    return generateTemplateAppKnowledge(args.scan, args.gitNexus, 'template');
  }

  try {
    return await generateAiAppKnowledge(args);
  } catch (error) {
    if (args.options.allowTemplateFallback === false) throw error;
    return generateTemplateAppKnowledge(
      args.scan,
      args.gitNexus,
      'template-fallback',
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function generateAiAppKnowledge(args: {
  scan: AppScan;
  appKbRoot: string;
  relativeKbRoot: string;
  versionId: string;
  startedAt: string;
  gitNexus: GitNexusAnalyzeResult;
  options: InitAllAppKnowledgeOptions;
}): Promise<AppKnowledgeGeneration> {
  const overrides = getCustomStageOverrides();
  const model = selectKnowledgeModel(args.options.modelId, overrides);
  const provider = createLLMProvider(model.providerId);
  const facts = buildAppKnowledgeFacts(args.scan, args.gitNexus);
  const response = await provider.createMessage({
    model: model.id,
    system: buildAppKnowledgeSystemPrompt(),
    messages: [{ role: 'user', content: buildAppKnowledgeUserPrompt(facts, args.appKbRoot, args.versionId, args.startedAt) }],
    maxTokens: 14_000,
    temperature: 0.2,
  });
  const text = response.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim();
  const files = parseAiKnowledgeFiles(text);
  const missing = APP_KNOWLEDGE_FILES.filter(file => !files.get(file)?.trim());
  if (missing.length) {
    throw new Error(`app-knowledge-agent output missing required files: ${missing.join(', ')}`);
  }
  return {
    mode: 'ai-agent',
    modelId: model.id,
    files,
    summary: `${args.scan.appId} app knowledge generated by AI app-knowledge agent`,
  };
}

function selectKnowledgeModel(modelId: string | undefined, overrides: Record<string, string>) {
  if (modelId) {
    const explicit = getModel(modelId);
    if (explicit) return explicit;
  }
  for (const stageId of ['01-knowledge-base', 'mrd-render', 'archive', 'implementation-plan']) {
    const candidate = overrides[stageId] ? getModel(overrides[stageId]) : undefined;
    if (candidate) return candidate;
  }
  return getModelForStage('archive', 0, overrides);
}

function generateTemplateAppKnowledge(
  scan: AppScan,
  gitNexus: GitNexusAnalyzeResult,
  mode: 'template' | 'template-fallback',
  error?: string,
): AppKnowledgeGeneration {
  const files = new Map<string, string>();
  const context = renderContext(scan, gitNexus);
  files.set('00_概览.md', context);
  files.set('CONTEXT.md', context);
  files.set('KB_INDEX.md', renderKbIndex(scan));
  files.set('api-index.md', renderApiIndex(scan));
  files.set('component-index.md', renderComponentIndex(scan));
  files.set('01_业务与领域知识层.md', renderBusinessLayer(scan));
  files.set('02_架构与设计层.md', renderArchitectureLayer(scan));
  files.set('03_核心流程与逻辑层.md', renderCoreFlowLayer(scan));
  files.set('04_工程与规范层.md', renderEngineeringSpecLayer(scan));
  files.set('05_数据库设计层.md', renderDatabaseDesignLayer(scan));
  files.set('06_演进与决策记录层.md', renderEvolutionAdrLayer(scan));
  files.set('db-schema.md', renderDbSchema(scan));
  return {
    mode,
    files,
    summary: `${scan.appId} app knowledge generated from copied dev-workflow templates`,
    error,
  };
}

function buildAppKnowledgeFacts(scan: AppScan, gitNexus: GitNexusAnalyzeResult): AppKnowledgeFacts {
  return {
    appId: scan.appId,
    name: scan.name,
    root: scan.root,
    relativeRoot: scan.relativeRoot,
    domain: scan.domain,
    routes: scan.routes.slice(0, 80),
    components: scan.components.slice(0, 120),
    dbTables: scan.dbTables.slice(0, 80),
    sourceFiles: scan.sourceFiles.slice(0, 160),
    sourceCommitSha: scan.sourceCommitSha,
    gitNexus: summarizeGitNexus(gitNexus),
  };
}

function readAppKnowledgeSummaries(knowledgeRoot: string, apps: AppKnowledgeResult[]): AppKnowledgeSummary[] {
  return apps.map(app => {
    const appKbRoot = path.join(knowledgeRoot, app.knowledgePath);
    return {
      appId: app.appId,
      name: app.name,
      knowledgePath: app.knowledgePath,
      contextExcerpt: compactMarkdownExcerpt(readText(path.join(appKbRoot, 'CONTEXT.md')), 80),
      indexExcerpt: compactMarkdownExcerpt(readText(path.join(appKbRoot, 'KB_INDEX.md')), 60),
      apiExcerpt: compactMarkdownExcerpt(readText(path.join(appKbRoot, 'api-index.md')), 60),
    };
  });
}

function compactMarkdownExcerpt(content: string, maxLines: number): string {
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('```'))
    .slice(0, maxLines)
    .join('\n');
}

function buildAppKnowledgeSystemPrompt(): string {
  return [
    '你是 dev-workflow 的 app-knowledge-agent。',
    '你要基于应用代码扫描事实、GitNexus 图谱统计和领域元数据，生成应用知识库文件。',
    '必须严格参考随请求提供的 dev-workflow app-knowledge 模板文件，不要自行发明文档结构。',
    'lite mode 产物约束：CONTEXT.md、api-index.md、KB_INDEX.md、component-index.md、db-schema.md、01_业务与领域知识层.md、02_架构与设计层.md、03_核心流程与逻辑层.md。',
    '01 层必须用产品经理能理解的业务语言描述业务场景、规则、状态、实体和术语；不要把类名/方法名/注解作为主体。',
    '02/03 层必须基于代码证据描述模块、接口、数据访问、依赖、流程编排、MQ、任务、状态和代码生成约束。',
    'CONTEXT.md 是 L0 必读摘要层，控制在 200 行以内；KB_INDEX.md 控制在 100 行以内；每个层级文档控制在 150 行以内。',
    '禁止输出解释文字。只输出一个 JSON object，key 是文件名，value 是 Markdown 内容。',
    '',
    '## copied app-knowledge-agent prompt and assets',
    loadAppKnowledgeAgentPromptForPrompt(),
    '',
    '## dev-workflow app-knowledge templates',
    loadAppKnowledgeTemplatesForPrompt(),
  ].join('\n');
}

function buildAppKnowledgeUserPrompt(facts: AppKnowledgeFacts, appKbRoot: string, versionId: string, generatedAt: string): string {
  return [
    `project_root=${facts.root}`,
    'branch=main',
    'mode=lite',
    `kb_output_path=${appKbRoot}`,
    `version_id=${versionId}`,
    `generated_at=${generatedAt}`,
    '',
    '生成以下文件，JSON key 必须完全一致：',
    ...APP_KNOWLEDGE_FILES.map(file => `- ${file}`),
    '',
    '代码扫描事实如下。不要编造不存在的类、表、接口；不确定的地方写“待确认”。',
    JSON.stringify(facts, null, 2),
  ].join('\n');
}

function loadAppKnowledgeTemplatesForPrompt(): string {
  return APP_KNOWLEDGE_TEMPLATE_FILES
    .map(file => {
      const content = readText(path.join(APP_KNOWLEDGE_TEMPLATE_DIR, file)).trim();
      return content ? `### ${file}\n\n${content}` : `### ${file}\n\n[template missing]`;
    })
    .join('\n\n---\n\n');
}

function loadAppKnowledgeAgentPromptForPrompt(): string {
  const agentPrompt = APP_KNOWLEDGE_PROMPT_FILES
    .map(file => {
      const content = readText(path.join(APP_KNOWLEDGE_AGENT_DIR, file)).trim();
      return content ? `### ${file}\n\n${content}` : `### ${file}\n\n[prompt asset missing]`;
    })
    .join('\n\n---\n\n');
  const workflowPrompt = APP_KNOWLEDGE_WORKFLOW_PROMPT_FILES
    .map(file => {
      const content = readText(path.join(APP_KNOWLEDGE_WORKFLOW_DIR, file)).trim();
      return content ? `### workflow/${file}\n\n${content}` : `### workflow/${file}\n\n[workflow asset missing]`;
    })
    .join('\n\n---\n\n');
  return [agentPrompt, workflowPrompt].filter(Boolean).join('\n\n---\n\n');
}

function parseAiKnowledgeFiles(text: string): Map<string, string> {
  const jsonText = extractJsonObject(text);
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const files = new Map<string, string>();
  for (const file of APP_KNOWLEDGE_FILES) {
    const content = parsed[file];
    if (typeof content === 'string') files.set(file, ensureTrailingNewline(content));
  }
  return files;
}

function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('app-knowledge-agent did not return JSON');
  }
  return text.slice(start, end + 1);
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

function writeGlobalKnowledge(args: {
  knowledgeRoot: string;
  versionId: string;
  startedAt: string;
  scans: AppScan[];
  appResults: AppKnowledgeResult[];
  appKnowledgeSummaries: AppKnowledgeSummary[];
  gitNexusResults: Map<string, GitNexusAnalyzeResult>;
}): string[] {
  const { knowledgeRoot, scans, appResults, appKnowledgeSummaries, gitNexusResults } = args;
  const globalDir = path.join(knowledgeRoot, 'global');
  const registryDir = path.join(knowledgeRoot, 'registry');
  const graphDir = path.join(globalDir, 'gitnexus-graph');
  fs.mkdirSync(graphDir, { recursive: true });
  fs.mkdirSync(registryDir, { recursive: true });
  const dependencyEdges = buildDependencyEdges(scans);
  const appDomainMap = Object.fromEntries(scans.map(scan => [scan.appId, {
    domain: scan.domain.domain ?? scan.appId.replace(/^ecom-/, ''),
    domainName: scan.domain.domainName ?? scan.name,
    serviceName: scan.domain.serviceName ?? scan.name,
    summary: scan.domain.summary ?? '',
  }]));
  const capabilityMap = Object.fromEntries(scans.map(scan => [scan.appId, scan.domain.capabilities ?? []]));
  const apiRouteMap = Object.fromEntries(scans.map(scan => [scan.appId, scan.routes]));
  const impactMap = buildGlobalImpactMap(scans, dependencyEdges);
  const testDataMap = buildGlobalTestDataMap(scans, dependencyEdges);
  const appsJson = {
    versionId: args.versionId,
    generatedAt: args.startedAt,
    apps: scans.map(scan => ({
      appId: scan.appId,
      name: scan.name,
      domains: [scan.domain.domain ?? scan.appId],
      tags: scan.appId === 'console' ? ['frontend', 'console'] : ['backend', 'java', 'dubbo', 'http'],
      codeRepo: {
        provider: 'local-git-service',
        repoPath: scan.relativeRoot,
        localPath: scan.root,
        defaultBranch: 'main',
      },
      knowledgeRepo: {
        provider: 'local',
        repoPath: 'spaces/knowledge/knowledge-base',
        kbPath: `apps/${scan.appId}/app-knowledge-base`,
        globalGitNexusGraphPath: 'global/gitnexus-graph',
        globalGitNexusIndexPath: `global/gitnexus-indexes/${scan.appId}`,
      },
      freshness: {
        sourceCommitSha: scan.sourceCommitSha,
        lastGeneratedAt: args.startedAt,
        status: appResults.find(app => app.appId === scan.appId)?.status === 'created' ? 'fresh' : 'failed',
        updateMethod: appResults.find(app => app.appId === scan.appId)?.generationMode,
        modelId: appResults.find(app => app.appId === scan.appId)?.modelId,
      },
    })),
  };
  const repositoriesJson = {
    versionId: args.versionId,
    repositories: [
      ...scans.map(scan => ({
        repoId: scan.appId,
        provider: 'local-git-service',
        repoPath: scan.relativeRoot,
        localPath: scan.root,
        type: 'code',
        appIds: [scan.appId],
      })),
      {
        repoId: 'repo_knowledge_base',
        provider: 'local',
        repoPath: 'spaces/knowledge/knowledge-base',
        localPath: knowledgeRoot,
        type: 'knowledge',
        appIds: scans.map(scan => scan.appId),
      },
      {
        repoId: 'repo_global_gitnexus_indexes',
        provider: 'local',
        repoPath: 'spaces/knowledge/knowledge-base/global/gitnexus-indexes',
        localPath: path.join(knowledgeRoot, 'global', 'gitnexus-indexes'),
        type: 'gitnexus-index',
        appIds: scans.map(scan => scan.appId),
      },
    ],
  };
  const globalGraph = {
    versionId: args.versionId,
    generatedAt: args.startedAt,
    nodes: scans.map(scan => ({
      id: `app:${scan.appId}`,
      appId: scan.appId,
      kind: 'app',
      label: scan.domain.serviceName ?? scan.name,
      gitNexus: summarizeGitNexus(gitNexusResults.get(scan.appId) ?? failedGitNexus(scan)),
    })),
    edges: dependencyEdges,
  };
  const files = new Map<string, string>([
    [path.join(globalDir, 'GLOBAL_CONTEXT.md'), renderGlobalContext(appKnowledgeSummaries, dependencyEdges)],
    [path.join(globalDir, 'business-glossary.md'), renderBusinessGlossary(scans)],
    [path.join(globalDir, 'app-domain-map.json'), json(appDomainMap)],
    [path.join(globalDir, 'dependency-map.json'), json({ edges: dependencyEdges })],
    [path.join(globalDir, 'capability-map.json'), json(capabilityMap)],
    [path.join(globalDir, 'api-route-map.json'), json(apiRouteMap)],
    [path.join(globalDir, 'init-report.md'), renderInitReport(args.versionId, appResults)],
    [path.join(graphDir, 'graph-summary.md'), renderGlobalGraphSummary(scans, dependencyEdges, gitNexusResults)],
    [path.join(graphDir, 'nodes.json'), json(globalGraph.nodes)],
    [path.join(graphDir, 'edges.json'), json(globalGraph.edges)],
    [path.join(graphDir, 'capability-to-code-map.json'), json(buildCapabilityToCodeMap(scans))],
    [path.join(graphDir, 'impact-map.json'), json(impactMap)],
    [path.join(graphDir, 'test-data-map.json'), json(testDataMap)],
    [path.join(registryDir, 'apps.json'), json(appsJson)],
    [path.join(registryDir, 'repositories.json'), json(repositoriesJson)],
    [path.join(registryDir, 'dependency-map.json'), json({ edges: dependencyEdges })],
    [path.join(registryDir, 'business-glossary.md'), renderBusinessGlossary(scans)],
  ]);
  const written: string[] = [];
  for (const [file, content] of files) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, 'utf-8');
    written.push(file);
  }
  return written;
}

function updateRegistryFreshnessForApps(
  knowledgeRoot: string,
  appResults: AppKnowledgeResult[],
  versionId: string,
  generatedAt: string,
): void {
  const appsPath = path.join(knowledgeRoot, 'registry', 'apps.json');
  const registry = readJson<{
    versionId?: string;
    generatedAt?: string;
    apps?: Array<{
      appId?: string;
      freshness?: Record<string, unknown>;
    }>;
  }>(appsPath);
  if (!registry?.apps?.length) return;

  const resultsByApp = new Map(appResults.map(result => [result.appId, result]));
  let changed = false;
  registry.versionId = versionId;
  registry.generatedAt = generatedAt;
  registry.apps = registry.apps.map(app => {
    const result = app.appId ? resultsByApp.get(app.appId) : undefined;
    if (!result) return app;
    changed = true;
    return {
      ...app,
      freshness: {
        ...(app.freshness ?? {}),
        sourceCommitSha: result.sourceCommitSha,
        lastGeneratedAt: generatedAt,
        status: result.status === 'created' ? 'fresh' : 'failed',
        updateMethod: result.generationMode,
        modelId: result.modelId,
      },
    };
  });
  if (changed) fs.writeFileSync(appsPath, json(registry), 'utf-8');
}

function renderContext(scan: AppScan, gitNexus: GitNexusAnalyzeResult): string {
  const entities = businessEntities(scan);
  const routes = scan.routes.slice(0, 10);
  const dependencyNames = dependencyLabels(scan.domain.upstreamDependencies ?? []);
  const consumerNames = dependencyLabels(scan.domain.downstreamConsumers ?? []);
  return [
    `# ${scan.domain.serviceName ?? scan.name} 应用知识库`,
    '',
    '> 模板来源：`prompts/template/app-knowledge-templates/app-kb-template.md`，按 dev-workflow app-knowledge lite 模式填充。',
    '',
    `- 应用：${scan.appId}`,
    `- App ID: ${scan.appId}`,
    `- 领域：${domainTitle(scan)}`,
    `- 仓库：${scan.relativeRoot}`,
    `- 代码版本：${scan.sourceCommitSha ?? 'unknown'}`,
    `- GitNexus：${gitNexus.status}${gitNexus.stats ? `，${gitNexus.stats.nodes ?? 0} nodes / ${gitNexus.stats.edges ?? 0} edges / ${gitNexus.stats.processes ?? 0} flows` : ''}`,
    `- GitNexus: ${gitNexus.status}${gitNexus.stats ? ` (${gitNexus.stats.nodes ?? 0} nodes, ${gitNexus.stats.edges ?? 0} edges, ${gitNexus.stats.processes ?? 0} flows)` : ''}`,
    '',
    '## 一句话定位',
    '',
    servicePosition(scan),
    '',
    '## 技术栈',
    '',
    '| 维度 | 内容 |',
    '|------|------|',
    `| 语言/框架 | ${scan.appId === 'console' ? 'Node.js / Hono / Web UI' : 'Java / Spring Boot 风格 HTTP 服务'} |`,
    `| RPC | ${hasDubbo(scan) ? 'Dubbo 接口与实现' : '未发现 Dubbo 接口'} |`,
    `| HTTP | ${scan.routes.length} 个路由，端口 ${scan.domain.port ?? '待确认'} |`,
    `| ORM/存储 | ${scan.dbTables.length ? `MySQL，核心表 ${scan.dbTables.join('、')}` : '未发现自有表，可能只做编排或内存态示例'} |`,
    `| 图谱 | 全局 GitNexus：global/gitnexus-graph；索引：global/gitnexus-indexes/${scan.appId} |`,
    '',
    '## 知识库导航',
    '',
    '| 文档 | 核心内容 | 适用场景 |',
    '|------|---------|---------|',
    '| [01_业务与领域知识层](./01_业务与领域知识层.md) | 服务定位、业务场景、规则、实体、术语 | PRD、需求澄清、业务验收 |',
    '| [02_架构与设计层](./02_架构与设计层.md) | 分层、接口、数据访问、依赖、代码生成约束 | 技术方案、影响分析 |',
    '| [03_核心流程与逻辑层](./03_核心流程与逻辑层.md) | 核心流程、入口、状态、测试触点 | 测试用例、联调排障 |',
    '| [04_工程与规范层](./04_工程与规范层.md) | 编码规范、异常体系、配置、质量约束 | 代码生成、评审、质量门禁 |',
    '| [05_数据库设计层](./05_数据库设计层.md) | 表语义、字段约束、造数和清理策略 | 测试数据准备 |',
    '| [06_演进与决策记录层](./06_演进与决策记录层.md) | ADR、技术债务、风险和演进建议 | 技术方案、架构决策 |',
    '| [api-index.md](./api-index.md) | HTTP/Dubbo/API 入口清单 | 接口测试、E2E 编排 |',
    '| [db-schema.md](./db-schema.md) | 表和造数语义 | 测试数据准备与清理 |',
    '| [component-index.md](./component-index.md) | 组件、类、职责索引 | 代码生成和落点定位 |',
    '',
    '## 高频接口（静态候选）',
    '',
    '| 排名 | 接口 | 用途 | 测试价值 |',
    '|-----|------|------|---------|',
    ...(routes.length ? routes.map((route, index) => `| ${String(index + 1).padStart(2, '0')} | \`${route}\` | ${routePurpose(route, scan)} | ${routeTestValue(route)} |`) : ['| 01 | 待确认 | 未扫描到 HTTP 路由 | 需要补充接口文档 |']),
    '',
    '## 关键业务规则',
    '',
    ...businessRules(scan).slice(0, 10).map((rule, index) => `${index + 1}. ${rule}`),
    '',
    '## 外部依赖',
    '',
    '| 方向 | 依赖 | 业务含义 |',
    '|------|------|---------|',
    `| 上游依赖 | ${dependencyNames.length ? dependencyNames.join('、') : '无显式上游'} | 生成测试数据时需先准备这些领域的前置状态 |`,
    `| 下游消费者 | ${consumerNames.length ? consumerNames.join('、') : '无显式下游'} | 变更本应用时需要评估这些领域的回归范围 |`,
    '',
    '## 核心实体',
    '',
    ...(entities.length ? entities.map(entity => `- ${entity}: ${entityMeaning(entity, scan)}。`) : ['- 待确认：代码和领域配置未声明核心实体。']),
    '',
    '## 代码规范索引',
    '',
    '- 新增业务能力时优先补齐 `01/02/03` 三层知识，再进入技术方案和测试设计。',
    '- 技术方案必须从 `global/gitnexus-graph/impact-map.json` 判断跨应用影响面。',
    '- 测试造数必须从 `global/gitnexus-graph/test-data-map.json` 读取上游 fixture、种子接口和校验接口。',
    '',
  ].join('\n');
}

function renderKbIndex(scan: AppScan): string {
  const entities = businessEntities(scan);
  const flows = scenarioNames(scan);
  const componentGroups = groupComponents(scan);
  return [
    '# 知识库索引',
    '',
    '> 模板来源：`prompts/template/app-knowledge-templates/kb-index-template.md`，Agent 启动时先读本文件，再按锚点下钻。',
    '',
    `- 应用：${scan.appId}`,
    `- 领域：${domainTitle(scan)}`,
    `- 保鲜周期：1个月`,
    `- 影响面入口：global/gitnexus-graph/impact-map.json`,
    `- 造数入口：global/gitnexus-graph/test-data-map.json`,
    '',
    '## 核心实体',
    '',
    '| 实体 | 业务含义 | 详情锚点 |',
    '|------|---------|---------|',
    ...(entities.length ? entities.map(entity => `| ${entity} | ${entityMeaning(entity, scan)} | [01_业务与领域知识层.md#核心业务实体](./01_业务与领域知识层.md#核心业务实体) |`) : ['| 待确认 | 未在领域配置中声明实体 | [01_业务与领域知识层.md](./01_业务与领域知识层.md) |']),
    '',
    '## 核心流程',
    '',
    '| 流程 | 触发入口 | 详情锚点 |',
    '|------|---------|---------|',
    ...flows.map(flow => `| ${flow.name} | ${flow.entry} | [03_核心流程与逻辑层.md#核心业务流程](./03_核心流程与逻辑层.md#核心业务流程) |`),
    '',
    '## 关键接口',
    '',
    '| 服务 | 接口数 | 详情锚点 |',
    '|------|--------|---------|',
    `| ${scan.domain.serviceName ?? scan.name} | ${scan.routes.length} | [api-index.md](./api-index.md) |`,
    '',
    '## 组件清单',
    '',
    '| 类型 | 数量 | 详情锚点 |',
    '|------|------|---------|',
    ...Object.entries(componentGroups).map(([kind, values]) => `| ${kind} | ${values.length} | [component-index.md#${anchor(kind)}](./component-index.md#${anchor(kind)}) |`),
    '',
    '## 数据库表',
    '',
    '| 表名 | 业务用途 | 详情锚点 |',
    '|------|---------|---------|',
    ...(scan.dbTables.length ? scan.dbTables.map(table => `| ${table} | ${tableMeaning(table, scan)} | [db-schema.md](./db-schema.md) |`) : ['| 无自有表 | 以接口编排或内存态能力为主 | [db-schema.md](./db-schema.md) |']),
    '',
    '## 下钻顺序',
    '',
    '1. 需求/PRD：先读 `CONTEXT.md` 与 `01_业务与领域知识层.md`。',
    '2. 技术方案：再读 `02_架构与设计层.md`、`component-index.md` 和全局 `impact-map.json`。',
    '3. 代码生成：读 `04_工程与规范层.md`，确认分层、异常、配置和质量约束。',
    '4. 测试用例：读 `03_核心流程与逻辑层.md`、`api-index.md`、`05_数据库设计层.md`、`db-schema.md` 和全局 `test-data-map.json`。',
    '5. 架构评审：读 `06_演进与决策记录层.md`，确认 ADR、风险和演进约束。',
    '',
  ].join('\n');
}

function renderBusinessLayer(scan: AppScan): string {
  const scenarios = scenarioNames(scan);
  const entities = businessEntities(scan);
  return [
    '# 01 业务与领域知识层',
    '',
    '来源：代码中的领域配置、接口清单、数据库表、GitNexus 静态索引。',
    '',
    '> 产品可读性要求：本文档用于 PRD/测试场景生成，主体使用业务语言；类名、方法名只作为证据附注。',
    '',
    '## 服务定位',
    '',
    servicePosition(scan),
    '',
    '## 核心业务场景',
    '',
    ...scenarios.flatMap((scenario, index) => [
      `### 场景${chineseNumber(index + 1)}：${scenario.name}`,
      '',
      '**业务流程**（用户/业务视角）：',
      `1. 业务方发起${scenario.action}请求，提供${entities.slice(0, 3).join('、') || domainTitle(scan)}相关信息。`,
      `2. ${domainTitle(scan)}校验业务规则、补齐领域上下文，并记录可追踪的业务状态。`,
      `3. 系统通过 ${scenario.entry} 对外提供处理结果，供${downstreamPhrase(scan)}继续使用。`,
      '',
      '**业务规则**：',
      ...businessRules(scan).slice(0, 3).map(rule => `- ${rule}`),
      '',
      '**例外/边界情况**：',
      `- 上游依赖缺失时，测试造数必须先准备 ${dependencyLabels(scan.domain.upstreamDependencies ?? []).join('、') || '本域基础数据'}。`,
      '- 业务状态不可确认时，接口应返回可排查的错误信息，避免生成半成品业务数据。',
      '',
    ]),
    '## 业务状态说明',
    '',
    '| 状态名 | 业务含义 | 进入条件 | 下一步 |',
    '|--------|---------|---------|-------|',
    '| 待创建 | 业务方尚未在本域形成正式记录 | 上游提交创建/导入/发布类请求 | 校验通过后进入处理中 |',
    '| 处理中 | 系统正在校验规则、补齐依赖或写入核心表 | 接口接收有效请求 | 成功后进入可用，失败进入失败 |',
    '| 可用 | 业务对象已可被下游查询或消费 | 主流程完成且持久化成功 | 下游联动、状态更新或删除 |',
    '| 失败 | 规则校验、依赖或持久化失败 | 参数错误、依赖缺失、系统异常 | 修正数据后重试或人工处理 |',
    '',
    '## 核心业务实体',
    '',
    ...(entities.length ? entities.flatMap(entity => [
      `### ${entity}`,
      '',
      `**是什么**：${entityMeaning(entity, scan)}。`,
      '',
      '| 属性 | 业务含义 | 备注 |',
      '|------|---------|------|',
      `| id | ${entity}的唯一标识 | 用于接口查询、幂等和测试数据清理 |`,
      `| status | ${entity}当前业务状态 | 影响是否允许继续流转或被下游消费 |`,
      `| payload | ${entity}的扩展业务属性 | 以实际接口/表结构为准，测试造数需保持字段完整 |`,
      '',
    ]) : ['- 待确认：领域配置没有声明核心实体。', '']),
    '## 数据库核心表',
    '',
    '| 表名 | 存什么数据 | 关键字段业务含义 |',
    '|------|----------|----------------|',
    ...(scan.dbTables.length ? scan.dbTables.map(table => `| ${table} | ${tableMeaning(table, scan)} | id=主键；status=业务状态；created_at/updated_at=数据生命周期时间 |`) : ['| 无自有表 | 当前扫描未发现 schema.sql 表定义 | 测试造数以接口或上游 fixture 为主 |']),
    '',
    '## 术语表',
    '',
    '| 术语 | 业务含义 |',
    '|------|---------|',
    ...businessTerms(scan).map(term => `| ${term} | ${termMeaning(term, scan)} |`),
    '',
  ].join('\n');
}

function renderArchitectureLayer(scan: AppScan): string {
  const groups = groupComponents(scan);
  return [
    '# 02 架构与设计层',
    '',
    '> 模板来源：`02-arch-design-template.md`。证据来自 pom.xml、源码目录、接口清单、schema.sql、GitNexus 静态索引；无运行时拓扑。',
    '',
    '## DDD 与 Maven 模块',
    '',
    '| 模块 | 包根/位置 | 设计要点 |',
    '|------|-----------|----------|',
    ...moduleRows(scan),
    '',
    '父工程版本：**0.1.0 或待确认**',
    '',
    '## 对外接口',
    '',
    '### Dubbo',
    '',
    `- **接口文件数**：${groups.Dubbo?.filter(name => /Service$|Dubbo/i.test(name)).length ?? 0} 个候选。`,
    `- **实现类数**：${groups.Dubbo?.filter(name => /Impl$/.test(name)).length ?? 0} 个候选。`,
    `- **注册风格**：以代码扫描为准；新增实现应保持现有包路径和注解风格。`,
    '',
    '### HTTP',
    '',
    `- **路由数量**：${scan.routes.length} 个。`,
    `- **典型路径**：${scan.routes.slice(0, 6).map(route => `\`${route}\``).join('、') || '未发现'}`,
    `- **端口**：${scan.domain.port ?? '待确认'}`,
    '',
    '## 数据访问',
    '',
    '| 类型 | 规模 | 位置 |',
    '|------|------|------|',
    `| Repository | ${groups.Repository?.length ?? 0} 个候选 | \`${repositoryLocations(scan).join('`, `') || '待确认'}\` |`,
    `| Mapper/DAO | ${groups.Mapper?.length ?? 0} 个候选 | \`${mapperLocations(scan).join('`, `') || '未发现'}\` |`,
    `| 数据表 | ${scan.dbTables.length} 张 | \`src/main/resources/schema.sql\` |`,
    '',
    `MyBatis Generator：${scan.sourceFiles.some(file => file.endsWith('generatorConfig.xml')) ? '存在' : '未发现'}；启用表 ${scan.dbTables.length} 张，详见 \`db-schema.md\`。`,
    '',
    '## 外部依赖',
    '',
    '## Upstream Dependencies',
    ...(scan.domain.upstreamDependencies?.length ? scan.domain.upstreamDependencies.map(item => `- ${item}`) : ['- none']),
    '',
    '## Downstream Consumers',
    ...(scan.domain.downstreamConsumers?.length ? scan.domain.downstreamConsumers.map(item => `- ${item}`) : ['- none']),
    '',
    '## 横切能力',
    '',
    `- **限流**：${scan.components.some(item => /Sentinel|RateLimit|Limiter/i.test(item)) ? '发现限流相关组件候选' : '未发现显式限流组件，需按网关/框架默认策略确认'}。`,
    `- **缓存**：${scan.components.some(item => /Cache|Redis/i.test(item)) ? '发现缓存相关组件候选' : '未发现显式缓存组件'}。`,
    `- **分布式锁**：${scan.components.some(item => /Lock/i.test(item)) ? '发现锁相关组件候选' : '未发现显式分布式锁组件'}。`,
    '',
    '## Agent 代码生成约束',
    '',
    '- 新增接口必须同步更新 `api-index.md`，否则测试流程无法发现入口。',
    '- 新增表或字段必须同步更新 `db-schema.md` 和 `global/gitnexus-graph/test-data-map.json` 的造数依据。',
    '- 新增跨应用调用必须同步更新领域依赖配置，后续技术方案从全局 `impact-map.json` 判断影响面。',
    '- 后端应用新增 Dubbo/Repository/Service 时必须沿用现有包结构；前端 console 新增页面能力时必须同步标注对应业务接口。',
    '',
    '## Source Files（抽样）',
    '',
    ...scan.sourceFiles.slice(0, 80).map(file => `- ${file}`),
    '',
  ].join('\n');
}

function renderCoreFlowLayer(scan: AppScan): string {
  const scenarios = scenarioNames(scan);
  return [
    '# 03 核心流程与逻辑层',
    '',
    '> 模板来源：`03-core-flow-template.md`。证据来自接口、组件命名、领域依赖和 GitNexus 静态索引；无运行时链路数据。',
    '',
    '## 流程编排',
    '',
    `- **规模**：${scan.components.filter(component => /Flow|Handler|Service|Processor/i.test(component)).length} 个流程/服务/处理器候选。`,
    `- **基类**：未强制假设；以 ` + '`component-index.md`' + ` 中组件类型和源码为准。`,
    `- **典型示例**：${scenarios[0]?.name ?? domainTitle(scan)} 负责完成本域核心业务闭环。`,
    '',
    '### 按业务域归类',
    '',
    '| 域 | 代表入口 | 语义 |',
    '|----|---------|------|',
    ...scenarios.map(scenario => `| ${domainTitle(scan)} | \`${scenario.entry}\` | ${scenario.name} |`),
    '',
    '## 核心业务流程',
    '',
    ...scenarios.flatMap((scenario, index) => [
      `### 流程${chineseNumber(index + 1)}：${scenario.name}`,
      '',
      '| 步骤 | 行为 | 关键校验 | 测试数据要求 |',
      '|------|------|---------|-------------|',
      `| 1 | 通过 \`${scenario.entry}\` 触发流程 | 请求参数完整，业务对象存在或可创建 | 准备 ${businessEntities(scan).slice(0, 2).join('、') || '本域对象'} 基础数据 |`,
      `| 2 | ${domainTitle(scan)}执行规则校验和状态流转 | ${businessRules(scan)[0] ?? '业务规则需满足'} | 上游 fixture：${dependencyLabels(scan.domain.upstreamDependencies ?? []).join('、') || '无'} |`,
      `| 3 | 写入表或返回处理结果 | ${scan.dbTables.length ? `核心表 ${scan.dbTables.join('、')} 可查询` : '接口返回可验证结果'} | 使用校验接口或查询接口断言结果 |`,
      `| 4 | 通知或暴露给下游消费 | 下游消费者：${dependencyLabels(scan.domain.downstreamConsumers ?? []).join('、') || '无'} | 按 impact-map 选择回归范围 |`,
      '',
    ]),
    '## MQ 消费者',
    '',
    `- **规模**：${scan.sourceFiles.filter(file => /consumer/i.test(file)).length} 个 Consumer 文件候选。`,
    `- **基类模式**：${scan.components.some(component => /Consumer|Processor/i.test(component)) ? '发现 Consumer/Processor 命名候选，需按源码确认' : '未发现显式 MQ 消费者'}。`,
    '- **实现入口**：如新增异步消费，必须在 `component-index.md` 记录入口、主题和幂等字段。',
    '',
    '## 定时任务',
    '',
    `- **数量**：${scan.sourceFiles.filter(file => /job|task|schedule/i.test(file)).length} 个 Job/Task/Schedule 文件候选。`,
    '- **约束**：新增任务必须说明触发频率、幂等字段、失败重试和补偿策略。',
    '',
    '## 关键状态与异步',
    '',
    '| 状态/机制 | 说明 | 测试关注点 |',
    '|-----------|------|-----------|',
    '| 创建/提交 | 业务对象进入本域处理 | 参数校验、幂等、必填依赖 |',
    '| 可用/生效 | 业务对象可被下游查询或消费 | 查询接口、下游影响面回归 |',
    '| 删除/取消/失效 | 业务对象停止对外生效 | 清理数据、下游一致性 |',
    '| 异步补偿 | 依赖或写入失败后的重试 | 重复执行不产生脏数据 |',
    '',
    '## 接口 / 页面入口',
    '',
    ...(scan.routes.length ? scan.routes.map(route => `- \`${route}\`：${routePurpose(route, scan)}。`) : ['- 待确认：未扫描到接口入口。']),
    '',
    '## Agent 代码生成约束',
    '',
    '- 新增主流程时必须明确入口、状态、表、下游影响和测试造数要求。',
    '- 新增删除/取消类能力时必须补充清理策略和回归校验接口。',
    '- 涉及上游依赖时，测试用例必须先根据全局 `test-data-map.json` 生成 requiredUpstreamFixtures。',
    '',
  ].join('\n');
}

function renderEngineeringSpecLayer(scan: AppScan): string {
  const groups = groupComponents(scan);
  return [
    '# 04 工程与规范层',
    '',
    '> 模板来源：`04-engineering-spec-template.md`。证据来自源码命名、组件分组、接口和数据库扫描；未读取外部配置中心。',
    '',
    '## 仓库级强约束',
    '',
    '- 命名：沿用现有类名后缀，如 Service、Repository、DubboService、Support、Record、Context。',
    '- 分层：接口入口、业务服务、领域对象、数据访问要保持职责分离。',
    '- 数据：新增表必须具备唯一主键、业务状态、创建/更新时间或等价生命周期字段。',
    '- 测试：新增业务能力必须同步补充接口入口、造数方式、校验入口和清理策略。',
    '- 知识库：代码变更后必须同步刷新 app 知识库和 global GitNexus 图谱。',
    '',
    '## 异常体系',
    '',
    '| 类型 | 位置（示例） | 用途 |',
    '|------|-------------|------|',
    `| 业务异常 | ${componentEvidence('BusinessService', scan)} | 参数、状态、规则不满足时返回可理解错误 |`,
    '| 系统异常 | 待确认 | 依赖不可用、数据库失败、未知异常 |',
    '| 校验异常 | RequestParser / Controller / API 层 | 请求格式、必填字段、枚举值校验 |',
    '',
    '## MQ 基类与配置',
    '',
    `- Consumer 文件候选：${scan.sourceFiles.filter(file => /consumer/i.test(file)).length} 个。`,
    `- Processor 文件候选：${componentNames(scan).filter(component => /Processor/i.test(component)).length} 个。`,
    '- 当前未扫描到明确 MQ 基类时，不允许在技术方案中假设 MQ；需要新增异步能力时先补充组件和主题信息。',
    '',
    '## 流程基础设施',
    '',
    `- Service/Handler/Processor 候选：${(groups.Service ?? []).length} 个。`,
    `- Repository/Mapper 候选：${(groups.Repository ?? []).length + (groups.Mapper ?? []).length} 个。`,
    `- API/Dubbo 候选：${(groups.API ?? []).length + (groups.Dubbo ?? []).length} 个。`,
    '',
    '## 配置与开关',
    '',
    '| 配置项 | 用途 | 当前证据 |',
    '|--------|------|---------|',
    `| server port | HTTP 服务端口 | ${scan.domain.port ?? '待确认'} |`,
    '| feature switch | 控制发布/删除/支付等高风险能力 | 未发现独立开关，需按需求补充 |',
    '| datasource | 数据库连接 | schema.sql 仅提供表结构，不含连接信息 |',
    '',
    '## 测试与质量',
    '',
    '- 单元测试优先覆盖 Service/Repository 的规则和状态流转。',
    '- 集成测试优先覆盖 `api-index.md` 中的种子接口和校验接口。',
    '- E2E 测试必须使用 `global/gitnexus-graph/test-data-map.json` 的 requiredUpstreamFixtures。',
    '- 回归范围必须使用 `global/gitnexus-graph/impact-map.json`，不能只看单应用代码。',
    '',
    '## Agent 代码生成约束',
    '',
    '- 不允许绕过现有 Service/Repository 直接在入口层写复杂业务逻辑。',
    '- 不允许新增无法清理的测试数据；所有造数必须能通过 id/runId/status 定位。',
    '- 不允许新增跨应用调用但不更新 global dependency/impact 图。',
    '',
  ].join('\n');
}

function renderDatabaseDesignLayer(scan: AppScan): string {
  return [
    '# 05 数据库设计层',
    '',
    '> 模板依据：`assets/step3-db-scan.md` 和 full 模式 05 层要求。用于测试造数、清理、数据影响分析。',
    '',
    '## 表设计概览',
    '',
    '| 表名 | 业务对象 | 生命周期 | 下游影响 |',
    '|------|---------|---------|---------|',
    ...(scan.dbTables.length ? scan.dbTables.map(table => `| \`${table}\` | ${businessEntities(scan)[0] ?? domainTitle(scan)} | 创建 -> 处理中 -> 可用/失败 -> 取消/删除 | ${dependencyLabels(scan.domain.downstreamConsumers ?? []).join('、') || '无显式下游'} |`) : ['| 无自有表 | 无 | 无 | 依赖接口返回或上游数据 |']),
    '',
    '## 推荐测试数据模型',
    '',
    '| 数据类型 | 必填字段 | 生成策略 | 清理策略 |',
    '|----------|---------|---------|---------|',
    `| 主业务对象 | id、status、payload | 使用 ${seedRoutes(scan).map(route => `\`${route}\``).join('、') || 'SQL/fixture'} 生成 | 按 id 前缀或 runId 清理 |`,
    `| 上游依赖对象 | ${dependencyLabels(scan.domain.upstreamDependencies ?? []).join('、') || '无'} | 先调用上游 fixture，再执行本域流程 | 上游域负责清理 |`,
    '| 校验对象 | 查询接口返回字段 | 使用查询/列表/详情接口断言 | 不单独清理 |',
    '',
    '## 字段设计约束',
    '',
    '- id：必须稳定唯一，贯穿创建、查询、删除、清理。',
    '- status：必须能表达业务对象当前是否可被下游消费。',
    '- payload_json/ext_json：只放扩展信息，核心断言字段不要只埋在 JSON 中。',
    '- created_at/updated_at：用于排查和清理，不作为强精确时间断言。',
    '',
    '## 数据一致性与补偿',
    '',
    '- 写入本域表前需先确认上游 fixture 完成。',
    '- 删除/取消类流程必须确认下游消费者是否需要同步失效。',
    '- 异步或补偿流程需要记录可重试标识，避免重复造数导致脏数据。',
    '',
    '## Agent 代码生成约束',
    '',
    '- 新增表时必须同步更新 `db-schema.md`、`05_数据库设计层.md` 和全局 `test-data-map.json`。',
    '- 测试 SQL 不得依赖共享固定 id；必须使用 runId 或唯一前缀。',
    '- E2E 造数优先走接口；只有接口缺失时才使用 SQL fixture。',
    '',
  ].join('\n');
}

function renderEvolutionAdrLayer(scan: AppScan): string {
  const todoFiles = scan.sourceFiles.filter(file => /todo|fixme/i.test(file)).slice(0, 10);
  return [
    '# 06 演进与决策记录层',
    '',
    '> 模板来源：`05-evolution-adr-template.md`，按 full 模式映射为 06 层。证据来自静态扫描和领域配置；未做 git log 深度分析。',
    '',
    '## 架构决策记录（ADR）— 从代码反推的既定事实',
    '',
    '| ID | 决策 | 状态 | 证据 |',
    '|----|------|------|------|',
    `| ADR-001 | ${domainTitle(scan)}以独立应用维护领域边界 | 已落地 | ${scan.relativeRoot} / domain-context.json |`,
    `| ADR-002 | 接口、组件、表结构作为测试流程主要证据源 | 已落地 | api-index.md / component-index.md / db-schema.md |`,
    `| ADR-003 | 跨应用影响面统一进入 global GitNexus graph | 已落地 | global/gitnexus-graph/impact-map.json |`,
    `| ADR-004 | 测试造数统一进入 global test-data-map | 已落地 | global/gitnexus-graph/test-data-map.json |`,
    '',
    '## 技术债务与代码内 TODO（抽样）',
    '',
    ...(todoFiles.length ? todoFiles.map(file => `- \`${file}\` — 命中 TODO/FIXME 路径，需要人工复核。`) : ['- 静态路径扫描未发现 TODO/FIXME 文件名；如需更精确结果，需要 grep 文件内容。']),
    '',
    '## 依赖与模块演进',
    '',
    `- 上游依赖：${dependencyLabels(scan.domain.upstreamDependencies ?? []).join('、') || '无显式上游'}。`,
    `- 下游消费者：${dependencyLabels(scan.domain.downstreamConsumers ?? []).join('、') || '无显式下游'}。`,
    '- 任一依赖变化都必须同步刷新 global dependency-map 和 impact-map。',
    '',
    '## 安全与合规风险（静态）',
    '',
    '- 创建/删除/支付/发布类接口属于高风险入口，必须有权限、幂等和审计设计。',
    '- 测试数据不得写入真实用户、真实支付、真实物流等不可回滚资源。',
    '- payload_json 中不得写入敏感明文；如需脱敏字段，技术方案阶段明确。',
    '',
    '## 建议的后续演进',
    '',
    '1. 为核心业务流程补充稳定的 seed API 和 verification API。',
    '2. 为跨应用依赖补充真实调用证据，减少只靠领域配置推断。',
    '3. 为测试造数补充每个领域的清理接口或清理 SQL 模板。',
    '',
    '## Agent 代码生成约束',
    '',
    '- 做技术方案时先读取本层 ADR，避免重复推翻已落地约定。',
    '- 新增高风险接口必须在本层补充安全、幂等、清理和回滚说明。',
    '- 改动跨应用依赖时必须重新生成 global 知识库。',
    '',
  ].join('\n');
}

function renderApiIndex(scan: AppScan): string {
  return [
    `# ${scan.domain.serviceName ?? scan.name} API Index`,
    '',
    '> 标准用途：接口测试、E2E 编排、技术方案入口识别。生成依据为 OpenAPI、领域配置 sampleRoutes 和源码静态路由扫描。',
    '',
    `- 应用：${scan.appId}`,
    `- 领域：${domainTitle(scan)}`,
    `- 接口数量：${scan.routes.length}`,
    `- 端口：${scan.domain.port ?? '待确认'}`,
    '',
    '## 接口清单',
    '',
    '| 路径 | 方法 | 业务用途 | 测试类型 | 造数/校验提示 |',
    '|------|------|---------|---------|---------------|',
    ...(scan.routes.length ? scan.routes.map(route => `| \`${route}\` | ${routeMethod(route)} | ${routePurpose(route, scan)} | ${routeTestValue(route)} | ${routeDataHint(route, scan)} |`) : ['| 待确认 | 待确认 | 未扫描到接口 | 需要补充接口文档 | 无 |']),
    '',
    '## 测试入口分组',
    '',
    '### 种子/写入类接口',
    '',
    ...(seedRoutes(scan).length ? seedRoutes(scan).map(route => `- \`${route}\`：用于创建、发布、提交、支付、删除或状态变更类测试数据。`) : ['- 未发现显式种子接口，造数需使用数据库或上游接口。']),
    '',
    '### 查询/校验类接口',
    '',
    ...(verificationRoutes(scan).length ? verificationRoutes(scan).map(route => `- \`${route}\`：用于断言业务状态、列表结果或健康状态。`) : ['- 未发现显式查询接口，需补充校验入口。']),
    '',
    '## 跨应用影响提示',
    '',
    `- 上游依赖：${dependencyLabels(scan.domain.upstreamDependencies ?? []).join('、') || '无'}`,
    `- 下游消费者：${dependencyLabels(scan.domain.downstreamConsumers ?? []).join('、') || '无'}`,
    '- 技术方案和测试用例必须从 `global/gitnexus-graph/impact-map.json` 读取最终影响面。',
    '',
  ].join('\n');
}

function renderComponentIndex(scan: AppScan): string {
  const groups = groupComponents(scan);
  const entries = Object.entries(groups);
  return [
    `# ${scan.domain.serviceName ?? scan.name} Component Index`,
    '',
    '> 标准用途：代码生成落点、测试替身定位、影响分析证据。来源为源码类名/函数名和文件路径静态扫描。',
    '',
    `- 应用：${scan.appId}`,
    `- 源码文件数：${scan.sourceFiles.length}`,
    `- 组件候选数：${componentNames(scan).length}`,
    '',
    '## 组件类型汇总',
    '',
    '| 类型 | 数量 | 代码生成用途 |',
    '|------|------|-------------|',
    ...(entries.length ? entries.map(([kind, values]) => `| ${kind} | ${values.length} | ${componentGenerationUse(kind)} |`) : ['| 待确认 | 0 | 未扫描到组件 |']),
    '',
    ...entries.flatMap(([kind, values]) => [
      `## ${kind}`,
      '',
      '| 组件 | 可能职责 | 证据 |',
      '|------|---------|------|',
      ...values.slice(0, 80).map(component => `| \`${component}\` | ${componentMeaning(component, scan)} | ${componentEvidence(component, scan)} |`),
      '',
    ]),
    '## 代码生成约束',
    '',
    '- 新增业务服务时优先复用现有 Service/Repository/Dubbo 命名和包结构。',
    '- 新增测试时优先围绕 Service、Repository、Dubbo/HTTP 入口建立覆盖。',
    '- 删除或迁移组件时必须同步检查 `global/gitnexus-graph/edges.json` 的跨应用影响。',
    '',
  ].join('\n');
}

function renderDbSchema(scan: AppScan): string {
  return [
    `# ${scan.domain.serviceName ?? scan.name} DB Schema`,
    '',
    '> 标准用途：测试造数、清理策略、数据库影响分析。来源为 `src/main/resources/schema.sql` 静态扫描。',
    '',
    `- 应用：${scan.appId}`,
    `- 表数量：${scan.dbTables.length}`,
    '',
    '## 核心表',
    '',
    '| 表名 | 业务用途 | 推荐造数方式 | 清理策略 |',
    '|------|---------|-------------|---------|',
    ...(scan.dbTables.length ? scan.dbTables.map(table => `| \`${table}\` | ${tableMeaning(table, scan)} | 通过种子接口优先，其次 SQL 插入最小字段 | 按测试 runId/id 前缀清理，避免污染共享数据 |`) : ['| 无自有表 | 当前扫描未发现表定义 | 使用上游 fixture 或接口状态 | 无数据库清理动作 |']),
    '',
    '## 字段语义约定',
    '',
    '| 字段模式 | 业务含义 | 测试注意事项 |',
    '|----------|---------|-------------|',
    '| id / *_id | 业务对象或关联对象唯一标识 | 造数时使用稳定唯一值，便于清理 |',
    '| status | 业务状态 | 必须和流程文档状态保持一致 |',
    '| payload_json / ext_json | 扩展业务属性 | 保留必要字段，不要写空对象绕过校验 |',
    '| created_at / updated_at | 数据生命周期时间 | 时间类断言避免使用精确毫秒 |',
    '',
    '## 造数依赖',
    '',
    `- 上游 fixture：${dependencyLabels(scan.domain.upstreamDependencies ?? []).join('、') || '无'}`,
    `- 种子接口：${seedRoutes(scan).map(route => `\`${route}\``).join('、') || '未发现，需补充或使用 SQL'}`,
    `- 校验接口：${verificationRoutes(scan).map(route => `\`${route}\``).join('、') || '未发现，需补充断言方式'}`,
    '- 全局造数入口：`global/gitnexus-graph/test-data-map.json`。',
    '',
  ].join('\n');
}

function domainTitle(scan: AppScan): string {
  return scan.domain.domainName ?? scan.domain.domain ?? scan.appId;
}

function servicePosition(scan: AppScan): string {
  const capability = capabilityLabels(scan).slice(0, 3).join('、');
  const entities = businessEntities(scan).slice(0, 3).join('、');
  const summary = scan.domain.summary?.trim();
  if (summary) return `${domainTitle(scan)}服务，围绕${entities || capability || domainTitle(scan)}提供${capability || '核心业务'}能力。${summary}`;
  return `${domainTitle(scan)}服务，围绕${entities || domainTitle(scan)}提供${capability || '核心业务'}能力。`;
}

function capabilityLabels(scan: AppScan): string[] {
  return (scan.domain.capabilities ?? []).map(labelize).filter(Boolean);
}

function businessEntities(scan: AppScan): string[] {
  return unique([
    ...(scan.domain.owns ?? []),
    ...(scan.domain.requirementKeywords ?? []).filter(term => !/^[A-Z]{2,}$/.test(term)),
  ].map(labelize)).slice(0, 12);
}

function businessTerms(scan: AppScan): string[] {
  return unique([
    domainTitle(scan),
    ...(scan.domain.requirementKeywords ?? []),
    ...(scan.domain.capabilities ?? []),
    ...(scan.domain.owns ?? []),
    ...(scan.dbTables ?? []),
  ].map(labelize)).slice(0, 24);
}

function labelize(value: string): string {
  return value
    .replace(/^ecom-/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dependencyLabels(values: string[]): string[] {
  return values.map(labelize).filter(Boolean);
}

function downstreamPhrase(scan: AppScan): string {
  const consumers = dependencyLabels(scan.domain.downstreamConsumers ?? []);
  return consumers.length ? consumers.slice(0, 3).join('、') : '下游系统或运营页面';
}

function scenarioNames(scan: AppScan): Array<{ name: string; action: string; entry: string }> {
  const chineseTerms = (scan.domain.requirementKeywords ?? [])
    .map(labelize)
    .filter(term => /[\u4e00-\u9fa5]/.test(term));
  const capabilities = capabilityLabels(scan);
  const businessRoutes = unique([
    ...seedRoutes(scan),
    ...scan.routes.filter(route => !/health|knowledge|sample|validate-requirement/i.test(route)),
    ...verificationRoutes(scan).filter(route => !/health|knowledge|sample/i.test(route)),
  ]);
  const routes = businessRoutes.length ? businessRoutes : (scan.routes.length ? scan.routes : ['接口待确认']);
  const base = chineseTerms.length ? chineseTerms : (capabilities.length ? capabilities : businessEntities(scan).slice(0, 4));
  const values = (base.length ? base : [domainTitle(scan)]).slice(0, 4);
  return values.map((item, index) => ({
    name: `${domainTitle(scan)} - ${item}`,
    action: item,
    entry: routes[index % routes.length],
  }));
}

function businessRules(scan: AppScan): string[] {
  const entities = businessEntities(scan);
  const primary = entities[0] ?? domainTitle(scan);
  return [
    `${primary}必须具备唯一标识，重复提交时应按业务幂等处理，不能产生重复主数据。`,
    `${domainTitle(scan)}写入或状态变更前必须校验上游依赖数据是否存在且处于可用状态。`,
    `状态变更必须可追踪，失败时保留足够错误信息，支持测试流程定位失败原因。`,
    `对下游消费者暴露的数据必须保持字段语义稳定，删除/取消/失效类操作需要同步评估下游影响。`,
    ...(scan.dbTables.length ? [`涉及 ${scan.dbTables.join('、')} 的测试数据必须支持按测试标识清理。`] : ['当前未发现自有表，测试数据主要依赖接口返回和上游 fixture。']),
    ...(seedRoutes(scan).length ? [`创建/发布/提交类接口必须返回可用于后续查询或清理的业务标识。`] : ['未发现显式种子接口时，测试流程需要补充数据库或管理端造数方案。']),
  ];
}

function entityMeaning(entity: string, scan: AppScan): string {
  return `${domainTitle(scan)}中的核心业务对象，参与${capabilityLabels(scan).slice(0, 2).join('、') || '主流程'}能力`;
}

function termMeaning(term: string, scan: AppScan): string {
  if (scan.dbTables.includes(term)) return tableMeaning(term, scan);
  if (term === domainTitle(scan)) return `${scan.appId} 负责的业务边界`;
  return `${domainTitle(scan)}上下文中的业务概念，用于需求识别、影响分析和测试造数`;
}

function tableMeaning(table: string, scan: AppScan): string {
  const entity = businessEntities(scan)[0] ?? domainTitle(scan);
  return `${entity}相关业务数据表，支撑${capabilityLabels(scan).slice(0, 2).join('、') || domainTitle(scan)}场景`;
}

function routeMethod(route: string): string {
  if (/create|save|add|publish|submit|apply|pay|order|campaign|coupon|product|delete|cancel/i.test(route)) return 'POST/PUT/DELETE';
  if (/get|query|list|detail|status|preview|health|knowledge|sample/i.test(route)) return 'GET';
  return '待确认';
}

function routePurpose(route: string, scan: AppScan): string {
  if (/health/i.test(route)) return '服务健康检查';
  if (/knowledge/i.test(route)) return '返回领域知识和依赖事实';
  if (/sample/i.test(route)) return '返回样例业务对象';
  if (/validate-requirement/i.test(route)) return '校验需求是否命中本领域能力或依赖';
  if (/delete|cancel/i.test(route)) return `删除、取消或失效${domainTitle(scan)}业务对象`;
  if (/create|save|add|submit|apply/i.test(route)) return `创建或提交${domainTitle(scan)}业务对象`;
  if (/publish|enable|sale/i.test(route)) return `发布、生效或上架${domainTitle(scan)}业务对象`;
  if (/list|query|get|detail|status/i.test(route)) return `查询${domainTitle(scan)}业务对象状态`;
  return `${domainTitle(scan)}业务接口`;
}

function routeTestValue(route: string): string {
  if (/health/i.test(route)) return '冒烟测试';
  if (/knowledge|validate-requirement/i.test(route)) return '知识库/影响面验证';
  if (/create|save|add|publish|submit|apply|pay|delete|cancel/i.test(route)) return '集成/E2E 种子步骤';
  if (/get|query|list|detail|status|sample/i.test(route)) return '结果断言';
  return '按场景确认';
}

function routeDataHint(route: string, scan: AppScan): string {
  if (/health/i.test(route)) return '无需业务数据';
  if (/knowledge|sample/i.test(route)) return '可直接调用作为领域事实';
  if (/validate-requirement/i.test(route)) return '传入需求关键词和目标应用';
  if (/create|save|add|publish|submit|apply|pay/i.test(route)) return `准备${businessEntities(scan).slice(0, 3).join('、') || domainTitle(scan)}最小字段`;
  if (/delete|cancel/i.test(route)) return '先创建可删除/可取消对象，再执行清理';
  return '使用本域或上游 fixture';
}

function seedRoutes(scan: AppScan): string[] {
  return scan.routes.filter(route => /create|save|add|publish|submit|apply|pay|order|campaign|coupon|product|delete|cancel|enable/i.test(route)).slice(0, 20);
}

function verificationRoutes(scan: AppScan): string[] {
  return scan.routes.filter(route => /get|query|list|detail|status|preview|health|knowledge|sample/i.test(route)).slice(0, 20);
}

function componentNames(scan: AppScan): string[] {
  const fromFiles = scan.sourceFiles
    .map(file => path.basename(file).replace(/\.(java|ts|tsx|js|jsx|kt|go|py)$/, ''))
    .filter(name => name && !name.includes('.'));
  return unique([...scan.components, ...fromFiles]).slice(0, 180);
}

function groupComponents(scan: AppScan): Record<string, string[]> {
  const groups: Record<string, string[]> = {
    API: [],
    Dubbo: [],
    Service: [],
    Repository: [],
    Mapper: [],
    Domain: [],
    Support: [],
    UI: [],
    Other: [],
  };
  for (const component of componentNames(scan)) {
    const kind = componentKind(component);
    groups[kind].push(component);
  }
  return Object.fromEntries(Object.entries(groups).filter(([, values]) => values.length));
}

function componentKind(component: string): string {
  if (/Controller|Facade|Api|Route|AppServer/i.test(component)) return 'API';
  if (/Dubbo/i.test(component)) return 'Dubbo';
  if (/Service|Handler|Processor|Flow|Manager/i.test(component)) return 'Service';
  if (/Repository|Dao/i.test(component)) return 'Repository';
  if (/Mapper/i.test(component)) return 'Mapper';
  if (/Record|Entity|Domain|Context|Model|DTO|Request|Response/i.test(component)) return 'Domain';
  if (/Support|Parser|Config|Util|Json|Client/i.test(component)) return 'Support';
  if (/Page|View|Component|Panel|Button|Form/i.test(component)) return 'UI';
  return 'Other';
}

function componentGenerationUse(kind: string): string {
  const uses: Record<string, string> = {
    API: '新增 HTTP/页面入口时参考',
    Dubbo: '新增 RPC 接口和实现时参考',
    Service: '业务编排和领域服务落点',
    Repository: '持久化抽象和测试替身落点',
    Mapper: 'SQL/DO 变更落点',
    Domain: '实体、DTO、上下文对象扩展落点',
    Support: '解析、序列化、配置、工具能力复用',
    UI: '前端页面和组件扩展落点',
    Other: '需人工确认职责',
  };
  return uses[kind] ?? '需人工确认职责';
}

function componentMeaning(component: string, scan: AppScan): string {
  const kind = componentKind(component);
  if (kind === 'API') return `${domainTitle(scan)}对外入口或服务启动入口`;
  if (kind === 'Dubbo') return `${domainTitle(scan)}RPC 接口或实现`;
  if (kind === 'Service') return `${domainTitle(scan)}业务编排、规则校验或能力实现`;
  if (kind === 'Repository' || kind === 'Mapper') return `${domainTitle(scan)}数据读写或持久化适配`;
  if (kind === 'Domain') return `${domainTitle(scan)}领域对象、上下文或数据结构`;
  if (kind === 'Support') return `${domainTitle(scan)}基础支撑能力`;
  if (kind === 'UI') return `${domainTitle(scan)}前端交互组件`;
  return '静态扫描发现的组件，职责需结合源码确认';
}

function componentEvidence(component: string, scan: AppScan): string {
  const file = scan.sourceFiles.find(item => item.includes(`${component}.`) || item.includes(`/${component}`));
  return file ? `\`${file}\`` : '源码符号扫描';
}

function moduleRows(scan: AppScan): string[] {
  const roots = unique(scan.sourceFiles
    .filter(file => file.startsWith('src/') || file === 'pom.xml')
    .map(file => {
      const parts = file.split('/');
      if (parts[0] === 'src' && parts.length >= 4) return parts.slice(0, 4).join('/');
      return parts.slice(0, 2).join('/');
    })
    .filter(Boolean))
    .slice(0, 8);
  if (roots.length) {
    return roots.map(root => `| ${path.basename(root) || scan.appId} | \`${root}\` | ${moduleDesignPoint(root, scan)} |`);
  }
  return [`| ${scan.appId} | \`${scan.relativeRoot}\` | ${domainTitle(scan)}单模块应用 |`];
}

function moduleDesignPoint(root: string, scan: AppScan): string {
  if (/api/i.test(root)) return '对外接口、DTO 或 RPC 契约';
  if (/dubbo|service|application/i.test(root)) return '应用服务与业务编排';
  if (/domain/i.test(root)) return '领域模型、规则和上下文';
  if (/repository|infrastructure|mapper/i.test(root)) return '数据访问和外部系统适配';
  if (/resources/i.test(root)) return '配置、schema 和运行资源';
  return `${domainTitle(scan)}代码模块`;
}

function repositoryLocations(scan: AppScan): string[] {
  return unique(scan.sourceFiles.filter(file => /Repository|Dao/i.test(file)).map(file => path.dirname(file))).slice(0, 6);
}

function mapperLocations(scan: AppScan): string[] {
  return unique(scan.sourceFiles.filter(file => /Mapper/i.test(file)).map(file => path.dirname(file))).slice(0, 6);
}

function hasDubbo(scan: AppScan): boolean {
  return componentNames(scan).some(component => /Dubbo/i.test(component)) || scan.sourceFiles.some(file => /dubbo/i.test(file));
}

function chineseNumber(value: number): string {
  return ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][value] ?? String(value);
}

function anchor(value: string): string {
  return encodeURIComponent(value.toLowerCase().replace(/\s+/g, '-'));
}

function renderFreshness(
  scan: AppScan,
  versionId: string,
  generatedAt: string,
  gitNexus: GitNexusAnalyzeResult,
  generation: AppKnowledgeGeneration,
): string {
  return [
    '# KB Freshness',
    '',
    `- versionId: ${versionId}`,
    `- appId: ${scan.appId}`,
    `- sourceCommitSha: ${scan.sourceCommitSha ?? 'unknown'}`,
    `- lastGeneratedAt: ${generatedAt}`,
    `- status: fresh`,
    `- updateMethod: ${generation.mode}`,
    `- modelId: ${generation.modelId ?? 'none'}`,
    `- gitNexusStatus: ${gitNexus.status}`,
    `- gitNexusIndexedAt: ${gitNexus.indexedAt ?? 'unknown'}`,
    generation.error ? `- fallbackReason: ${generation.error}` : '',
    '',
  ].filter(Boolean).join('\n');
}

function renderAppGitNexusSummary(scan: AppScan, gitNexus: GitNexusAnalyzeResult): string {
  return [
    `# ${scan.name} GitNexus Graph Summary`,
    '',
    '> This app-level directory is a local graph projection only. Cross-app impact analysis, test design, and test data planning MUST consume `../../../../global/gitnexus-graph/`; raw GitNexus indexes are centralized under `../../../../global/gitnexus-indexes/`.',
    '',
    `- Status: ${gitNexus.status}`,
    `- Global index path: ${gitNexus.indexPath}`,
    `- Registry path: ${gitNexus.registryPath}`,
    '- Global graph path: global/gitnexus-graph/',
    `- Indexed at: ${gitNexus.indexedAt ?? 'unknown'}`,
    `- Files: ${gitNexus.stats?.files ?? 0}`,
    `- Nodes: ${gitNexus.stats?.nodes ?? 0}`,
    `- Edges: ${gitNexus.stats?.edges ?? 0}`,
    `- Flows: ${gitNexus.stats?.processes ?? 0}`,
    gitNexus.error ? `- Error: ${gitNexus.error}` : '',
    '',
  ].filter(Boolean).join('\n');
}

function renderGlobalContext(appSummaries: AppKnowledgeSummary[], edges: unknown[]): string {
  return [
    '# Global Ecom Knowledge Context',
    '',
    `Applications: ${appSummaries.length}`,
    `Dependency edges: ${edges.length}`,
    '',
    '> Generated after application knowledge bases were written. Global context only consumes app-level CONTEXT/KB_INDEX/api-index excerpts to keep token usage bounded.',
    '',
    '## Applications',
    ...appSummaries.map(summary => `- ${summary.appId}: ${firstMeaningfulLine(summary.contextExcerpt) || summary.name}`),
    '',
    '## Cross-App Dependencies',
    ...(edges.length ? edges.map(edge => `- ${(edge as { fromAppId: string }).fromAppId} -> ${(edge as { toAppId: string }).toAppId}: ${(edge as { summary: string }).summary}`) : ['- none']),
    '',
    '## App Knowledge Inputs',
    ...appSummaries.map(summary => [
      `### ${summary.appId}`,
      '',
      `- Knowledge path: ${summary.knowledgePath}`,
      `- Context: ${firstMeaningfulLine(summary.contextExcerpt) || 'TBD'}`,
      `- Index: ${firstMeaningfulLine(summary.indexExcerpt) || 'TBD'}`,
      `- API: ${firstMeaningfulLine(summary.apiExcerpt) || 'TBD'}`,
      '',
    ].join('\n')),
    '',
  ].join('\n');
}

function firstMeaningfulLine(content: string): string {
  return content
    .split(/\r?\n/)
    .map(line => line.replace(/^[-#>\s]+/, '').trim())
    .find(line => line && !line.includes('Generated after application knowledge bases')) ?? '';
}

function renderBusinessGlossary(scans: AppScan[]): string {
  return [
    '# Business Glossary',
    '',
    ...scans.flatMap(scan => (scan.domain.requirementKeywords ?? []).map(term => `- ${term}: ${scan.appId}`)),
    '',
  ].join('\n');
}

function renderInitReport(versionId: string, apps: AppKnowledgeResult[]): string {
  return [
    '# Knowledge Initialization Report',
    '',
    `Version: ${versionId}`,
    `Applications: ${apps.length}`,
    `Created: ${apps.filter(app => app.status === 'created').length}`,
    `Failed: ${apps.filter(app => app.status === 'failed').length}`,
    '',
    '| App | Generation | GitNexus | Files |',
    '| --- | --- | --- | ---: |',
    ...apps.map(app => `| ${app.appId} | ${app.status} / ${app.generationMode}${app.modelId ? ` (${app.modelId})` : ''} | ${app.gitNexus.status} | ${app.generatedFiles.length} |`),
    '',
  ].join('\n');
}

function renderGlobalGraphSummary(scans: AppScan[], edges: unknown[], gitNexusResults: Map<string, GitNexusAnalyzeResult>): string {
  return [
    '# Global GitNexus Graph Summary',
    '',
    '> Canonical graph entrypoint for downstream technical design, impact analysis, test case generation, and test data planning. Raw GitNexus indexes are centralized in `global/gitnexus-indexes/`; app knowledge folders only contain lightweight projections.',
    '',
    `Apps: ${scans.length}`,
    `Dependency edges: ${edges.length}`,
    '',
    '## Consumer Files',
    '- `nodes.json`: app-level graph nodes with GitNexus index stats.',
    '- `edges.json`: cross-app dependency edges.',
    '- `capability-to-code-map.json`: capability to source/component hints.',
    '- `impact-map.json`: upstream/downstream impact lookup by changed app.',
    '- `test-data-map.json`: DB/API/entity hints for integration and E2E test data setup.',
    '- `../gitnexus-indexes/{appId}`: raw GitNexus index snapshots by application.',
    '',
    '## GitNexus Indexes',
    ...scans.map(scan => {
      const result = gitNexusResults.get(scan.appId);
      return `- ${scan.appId}: ${result?.status ?? 'failed'} (${result?.stats?.nodes ?? 0} nodes, ${result?.stats?.edges ?? 0} edges, ${result?.stats?.processes ?? 0} flows)`;
    }),
    '',
  ].join('\n');
}

function renderListDoc(title: string, values: string[], empty: string): string {
  return [`# ${title}`, '', ...(values.length ? values.map(value => `- ${value}`) : [`- ${empty}`]), ''].join('\n');
}

function buildAppNodes(scan: AppScan, gitNexus: GitNexusAnalyzeResult): unknown[] {
  return [
    { id: `app:${scan.appId}`, kind: 'app', label: scan.name },
    ...scan.routes.map(route => ({ id: `api:${scan.appId}:${route}`, kind: 'api', label: route })),
    ...scan.components.slice(0, 80).map(component => ({ id: `component:${scan.appId}:${component}`, kind: 'component', label: component })),
    { id: `gitnexus:${scan.appId}`, kind: 'gitnexus-index', label: gitNexus.status, stats: gitNexus.stats },
  ];
}

function buildAppEdges(scan: AppScan): unknown[] {
  return [
    ...scan.routes.map(route => ({ from: `app:${scan.appId}`, to: `api:${scan.appId}:${route}`, kind: 'exposes-api' })),
    ...scan.components.slice(0, 80).map(component => ({ from: `app:${scan.appId}`, to: `component:${scan.appId}:${component}`, kind: 'contains' })),
  ];
}

function buildDependencyEdges(scans: AppScan[]): unknown[] {
  const byDomain = new Map<string, AppScan>();
  for (const scan of scans) {
    byDomain.set(scan.appId, scan);
    byDomain.set(scan.appId.replace(/^ecom-/, ''), scan);
    if (scan.domain.domain) byDomain.set(scan.domain.domain, scan);
  }
  const edges: unknown[] = [];
  const seen = new Set<string>();
  for (const scan of scans) {
    for (const dep of scan.domain.upstreamDependencies ?? []) {
      const target = byDomain.get(dep);
      if (!target) continue;
      const key = `${scan.appId}->${target.appId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        fromAppId: scan.appId,
        toAppId: target.appId,
        type: 'upstream-dependency',
        summary: `${scan.appId} depends on ${target.appId}`,
        evidence: [`apps/${scan.appId}/app-knowledge-base/CONTEXT.md`],
      });
    }
  }
  return edges;
}

function buildGlobalImpactMap(scans: AppScan[], edges: unknown[]): unknown {
  const directUpstream = new Map<string, string[]>();
  const directDownstream = new Map<string, string[]>();
  for (const edge of edges as Array<{ fromAppId: string; toAppId: string }>) {
    directUpstream.set(edge.fromAppId, unique([...(directUpstream.get(edge.fromAppId) ?? []), edge.toAppId]));
    directDownstream.set(edge.toAppId, unique([...(directDownstream.get(edge.toAppId) ?? []), edge.fromAppId]));
  }
  return {
    generatedFrom: 'app-knowledge-base + domain dependency metadata',
    usage: {
      technicalDesign: 'Use changedApp.impactedApps to decide cross-app design scope.',
      testCaseGeneration: 'Use impactedApps + exposedApis + dbTables to derive integration/E2E coverage.',
      testDataPlanning: 'Use upstreamDependencies to prepare required upstream fixtures before app scenario data.',
    },
    apps: Object.fromEntries(scans.map(scan => {
      const downstream = directDownstream.get(scan.appId) ?? [];
      const upstream = directUpstream.get(scan.appId) ?? [];
      return [scan.appId, {
        changedApp: scan.appId,
        domain: scan.domain.domainName ?? scan.domain.domain ?? scan.appId,
        impactedApps: downstream,
        upstreamDependencies: upstream,
        downstreamConsumers: downstream,
        exposedApis: scan.routes.slice(0, 40),
        dbTables: scan.dbTables,
        coreComponents: scan.components.slice(0, 40),
        evidence: [
          `apps/${scan.appId}/app-knowledge-base/CONTEXT.md`,
          `apps/${scan.appId}/app-knowledge-base/KB_INDEX.md`,
          'global/gitnexus-graph/edges.json',
          'global/gitnexus-graph/nodes.json',
          `global/gitnexus-indexes/${scan.appId}/gitnexus.json`,
        ],
      }];
    })),
  };
}

function buildGlobalTestDataMap(scans: AppScan[], edges: unknown[]): unknown {
  const upstreamByApp = new Map<string, string[]>();
  for (const edge of edges as Array<{ fromAppId: string; toAppId: string }>) {
    upstreamByApp.set(edge.fromAppId, unique([...(upstreamByApp.get(edge.fromAppId) ?? []), edge.toAppId]));
  }
  return {
    generatedFrom: 'app-knowledge-base + db-schema + api-index',
    usage: {
      unit: 'Use ownedEntities and coreComponents to build focused fixtures.',
      integration: 'Use requiredUpstreamFixtures before invoking exposedApis.',
      e2e: 'Use scenarioSeedApis and dbTables to create business-state setup/cleanup plans.',
    },
    apps: Object.fromEntries(scans.map(scan => [scan.appId, {
      domain: scan.domain.domainName ?? scan.domain.domain ?? scan.appId,
      ownedEntities: scan.domain.owns ?? [],
      capabilities: scan.domain.capabilities ?? [],
      dbTables: scan.dbTables,
      scenarioSeedApis: scan.routes.filter(route => /create|save|add|publish|submit|apply|pay|order|campaign|coupon|product/i.test(route)).slice(0, 20),
      verificationApis: scan.routes.filter(route => /get|query|list|detail|status|preview|health/i.test(route)).slice(0, 20),
      requiredUpstreamFixtures: upstreamByApp.get(scan.appId) ?? [],
      fixtureEvidence: [
        'global/gitnexus-graph/impact-map.json',
        `apps/${scan.appId}/app-knowledge-base/db-schema.md`,
        `apps/${scan.appId}/app-knowledge-base/api-index.md`,
        `apps/${scan.appId}/app-knowledge-base/03_核心流程与逻辑层.md`,
      ],
    }])),
  };
}

function buildCapabilityToCodeMap(scans: AppScan[]): unknown {
  return Object.fromEntries(scans.map(scan => [scan.appId, {
    capabilities: scan.domain.capabilities ?? [],
    sourceFiles: scan.sourceFiles.slice(0, 40),
    components: scan.components.slice(0, 40),
  }]));
}

function summarizeGitNexus(result: GitNexusAnalyzeResult): Pick<GitNexusAnalyzeResult, 'status' | 'stats' | 'indexedAt' | 'indexPath' | 'error'> {
  return {
    status: result.status,
    stats: result.stats,
    indexedAt: result.indexedAt,
    indexPath: result.indexPath,
    error: result.error,
  };
}

function failedGitNexus(scan: AppScan): GitNexusAnalyzeResult {
  return {
    repoName: scan.appId,
    repoRoot: scan.root,
    indexPath: '',
    registryPath: '',
    status: 'failed',
    stdout: '',
    stderr: '',
  };
}

function listSourceFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (dir: string): void => {
    if (!fs.existsSync(dir) || result.length >= 800) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist', 'build', 'logs', 'pids'].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (/\.(ts|tsx|js|jsx|java|kt|go|py|html|css|md|yaml|yml|json|sql)$/.test(entry.name)) result.push(fullPath);
      if (result.length >= 800) return;
    }
  };
  visit(root);
  return result;
}

function extractRoutes(content: string): string[] {
  const routes = new Set<string>();
  const patterns = [
    /case\s+["'`]([^"'`]+)["'`]\s*->/g,
    /['"`](\/(?:api|business|health|knowledge|sample|validate-requirement)[^'"`]*)['"`]/g,
    /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\(([^)]*)\)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      const value = (match[2] ?? match[1] ?? '').replace(/[{}"'`]/g, '').split(',')[0].trim();
      if (value.startsWith('/')) routes.add(value);
    }
  }
  return [...routes];
}

function extractComponents(content: string): string[] {
  const names = new Set<string>();
  const patterns = [
    /\b(class|interface|enum|record)\s+([A-Z][A-Za-z0-9_]*)/g,
    /\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)/g,
    /\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) names.add(match[2] ?? match[1]);
  }
  return [...names];
}

function extractTables(sql: string): string[] {
  const tables = new Set<string>();
  const pattern = /CREATE TABLE IF NOT EXISTS\s+([a-zA-Z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(sql))) tables.add(match[1]);
  return [...tables];
}

function gitHead(root: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function readJson<T>(file: string): T | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

function readText(file: string): string {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean).map(value => value.trim()).filter(Boolean))];
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function relative(root: string, file: string): string {
  return path.relative(root, file).replace(/\\/g, '/');
}

function timestampForVersion(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}
