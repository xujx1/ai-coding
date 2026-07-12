import * as fs from 'fs';
import * as path from 'path';

const SOURCE_EXTENSIONS = new Set([
  '.java', '.xml', '.yml', '.yaml', '.properties', '.sql', '.md', '.json', '.js', '.ts',
]);

export interface OpsClassificationHints {
  codeHints: string[];
}

export interface OpsLogEvidence {
  path: string;
  reason: string;
  snippet?: string;
}

export interface OpsSimilarAlertEvidence {
  path: string;
  reason: string;
  snippet?: string;
  score?: number;
}

export interface OpsCodeEvidence {
  path: string;
  reason: string;
  snippet?: string;
}

export interface OpsKnowledgeEvidence {
  path: string;
  source: 'knowledge-base' | 'gitnexus';
  reason: string;
  snippet?: string;
}

export interface OpsAlertHistoryRecord {
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

export function collectCodeEvidence(root: string, classification: OpsClassificationHints, alert: string): OpsCodeEvidence[] {
  const hintWords = [
    ...classification.codeHints,
    ...extractAlertTokens(alert),
  ].map(item => item.toLowerCase());
  const evidence: OpsCodeEvidence[] = [];
  for (const file of listSourceFiles(root, 500)) {
    if (evidence.length >= 8) break;
    const content = safeRead(file);
    if (!content) continue;
    const lower = content.toLowerCase();
    const matched = hintWords.find(word => word.length >= 2 && lower.includes(word));
    if (!matched) continue;
    evidence.push({
      path: path.relative(root, file),
      reason: `命中 ${matched}`,
      snippet: extractSnippet(content, matched),
    });
  }
  return evidence;
}

export function collectLogEvidence(
  ecomRoot: string,
  appId: string,
  classification: OpsClassificationHints,
  alert: string,
): OpsLogEvidence[] {
  const logsRoot = path.join(ecomRoot, 'logs');
  if (!fs.existsSync(logsRoot)) return [];
  const appLog = path.join(logsRoot, `${appId}.log`);
  const logFiles = [
    ...(fs.existsSync(appLog) ? [appLog] : []),
    ...fs.readdirSync(logsRoot, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.log'))
      .map(entry => path.join(logsRoot, entry.name))
      .filter(file => file !== appLog),
  ];
  const hintWords = Array.from(new Set([
    ...extractTraceIds(alert),
    ...extractAlertTokens(alert).filter(token => /exception|timeout|error|fail|failed|trace|api|refund|return|callback|deduct|sync/i.test(token)),
    'trace',
    'error',
    'exception',
    'timeout',
    appId,
    ...extractAlertTokens(alert),
    ...classification.codeHints,
  ])).map(item => item.toLowerCase());
  const evidence: OpsLogEvidence[] = [];
  for (const file of logFiles) {
    if (evidence.length >= 8) break;
    const content = safeReadLarge(file);
    if (!content) continue;
    const lower = content.toLowerCase();
    const matched = hintWords.find(word => word.length >= 2 && lower.includes(word));
    if (!matched) continue;
    evidence.push({
      path: `logs/${path.relative(logsRoot, file)}`,
      reason: `${path.basename(file) === `${appId}.log` ? '当前应用日志' : '关联应用日志'} grep 命中 ${matched}`,
      snippet: extractSnippet(content, matched),
    });
    if (file === appLog) return evidence;
  }
  return evidence;
}

export function collectSimilarAlertEvidence(
  ecomRoot: string,
  alert: string,
): OpsSimilarAlertEvidence[] {
  const currentVector = buildAlertVector(alert);
  return readOpsAlertHistory(ecomRoot)
    .map(entry => ({ entry, score: cosineSimilarity(currentVector, entry.vector) }))
    .filter(item => item.score >= 0.12)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ entry, score }) => ({
      path: `alert-history/${entry.id}`,
      reason: `告警历史向量相似度 ${(score * 100).toFixed(1)}%`,
      score,
      snippet: [
        `应用：${entry.appId}`,
        `分类：${entry.categoryLabel}`,
        `时间：${entry.createdAt}`,
        `告警：${entry.alert}`,
      ].join('\n'),
    }));
}

export function collectKnowledgeEvidence(
  ecomRoot: string,
  appId: string,
  classification: OpsClassificationHints,
  alert: string,
): OpsKnowledgeEvidence[] {
  const knowledgeRoot = path.join(ecomRoot, 'spaces', 'knowledge', 'knowledge-base');
  if (!fs.existsSync(knowledgeRoot)) return [];
  const appKbRoot = path.join(knowledgeRoot, 'apps', appId, 'app-knowledge-base');
  const searchRoots = [
    { root: path.join(appKbRoot, 'gitnexus'), source: 'gitnexus' as const, limit: 3 },
    { root: path.join(knowledgeRoot, 'global', 'gitnexus-graph'), source: 'gitnexus' as const, limit: 3 },
    { root: appKbRoot, source: 'knowledge-base' as const, limit: 5 },
    { root: path.join(knowledgeRoot, 'global'), source: 'knowledge-base' as const, limit: 3 },
    { root: path.join(knowledgeRoot, 'registry'), source: 'knowledge-base' as const, limit: 3 },
  ].filter(item => fs.existsSync(item.root));
  const hintWords = [
    appId,
    ...classification.codeHints,
    ...extractAlertTokens(alert),
  ].map(item => item.toLowerCase());
  const evidence: OpsKnowledgeEvidence[] = [];
  for (const searchRoot of searchRoots) {
    let addedForRoot = 0;
    for (const file of listSourceFiles(searchRoot.root, 260)) {
      if (evidence.length >= 10) return evidence;
      if (addedForRoot >= searchRoot.limit) break;
      const content = safeRead(file);
      if (!content) continue;
      const lower = content.toLowerCase();
      const matched = hintWords.find(word => word.length >= 2 && lower.includes(word));
      if (!matched) continue;
      const relPath = path.relative(knowledgeRoot, file);
      evidence.push({
        path: `knowledge-base/${relPath}`,
        source: searchRoot.source,
        reason: `${searchRoot.source === 'gitnexus' ? 'GitNexus' : '知识库'} grep 命中 ${matched}`,
        snippet: extractSnippet(content, matched),
      });
      addedForRoot += 1;
    }
  }
  return evidence;
}

export function getOpsAlertHistoryPath(ecomRoot: string): string {
  return path.join(ecomRoot, 'spaces', 'ops', 'alert-history.json');
}

export function readOpsAlertHistory(ecomRoot: string): OpsAlertHistoryRecord[] {
  const history = readJson<{ alerts?: OpsAlertHistoryRecord[] }>(getOpsAlertHistoryPath(ecomRoot));
  return (history?.alerts ?? []).filter(item => item && typeof item.id === 'string')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function buildAlertVector(alert: string): Record<string, number> {
  const vector: Record<string, number> = {};
  for (const token of extractAlertTokens(alert).map(item => item.toLowerCase())) {
    if (token.length < 2) continue;
    vector[token] = (vector[token] ?? 0) + 1;
  }
  return vector;
}

export function extractAlertTokens(alert: string): string[] {
  return Array.from(new Set(alert
    .split(/[^A-Za-z0-9_\u4e00-\u9fa5]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 3)
    .slice(0, 12)));
}

function extractTraceIds(alert: string): string[] {
  const traces = Array.from(alert.matchAll(/traceId\s*=\s*([A-Za-z0-9_.:-]+)/gi))
    .map(match => match[1])
    .filter(Boolean);
  return Array.from(new Set(traces));
}

function extractSnippet(content: string, keyword: string): string {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex(line => line.toLowerCase().includes(keyword.toLowerCase()));
  if (index < 0) return '';
  return lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join('\n').trim();
}

function listSourceFiles(root: string, limit: number): string[] {
  const result: string[] = [];
  const visit = (dir: string): void => {
    if (result.length >= limit) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (result.length >= limit) return;
      if (entry.name.startsWith('.') || entry.name === 'target' || entry.name === 'node_modules') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        result.push(fullPath);
      }
    }
  };
  if (fs.existsSync(root)) visit(root);
  return result;
}

function safeRead(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 300_000) return undefined;
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function safeReadLarge(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 2_000_000) return undefined;
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function cosineSimilarity(a: Record<string, number>, b: Record<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const value of Object.values(a)) normA += value * value;
  for (const value of Object.values(b)) normB += value * value;
  for (const [key, value] of Object.entries(a)) dot += value * (b[key] ?? 0);
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function readJson<T>(file: string): T | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}
