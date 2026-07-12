import * as fs from 'fs';
import * as path from 'path';
import type { OpsAlertAnalysis } from '../agents/ops/types.js';
import {
  buildAlertVector,
  getOpsAlertHistoryPath,
  readOpsAlertHistory,
} from '../tools/ops/index.js';

export interface OpsAlertHistoryEntry {
  id: string;
  appId: string;
  alert: string;
  category: string;
  categoryLabel: string;
  vector: Record<string, number>;
  createdAt: string;
  workflowId?: string;
  status?: 'completed' | 'failed';
  problemCause?: string;
  repairPlan?: string;
  durationMs?: number;
  modelId?: string;
  tokenUsage?: { inputTokens: number; outputTokens: number };
}

export function listOpsAlertHistory(workspaceRoot = process.cwd(), limit = 50): OpsAlertHistoryEntry[] {
  const ecomRoot = path.join(workspaceRoot, 'demo', 'ecom');
  return readOpsAlertHistory(ecomRoot).slice(0, limit);
}

export function appendOpsAnalysisHistory(ecomRoot: string, workflowId: string, analysis: OpsAlertAnalysis): void {
  appendOpsAlertHistory(ecomRoot, {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    appId: analysis.app.appId,
    alert: analysis.alert,
    category: analysis.category,
    categoryLabel: analysis.categoryLabel,
    vector: buildAlertVector(analysis.alert),
    createdAt: new Date().toISOString(),
    workflowId,
    status: analysis.llmError ? 'failed' : 'completed',
    problemCause: analysis.modelDiagnosis?.rootCause ?? analysis.llmError,
    repairPlan: analysis.modelDiagnosis?.repairPlan.join('\n'),
    durationMs: analysis.modelDiagnosis?.durationMs,
    modelId: analysis.modelDiagnosis?.modelId,
    tokenUsage: analysis.modelDiagnosis?.usage,
  });
}

export function appendOpsAlertHistory(ecomRoot: string, entry: OpsAlertHistoryEntry): void {
  const historyPath = getOpsAlertHistoryPath(ecomRoot);
  const history = readOpsAlertHistory(ecomRoot);
  const alerts = [entry, ...history].slice(0, 200);
  fs.mkdirSync(path.dirname(historyPath), { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify({ alerts }, null, 2));
}
