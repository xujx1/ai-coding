import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createEcomLocalGitService } from '../../integrations/git.js';
import type {
  KnowledgeAgentDefinition,
  KnowledgeAgentRunResult,
  KnowledgeDomainContext,
  KnowledgeGeneratedFile,
  KnowledgeRepositoryScan,
} from './types.js';

export const KNOWLEDGE_REPOSITORY_SCAN_AGENT: KnowledgeAgentDefinition = {
  id: 'knowledge-repository-scan',
  label: '应用仓库扫描 Agent',
  description: '扫描 ecom 应用仓库、领域上下文、OpenAPI、源码入口、数据库表和组件信号。',
  defaultTools: ['glob', 'grep', 'read_file'],
  outputArtifacts: ['registry/repositories.json', 'registry/apps.json'],
};

export async function runKnowledgeRepositoryScanAgent(args: {
  ecomRoot?: string;
  workspaceRoot?: string;
  knowledgeRoot?: string;
  maxSourceFiles?: number;
} = {}): Promise<KnowledgeAgentRunResult<{
  scans: KnowledgeRepositoryScan[];
  generatedFiles: KnowledgeGeneratedFile[];
}>> {
  const workspaceRoot = path.resolve(args.workspaceRoot ?? process.cwd());
  const ecomRoot = path.resolve(args.ecomRoot ?? path.join(workspaceRoot, 'demo', 'ecom'));
  const service = createEcomLocalGitService(ecomRoot);
  const scans = service.listRepositories().map(repo => scanRepository({
    appId: repo.appId ?? repo.repoId,
    name: repo.name,
    root: repo.root,
    ecomRoot,
    maxSourceFiles: args.maxSourceFiles ?? 240,
  }));
  const generatedFiles: KnowledgeGeneratedFile[] = [];
  if (args.knowledgeRoot) {
    const registryRoot = path.join(args.knowledgeRoot, 'registry');
    fs.mkdirSync(registryRoot, { recursive: true });
    generatedFiles.push(writeJson(path.join(registryRoot, 'repositories.json'), scans.map(scan => ({
      appId: scan.appId,
      name: scan.name,
      root: scan.root,
      relativeRoot: scan.relativeRoot,
      sourceCommitSha: scan.sourceCommitSha,
    })), 'Repository scan registry'));
    generatedFiles.push(writeJson(path.join(registryRoot, 'apps.json'), scans.map(scan => ({
      appId: scan.appId,
      name: scan.name,
      domain: scan.domain,
      routes: scan.routes,
      components: scan.components,
      dbTables: scan.dbTables,
      sourceFileCount: scan.sourceFiles.length,
    })), 'Application scan registry'));
  }
  return {
    nodeId: KNOWLEDGE_REPOSITORY_SCAN_AGENT.id,
    status: 'completed',
    output: `repository_scan => 扫描 ${scans.length} 个应用仓库。`,
    data: { scans, generatedFiles },
  };
}

function scanRepository(args: {
  appId: string;
  name: string;
  root: string;
  ecomRoot: string;
  maxSourceFiles: number;
}): KnowledgeRepositoryScan {
  const sourceFiles = listSourceFiles(args.root, args.maxSourceFiles);
  const routes = new Set<string>();
  const components = new Set<string>();
  const dbTables = new Set<string>();
  for (const file of sourceFiles) {
    const content = safeRead(file);
    if (!content) continue;
    extractRoutes(content).forEach(route => routes.add(route));
    extractComponents(content).forEach(component => components.add(component));
    extractDbTables(content).forEach(table => dbTables.add(table));
  }
  return {
    appId: args.appId,
    name: args.name,
    root: args.root,
    relativeRoot: path.relative(args.ecomRoot, args.root).replace(/\\/g, '/'),
    domain: readDomainContext(args.root),
    routes: [...routes].slice(0, 120),
    components: [...components].slice(0, 120),
    dbTables: [...dbTables].slice(0, 120),
    sourceFiles: sourceFiles.map(file => path.relative(args.root, file).replace(/\\/g, '/')),
    sourceCommitSha: headSha(args.root),
  };
}

function readDomainContext(root: string): KnowledgeDomainContext {
  const file = path.join(root, 'knowledge', 'domain-context.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as KnowledgeDomainContext;
  } catch {
    return {};
  }
}

function listSourceFiles(root: string, limit: number): string[] {
  const result: string[] = [];
  const visit = (dir: string): void => {
    if (result.length >= limit || !fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (result.length >= limit) return;
      if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist', 'build'].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (/\.(ts|tsx|js|jsx|java|kt|go|py|md|sql|xml|yaml|yml|json|properties)$/.test(entry.name)) {
        result.push(fullPath);
      }
    }
  };
  visit(root);
  return result;
}

function extractRoutes(content: string): string[] {
  const routes = new Set<string>();
  const patterns = [
    /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\(([^)]*)\)/g,
    /\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g,
    /path\s*:\s*['"`]([^'"`]+)['"`]/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      const route = (match[2] ?? match[1] ?? '').replace(/["'`{}]/g, '').split(',')[0].trim();
      if (route.startsWith('/')) routes.add(route);
    }
  }
  return [...routes];
}

function extractComponents(content: string): string[] {
  const components = new Set<string>();
  const patterns = [
    /\b(class|interface|type|enum)\s+([A-Z][A-Za-z0-9_]*)/g,
    /@(Service|Component|Repository|Controller|RestController)\b[\s\S]{0,160}?\bclass\s+([A-Z][A-Za-z0-9_]*)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      components.add(match[3] ?? match[2] ?? match[1]);
    }
  }
  return [...components];
}

function extractDbTables(content: string): string[] {
  const tables = new Set<string>();
  const patterns = [
    /@Table\s*\(\s*name\s*=\s*["']([^"']+)["']/g,
    /\b(?:from|join|update|into)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    /\bcreate\s+table\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) tables.add(match[1]);
  }
  return [...tables];
}

function safeRead(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 500_000) return undefined;
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function headSha(root: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown, summary: string): KnowledgeGeneratedFile {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  return { path: file, bytes: fs.statSync(file).size, summary };
}
