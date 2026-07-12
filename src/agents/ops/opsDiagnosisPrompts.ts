import * as fs from 'fs';
import * as path from 'path';
import type { OpsAlertAnalysis } from './types.js';

export function buildOpsDiagnosisSystemPrompt(): string {
  return readOpsPrompt('diagnosis/system.md');
}

export function buildOpsDiagnosisPrompt(analysis: OpsAlertAnalysis): string {
  return renderTemplate(readOpsPrompt('diagnosis/user.md'), {
    schema: JSON.stringify({
      summary: '一句话说明故障判断',
      rootCause: '最可能根因，必须引用证据',
      evidence: ['关键证据 1', '关键证据 2'],
      repairPlan: ['按优先级排序的处置动作 1', '处置动作 2'],
    }, null, 2),
    application: JSON.stringify({
      appId: analysis.app.appId,
      name: analysis.app.name,
      description: analysis.app.description,
      dependencies: analysis.app.dependencies,
      codeSignals: analysis.app.codeSignals,
    }, null, 2),
    alert: analysis.alert,
    alertContext: JSON.stringify({
      category: analysis.category,
      categoryLabel: analysis.categoryLabel,
      confidence: analysis.confidence,
      matchedKeywords: analysis.matchedKeywords,
      impact: analysis.impact,
    }, null, 2),
    similarAlertEvidence: formatEvidenceForPrompt(analysis.similarAlertEvidence),
    logEvidence: formatEvidenceForPrompt(analysis.logEvidence),
    codeEvidence: formatEvidenceForPrompt(analysis.codeEvidence),
    knowledgeEvidence: formatEvidenceForPrompt(analysis.knowledgeEvidence),
    toolResults: analysis.toolResults.map(item => `${item.label} [${item.status}] tools=${item.tools.join(', ')}\n${item.output}`).join('\n\n'),
  });
}

function formatEvidenceForPrompt(items: Array<{ path: string; reason: string; snippet?: string; score?: number; source?: string }>): string {
  if (!items.length) return '未命中。';
  return items.slice(0, 8).map(item => [
    `- path: ${item.path}`,
    `  reason: ${item.reason}`,
    item.score !== undefined ? `  score: ${item.score.toFixed(4)}` : '',
    item.source ? `  source: ${item.source}` : '',
    item.snippet ? `  snippet: ${truncateText(item.snippet, 1200).replace(/\n/g, '\n    ')}` : '',
  ].filter(Boolean).join('\n')).join('\n');
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function readOpsPrompt(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'prompts', 'ops', fileName), 'utf-8');
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}
