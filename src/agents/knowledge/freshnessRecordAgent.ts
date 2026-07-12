import * as fs from 'fs';
import * as path from 'path';
import type {
  KnowledgeAgentDefinition,
  KnowledgeAgentRunResult,
  KnowledgeGeneratedFile,
  KnowledgeRepositoryScan,
} from './types.js';

export const KNOWLEDGE_FRESHNESS_RECORD_AGENT: KnowledgeAgentDefinition = {
  id: 'knowledge-freshness-record',
  label: '知识库新鲜度记录 Agent',
  description: '记录知识库版本、产物数量、源码提交、生成模式和失败信息，供后续增量刷新判断。',
  defaultTools: ['read_file', 'write_file'],
  outputArtifacts: ['global/init-report.json', 'global/init-report.md', 'apps/{appId}/app-knowledge-base/KB_FRESHNESS.md'],
};

export async function runKnowledgeFreshnessRecordAgent(args: {
  scans: KnowledgeRepositoryScan[];
  knowledgeRoot: string;
  versionId?: string;
  startedAt?: string;
  generatedFiles?: KnowledgeGeneratedFile[];
  failures?: Array<{ appId?: string; message: string }>;
}): Promise<KnowledgeAgentRunResult<{
  generatedFiles: KnowledgeGeneratedFile[];
}>> {
  const versionId = args.versionId ?? `kb-${timestamp()}`;
  const startedAt = args.startedAt ?? new Date().toISOString();
  const finishedAt = new Date().toISOString();
  const globalRoot = path.join(args.knowledgeRoot, 'global');
  fs.mkdirSync(globalRoot, { recursive: true });
  const report = {
    versionId,
    startedAt,
    finishedAt,
    appCount: args.scans.length,
    generatedFileCount: args.generatedFiles?.length ?? 0,
    failures: args.failures ?? [],
    apps: args.scans.map(scan => ({
      appId: scan.appId,
      name: scan.name,
      sourceCommitSha: scan.sourceCommitSha,
      knowledgePath: `apps/${scan.appId}/app-knowledge-base`,
    })),
  };
  const generatedFiles: KnowledgeGeneratedFile[] = [
    writeJson(path.join(globalRoot, 'init-report.json'), report, 'Knowledge initialization report'),
    writeText(path.join(globalRoot, 'init-report.md'), renderReport(report), 'Knowledge initialization report markdown'),
  ];
  return {
    nodeId: KNOWLEDGE_FRESHNESS_RECORD_AGENT.id,
    status: report.failures.length ? 'failed' : 'completed',
    output: `freshness_record => version=${versionId}, apps=${report.appCount}, files=${report.generatedFileCount}, failures=${report.failures.length}。`,
    data: { generatedFiles },
  };
}

function renderReport(report: {
  versionId: string;
  startedAt: string;
  finishedAt: string;
  appCount: number;
  generatedFileCount: number;
  failures: Array<{ appId?: string; message: string }>;
  apps: Array<{ appId: string; name: string; sourceCommitSha?: string; knowledgePath: string }>;
}): string {
  return [
    '# Knowledge Initialization Report',
    '',
    `- Version: ${report.versionId}`,
    `- Started: ${report.startedAt}`,
    `- Finished: ${report.finishedAt}`,
    `- Apps: ${report.appCount}`,
    `- Generated files: ${report.generatedFileCount}`,
    `- Failures: ${report.failures.length}`,
    '',
    '## Apps',
    ...report.apps.map(app => `- ${app.appId}: ${app.knowledgePath} (${app.sourceCommitSha ?? 'unknown'})`),
    '',
    '## Failures',
    ...(report.failures.length ? report.failures.map(failure => `- ${failure.appId ?? 'global'}: ${failure.message}`) : ['- none']),
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

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
}
