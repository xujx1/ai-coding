import * as fs from 'fs';
import * as path from 'path';
import type { OpsAlertAnalysis, OpsAlertClassification, OpsApplication } from './types.js';

export function buildRecommendedActions(
  classification: OpsAlertClassification,
  app: OpsApplication,
  logEvidence: OpsAlertAnalysis['logEvidence'],
  evidence: OpsAlertAnalysis['codeEvidence'],
  knowledgeEvidence: OpsAlertAnalysis['knowledgeEvidence'],
): string[] {
  const evidenceAction = evidence.length
    ? `优先阅读 ${evidence.slice(0, 3).map(item => item.path).join('、')}，这些文件与告警关键词匹配度最高`
    : '当前代码扫描没有明显命中文件，需要补充接口名、异常栈或 traceId';
  const logAction = logEvidence.length
    ? `先核对 ${logEvidence.slice(0, 3).map(item => item.path).join('、')}，这些本地日志命中告警或 trace 关键词`
    : `配置的本地日志源未命中 ${app.appId} 的明显线索，建议补充 traceId、错误码或更精确时间窗口`;
  const knowledgeAction = knowledgeEvidence.length
    ? `同步核对 ${knowledgeEvidence.slice(0, 3).map(item => item.path).join('、')}，这些知识库/GitNexus 产物命中告警关键词`
    : '知识库和 GitNexus 未命中明显线索，建议先刷新应用知识库或补充更具体告警字段';
  return renderPromptList('guidance/recommended-actions.md', {
    appId: app.appId,
    classificationLabel: classification.label,
    classificationType: classification.faultType,
    confidence: `${(classification.confidence * 100).toFixed(0)}%`,
    logAction,
    evidenceAction,
    knowledgeAction,
  });
}

export function buildRunbook(classification: OpsAlertClassification, app: OpsApplication): string[] {
  return renderPromptList('guidance/runbook.md', {
    appId: app.appId,
    dependencies: app.dependencies.length ? app.dependencies.join(', ') : '暂无显式依赖',
    classificationLabel: classification.label,
  });
}

function renderPromptList(fileName: string, variables: Record<string, string>): string[] {
  return renderTemplate(readOpsPrompt(fileName), variables)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.slice(2).trim())
    .filter(Boolean);
}

function readOpsPrompt(fileName: string): string {
  return fs.readFileSync(path.join(process.cwd(), 'prompts', 'ops', fileName), 'utf-8');
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => variables[key] ?? '');
}
