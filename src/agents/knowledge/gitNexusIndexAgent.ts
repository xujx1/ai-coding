import * as fs from 'fs';
import * as path from 'path';
import { analyzeGitNexusRepository, type GitNexusAnalyzeResult } from '../../integrations/gitnexus.js';
import type {
  KnowledgeAgentDefinition,
  KnowledgeAgentRunResult,
  KnowledgeGeneratedFile,
  KnowledgeRepositoryScan,
} from './types.js';

export const KNOWLEDGE_GITNEXUS_INDEX_AGENT: KnowledgeAgentDefinition = {
  id: 'knowledge-gitnexus-index',
  label: 'GitNexus 图谱索引 Agent',
  description: '为每个应用生成 GitNexus 索引、节点边图谱和跨应用依赖证据。',
  defaultTools: ['gitnexus_search', 'read_file'],
  outputArtifacts: ['global/gitnexus-indexes/{appId}', 'apps/{appId}/app-knowledge-base/gitnexus'],
};

export async function runKnowledgeGitNexusIndexAgent(args: {
  scans: KnowledgeRepositoryScan[];
  knowledgeRoot?: string;
  gitNexusBinPath?: string;
  gitNexusHome?: string;
  timeoutMs?: number;
}): Promise<KnowledgeAgentRunResult<{
  indexes: GitNexusAnalyzeResult[];
  generatedFiles: KnowledgeGeneratedFile[];
}>> {
  const knowledgeRoot = args.knowledgeRoot ? path.resolve(args.knowledgeRoot) : undefined;
  const gitNexusHome = path.resolve(args.gitNexusHome ?? path.join(knowledgeRoot ?? process.cwd(), '.gitnexus-home'));
  const indexOutputRoot = path.join(knowledgeRoot ?? process.cwd(), 'global', 'gitnexus-indexes');
  const indexes = args.scans.map(scan => analyzeGitNexusRepository({
    repoRoot: scan.root,
    repoName: scan.appId,
    gitNexusHome,
    indexOutputRoot,
    binPath: args.gitNexusBinPath,
    timeoutMs: args.timeoutMs,
  }));
  const generatedFiles: KnowledgeGeneratedFile[] = [];
  if (knowledgeRoot) {
    const graphRoot = path.join(knowledgeRoot, 'global', 'gitnexus-graph');
    fs.mkdirSync(graphRoot, { recursive: true });
    generatedFiles.push(writeJson(path.join(graphRoot, 'index-summary.json'), indexes.map(summarizeIndex), 'GitNexus index summary'));
    generatedFiles.push(writeText(path.join(graphRoot, 'graph-summary.md'), renderGitNexusSummary(indexes), 'GitNexus graph summary'));
  }
  const failed = indexes.filter(index => index.status === 'failed').length;
  return {
    nodeId: KNOWLEDGE_GITNEXUS_INDEX_AGENT.id,
    status: failed === indexes.length && indexes.length > 0 ? 'failed' : 'completed',
    output: `gitnexus_index => ${indexes.length - failed}/${indexes.length} 个应用索引成功。`,
    data: { indexes, generatedFiles },
  };
}

function summarizeIndex(index: GitNexusAnalyzeResult): unknown {
  return {
    repoName: index.repoName,
    repoRoot: index.repoRoot,
    status: index.status,
    indexedAt: index.indexedAt,
    indexPath: index.indexPath,
    stats: index.stats,
    error: index.error,
  };
}

function renderGitNexusSummary(indexes: GitNexusAnalyzeResult[]): string {
  return [
    '# Global GitNexus Index Summary',
    '',
    `Generated at: ${new Date().toISOString()}`,
    `Applications: ${indexes.length}`,
    `Succeeded: ${indexes.filter(index => index.status !== 'failed').length}`,
    `Failed: ${indexes.filter(index => index.status === 'failed').length}`,
    '',
    '| App | Status | Nodes | Edges | Flows |',
    '| --- | --- | ---: | ---: | ---: |',
    ...indexes.map(index => `| ${index.repoName} | ${index.status} | ${index.stats?.nodes ?? 0} | ${index.stats?.edges ?? 0} | ${index.stats?.processes ?? 0} |`),
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
