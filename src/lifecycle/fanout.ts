import * as fs from 'fs';
import * as path from 'path';
import type { RunPaths } from '../runtime/paths.js';
import type { ArtifactRef, LifecycleState } from './types.js';
import { registerArtifact } from './artifacts.js';

export type FanoutSource = 'global-knowledge' | 'vector' | 'structured-index' | 'gitnexus-graph' | 'user';
export type FanoutRole = 'primary' | 'secondary' | 'test-only' | 'excluded';

export interface FanoutApplicationKnowledge {
  appId: string;
  name: string;
  root?: string;
  keywords?: string[];
  capabilities?: string[];
  apiRoutes?: string[];
  entities?: string[];
  dependencies?: string[];
}

export interface FanoutVectorHit {
  appId: string;
  score: number;
  evidence: string;
}

export interface FanoutStructuredHit {
  appId: string;
  weight: number;
  reason: string;
}

export interface FanoutGraphEdge {
  fromAppId: string;
  toAppId: string;
  weight: number;
  reason: string;
}

export interface FanoutRecallCandidate {
  appId: string;
  name: string;
  score: number;
  suggestedRole: Exclude<FanoutRole, 'excluded'>;
  sources: FanoutSource[];
  evidence: string[];
  root?: string;
}

export interface FanoutRecallResult {
  schemaVersion: 1;
  requirementId: string;
  runId: string;
  generatedAt: string;
  query: string;
  candidates: FanoutRecallCandidate[];
}

export interface FanoutDecisionResult {
  schemaVersion: 1;
  requirementId: string;
  runId: string;
  primaryApps: string[];
  secondaryApps: string[];
  testOnlyApps: string[];
  excludedApps: Array<{ appId: string; reason: string }>;
  evidence: string[];
  generatedAt: string;
}

export interface FanoutAdjustment {
  appId: string;
  role: FanoutRole;
  reason: string;
}

export interface FanoutRecallInput {
  requirementId: string;
  runId: string;
  query: string;
  applications: FanoutApplicationKnowledge[];
  vectorHits?: FanoutVectorHit[];
  structuredHits?: FanoutStructuredHit[];
  graphEdges?: FanoutGraphEdge[];
  generatedAt?: string;
}

export function recallFanoutCandidates(input: FanoutRecallInput): FanoutRecallResult {
  const candidates = new Map<string, FanoutRecallCandidate>();
  const appById = new Map(input.applications.map(app => [app.appId, app]));
  const queryTokens = tokenize(input.query);

  for (const app of input.applications) {
    const matched = matchApplicationKnowledge(app, queryTokens);
    if (!matched.score) continue;
    mergeCandidate(candidates, app, matched.score, 'global-knowledge', matched.evidence);
  }

  for (const hit of input.vectorHits ?? []) {
    const app = appById.get(hit.appId);
    if (!app) continue;
    mergeCandidate(candidates, app, clamp(hit.score, 0, 1) * 40, 'vector', [hit.evidence]);
  }

  for (const hit of input.structuredHits ?? []) {
    const app = appById.get(hit.appId);
    if (!app) continue;
    mergeCandidate(candidates, app, Math.max(0, hit.weight) * 15, 'structured-index', [hit.reason]);
  }

  const seedAppIds = new Set(candidates.keys());
  for (const edge of input.graphEdges ?? []) {
    const fromSeed = seedAppIds.has(edge.fromAppId);
    const toSeed = seedAppIds.has(edge.toAppId);
    const targetId = fromSeed ? edge.toAppId : toSeed ? edge.fromAppId : undefined;
    if (!targetId || seedAppIds.has(targetId)) continue;
    const app = appById.get(targetId);
    if (!app) continue;
    mergeCandidate(candidates, app, Math.max(0, edge.weight) * 10, 'gitnexus-graph', [edge.reason]);
  }

  return {
    schemaVersion: 1,
    requirementId: input.requirementId,
    runId: input.runId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    query: input.query,
    candidates: [...candidates.values()]
      .map(candidate => ({
        ...candidate,
        score: Math.round(candidate.score * 100) / 100,
        suggestedRole: roleForScore(candidate.score),
      }))
      .sort((a, b) => b.score - a.score || a.appId.localeCompare(b.appId)),
  };
}

export function applyFanoutAdjustments(
  recall: FanoutRecallResult,
  adjustments: FanoutAdjustment[] = [],
): FanoutDecisionResult {
  const adjustmentByApp = new Map(adjustments.map(item => [item.appId, item]));
  const primaryApps: string[] = [];
  const secondaryApps: string[] = [];
  const testOnlyApps: string[] = [];
  const excludedApps: Array<{ appId: string; reason: string }> = [];
  const evidence: string[] = [];

  for (const candidate of recall.candidates) {
    const adjusted = adjustmentByApp.get(candidate.appId);
    const role = adjusted?.role ?? candidate.suggestedRole;
    evidence.push(...candidate.evidence.map(item => `${candidate.appId}: ${item}`));
    if (adjusted) evidence.push(`${candidate.appId}: user adjustment -> ${adjusted.role}: ${adjusted.reason}`);
    switch (role) {
      case 'primary':
        primaryApps.push(candidate.appId);
        break;
      case 'secondary':
        secondaryApps.push(candidate.appId);
        break;
      case 'test-only':
        testOnlyApps.push(candidate.appId);
        break;
      case 'excluded':
        excludedApps.push({ appId: candidate.appId, reason: adjusted?.reason ?? 'Excluded by user adjustment.' });
        break;
    }
  }

  return {
    schemaVersion: 1,
    requirementId: recall.requirementId,
    runId: recall.runId,
    primaryApps,
    secondaryApps,
    testOnlyApps,
    excludedApps,
    evidence,
    generatedAt: recall.generatedAt,
  };
}

export function writeFanoutLifecycleArtifacts(args: {
  paths: RunPaths;
  state: LifecycleState;
  recall: FanoutRecallResult;
  decision: FanoutDecisionResult;
  evidenceMarkdown?: string;
}): { recallRef: ArtifactRef; decisionRef: ArtifactRef; evidenceRef: ArtifactRef } {
  const fanoutDir = path.join(args.paths.artifactsDir, 'fanout');
  fs.mkdirSync(fanoutDir, { recursive: true });
  const recallPath = path.join(fanoutDir, 'fanout-recall.json');
  const decisionPath = path.join(fanoutDir, 'fanout-decision.json');
  const evidencePath = path.join(fanoutDir, 'fanout-evidence.md');
  fs.writeFileSync(recallPath, JSON.stringify(args.recall, null, 2), 'utf-8');
  fs.writeFileSync(decisionPath, JSON.stringify(args.decision, null, 2), 'utf-8');
  fs.writeFileSync(evidencePath, args.evidenceMarkdown ?? renderFanoutEvidence(args.decision), 'utf-8');
  return {
    recallRef: registerArtifact(args.state, {
      type: 'fanout-recall',
      path: 'artifacts/fanout/fanout-recall.json',
      sourceType: 'workflow',
      summary: 'Multi-source fanout candidate recall result',
    }),
    decisionRef: registerArtifact(args.state, {
      type: 'fanout-decision',
      path: 'artifacts/fanout/fanout-decision.json',
      sourceType: 'workflow',
      summary: 'Confirmed or adjusted fanout decision',
    }),
    evidenceRef: registerArtifact(args.state, {
      type: 'fanout-evidence',
      path: 'artifacts/fanout/fanout-evidence.md',
      sourceType: 'workflow',
      summary: 'Human-readable fanout evidence',
    }),
  };
}

function matchApplicationKnowledge(app: FanoutApplicationKnowledge, queryTokens: Set<string>): { score: number; evidence: string[] } {
  const fields: Array<[string, string[] | undefined, number]> = [
    ['name', [app.name, app.appId], 12],
    ['keyword', app.keywords, 8],
    ['capability', app.capabilities, 10],
    ['api', app.apiRoutes, 7],
    ['entity', app.entities, 7],
  ];
  let score = 0;
  const evidence: string[] = [];
  for (const [label, values, weight] of fields) {
    for (const value of values ?? []) {
      const matched = tokenize(value);
      const hit = [...matched].some(token => queryTokens.has(token));
      if (!hit) continue;
      score += weight;
      evidence.push(`${label} matched "${value}"`);
    }
  }
  return { score, evidence };
}

function mergeCandidate(
  candidates: Map<string, FanoutRecallCandidate>,
  app: FanoutApplicationKnowledge,
  score: number,
  source: FanoutSource,
  evidence: string[],
): void {
  const existing = candidates.get(app.appId);
  if (existing) {
    existing.score += score;
    existing.sources = uniqueSources([...existing.sources, source]);
    existing.evidence = unique([...existing.evidence, ...evidence]);
    return;
  }
  candidates.set(app.appId, {
    appId: app.appId,
    name: app.name,
    root: app.root,
    score,
    suggestedRole: roleForScore(score),
    sources: [source],
    evidence,
  });
}

function roleForScore(score: number): Exclude<FanoutRole, 'excluded'> {
  if (score >= 45) return 'primary';
  if (score >= 20) return 'secondary';
  return 'test-only';
}

function renderFanoutEvidence(decision: FanoutDecisionResult): string {
  return [
    '# Fanout Evidence',
    '',
    `Requirement: ${decision.requirementId}`,
    '',
    '## Primary Apps',
    ...decision.primaryApps.map(app => `- ${app}`),
    '',
    '## Secondary Apps',
    ...decision.secondaryApps.map(app => `- ${app}`),
    '',
    '## Test-only Apps',
    ...decision.testOnlyApps.map(app => `- ${app}`),
    '',
    '## Excluded Apps',
    ...decision.excludedApps.map(app => `- ${app.appId}: ${app.reason}`),
    '',
    '## Evidence',
    ...decision.evidence.map(item => `- ${item}`),
  ].join('\n');
}

function tokenize(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter(token => token.length > 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function uniqueSources(values: FanoutSource[]): FanoutSource[] {
  return [...new Set(values)];
}
