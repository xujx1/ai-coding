import * as fs from 'fs';
import * as path from 'path';
import type { RunPaths } from '../runtime/paths.js';
import type { ArtifactRef, LifecycleState } from './types.js';
import { registerArtifact } from './artifacts.js';

export interface ApplicationKnowledgeSeed {
  appId: string;
  name: string;
  root?: string;
  summary?: string;
  apiRoutes?: string[];
  dbTables?: string[];
  architectureNotes?: string[];
  gitNexusNodes?: Array<{ id: string; kind: string; label: string }>;
  gitNexusEdges?: Array<{ from: string; to: string; kind: string }>;
}

export interface AppKnowledgeInitResult {
  appId: string;
  artifactRefs: ArtifactRef[];
  files: {
    summary: string;
    apiIndex: string;
    dbSchema: string;
    architecture: string;
    gitNexusGraph: string;
  };
}

export interface KnowledgeFreshness {
  appId: string;
  status: 'fresh' | 'stale' | 'missing';
  lastUpdatedAt?: number;
  staleAfterMs: number;
  message: string;
  lazyRefreshRecommended: boolean;
}

export interface KnowledgeDelta {
  schemaVersion: 1;
  requirementId: string;
  runId: string;
  appId: string;
  changeTypes: Array<'api' | 'db' | 'mq' | 'dependency' | 'core-flow' | 'test' | 'ops'>;
  evidenceArtifactIds: string[];
  risk: 'low' | 'medium' | 'high';
  rollbackRef?: string;
  patchArtifactId?: string;
  summary: string;
  createdAt: number;
}

export function initializeApplicationKnowledgeArtifacts(args: {
  paths: RunPaths;
  state: LifecycleState;
  apps: ApplicationKnowledgeSeed[];
}): AppKnowledgeInitResult[] {
  return args.apps.map(app => {
    const baseDir = path.join(args.paths.artifactsDir, 'knowledge', 'apps', app.appId);
    fs.mkdirSync(baseDir, { recursive: true });
    const files = {
      summary: path.join(baseDir, 'summary.md'),
      apiIndex: path.join(baseDir, 'api-index.md'),
      dbSchema: path.join(baseDir, 'db-schema.md'),
      architecture: path.join(baseDir, 'architecture.md'),
      gitNexusGraph: path.join(baseDir, 'gitnexus-graph.json'),
    };
    fs.writeFileSync(files.summary, renderSummary(app), 'utf-8');
    fs.writeFileSync(files.apiIndex, renderList('API Index', app.apiRoutes ?? []), 'utf-8');
    fs.writeFileSync(files.dbSchema, renderList('DB Schema', app.dbTables ?? []), 'utf-8');
    fs.writeFileSync(files.architecture, renderList('Architecture Notes', app.architectureNotes ?? []), 'utf-8');
    fs.writeFileSync(files.gitNexusGraph, JSON.stringify({
      appId: app.appId,
      nodes: app.gitNexusNodes ?? [],
      edges: app.gitNexusEdges ?? [],
    }, null, 2), 'utf-8');
    const relativeBase = `artifacts/knowledge/apps/${app.appId}`;
    const artifactRefs = [
      registerArtifact(args.state, {
        type: 'app-knowledge-summary',
        path: `${relativeBase}/summary.md`,
        appId: app.appId,
        sourceType: 'workflow',
      }),
      registerArtifact(args.state, {
        type: 'app-knowledge-api-index',
        path: `${relativeBase}/api-index.md`,
        appId: app.appId,
        sourceType: 'workflow',
      }),
      registerArtifact(args.state, {
        type: 'app-knowledge-db-schema',
        path: `${relativeBase}/db-schema.md`,
        appId: app.appId,
        sourceType: 'workflow',
      }),
      registerArtifact(args.state, {
        type: 'app-knowledge-architecture',
        path: `${relativeBase}/architecture.md`,
        appId: app.appId,
        sourceType: 'workflow',
      }),
      registerArtifact(args.state, {
        type: 'app-knowledge-gitnexus-graph',
        path: `${relativeBase}/gitnexus-graph.json`,
        appId: app.appId,
        sourceType: 'workflow',
      }),
    ];
    return {
      appId: app.appId,
      artifactRefs,
      files: {
        summary: `${relativeBase}/summary.md`,
        apiIndex: `${relativeBase}/api-index.md`,
        dbSchema: `${relativeBase}/db-schema.md`,
        architecture: `${relativeBase}/architecture.md`,
        gitNexusGraph: `${relativeBase}/gitnexus-graph.json`,
      },
    };
  });
}

export function evaluateKnowledgeFreshness(args: {
  appId: string;
  lastUpdatedAt?: number;
  now?: number;
  staleAfterMs?: number;
}): KnowledgeFreshness {
  const staleAfterMs = args.staleAfterMs ?? 7 * 24 * 60 * 60 * 1000;
  const now = args.now ?? Date.now();
  if (!args.lastUpdatedAt) {
    return {
      appId: args.appId,
      status: 'missing',
      staleAfterMs,
      message: `Knowledge for ${args.appId} is missing; lazy refresh is required before high-confidence planning.`,
      lazyRefreshRecommended: true,
    };
  }
  const age = now - args.lastUpdatedAt;
  const stale = age > staleAfterMs;
  return {
    appId: args.appId,
    status: stale ? 'stale' : 'fresh',
    lastUpdatedAt: args.lastUpdatedAt,
    staleAfterMs,
    message: stale
      ? `Knowledge for ${args.appId} is stale; warn and allow user-directed lazy refresh.`
      : `Knowledge for ${args.appId} is fresh.`,
    lazyRefreshRecommended: stale,
  };
}

export function createKnowledgeDelta(args: {
  state: LifecycleState;
  appId: string;
  changeTypes: KnowledgeDelta['changeTypes'];
  evidenceArtifactIds: string[];
  summary: string;
  rollbackRef?: string;
  patchArtifactId?: string;
  now?: number;
}): KnowledgeDelta {
  return {
    schemaVersion: 1,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    appId: args.appId,
    changeTypes: args.changeTypes,
    evidenceArtifactIds: args.evidenceArtifactIds,
    risk: riskForDelta(args.changeTypes),
    rollbackRef: args.rollbackRef,
    patchArtifactId: args.patchArtifactId,
    summary: args.summary,
    createdAt: args.now ?? Date.now(),
  };
}

export function writeKnowledgeDeltaArtifact(args: {
  paths: RunPaths;
  state: LifecycleState;
  delta: KnowledgeDelta;
}): ArtifactRef {
  const relativePath = `artifacts/knowledge-delta/${args.delta.appId}-knowledge-delta.json`;
  const file = path.join(args.paths.runDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(args.delta, null, 2), 'utf-8');
  return registerArtifact(args.state, {
    type: 'knowledge-delta',
    path: relativePath,
    appId: args.delta.appId,
    sourceType: 'workflow',
    summary: args.delta.summary,
    metadata: { risk: args.delta.risk },
  });
}

function riskForDelta(changeTypes: KnowledgeDelta['changeTypes']): KnowledgeDelta['risk'] {
  if (changeTypes.some(type => ['api', 'db', 'mq', 'dependency', 'core-flow'].includes(type))) return 'high';
  if (changeTypes.includes('ops')) return 'medium';
  return 'low';
}

function renderSummary(app: ApplicationKnowledgeSeed): string {
  return [
    `# ${app.name}`,
    '',
    app.summary ?? 'Application knowledge summary is pending enrichment.',
    '',
    `Root: ${app.root ?? 'unknown'}`,
  ].join('\n');
}

function renderList(title: string, values: string[]): string {
  return [`# ${title}`, '', ...(values.length ? values : ['TBD']).map(value => `- ${value}`), ''].join('\n');
}

