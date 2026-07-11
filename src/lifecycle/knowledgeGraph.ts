import * as fs from 'fs';
import * as path from 'path';
import type { RunPaths } from '../runtime/paths.js';
import { registerArtifact } from './artifacts.js';
import type { ArtifactRef, LifecycleState } from './types.js';
import type { FanoutGraphEdge, FanoutVectorHit } from './fanout.js';
import { analyzeGitNexusRepository, type GitNexusAnalyzeResult } from '../integrations/gitnexus.js';

export interface LocalGraphNode {
  id: string;
  appId: string;
  kind: 'app' | 'file' | 'api' | 'entity' | 'dependency';
  label: string;
  path?: string;
}

export interface LocalGraphEdge {
  from: string;
  to: string;
  kind: 'contains' | 'imports' | 'exposes-api' | 'mentions-entity' | 'depends-on';
  weight: number;
  evidence: string;
}

export interface LocalGitNexusGraph {
  schemaVersion: 1;
  requirementId: string;
  runId: string;
  generatedAt: string;
  indexes: GitNexusAnalyzeResult[];
  nodes: LocalGraphNode[];
  edges: LocalGraphEdge[];
}

export interface VectorIndexChunk {
  chunkId: string;
  appId?: string;
  sourcePath: string;
  text: string;
  tokens: Record<string, number>;
}

export interface LocalVectorIndex {
  schemaVersion: 1;
  requirementId: string;
  runId: string;
  generatedAt: string;
  chunks: VectorIndexChunk[];
}

export function buildLocalGitNexusGraph(args: {
  paths: RunPaths;
  state: LifecycleState;
  gitNexus?: {
    enabled?: boolean;
    binPath?: string;
    homeDir?: string;
    timeoutMs?: number;
  };
}): { graph: LocalGitNexusGraph; graphRef: ArtifactRef; summaryRef: ArtifactRef } {
  const nodes = new Map<string, LocalGraphNode>();
  const edges: LocalGraphEdge[] = [];
  const indexes: GitNexusAnalyzeResult[] = [];
  const gitNexusEnabled = args.gitNexus?.enabled ?? true;
  const gitNexusHome = args.gitNexus?.homeDir ?? path.join(args.paths.artifactsDir, 'knowledge', 'gitnexus-home');
  const gitNexusIndexRoot = path.join(args.paths.artifactsDir, 'knowledge', 'gitnexus-indexes');
  for (const app of args.state.apps) {
    const appNodeId = `app:${app.appId}`;
    nodes.set(appNodeId, { id: appNodeId, appId: app.appId, kind: 'app', label: app.appId });
    const root = app.repoRef && path.isAbsolute(app.repoRef)
      ? app.repoRef
      : path.join(args.paths.projectDir, app.repoRef ?? app.appId);
    if (gitNexusEnabled && fs.existsSync(root)) {
      indexes.push(analyzeGitNexusRepository({
        repoRoot: root,
        repoName: app.appId,
        gitNexusHome,
        indexOutputRoot: gitNexusIndexRoot,
        binPath: args.gitNexus?.binPath,
        timeoutMs: args.gitNexus?.timeoutMs,
      }));
    }
    for (const file of listSourceFiles(root).slice(0, 400)) {
      const relativePath = path.relative(root, file).replace(/\\/g, '/');
      const fileNodeId = `file:${app.appId}:${relativePath}`;
      const content = readText(file);
      nodes.set(fileNodeId, { id: fileNodeId, appId: app.appId, kind: 'file', label: relativePath, path: relativePath });
      edges.push({ from: appNodeId, to: fileNodeId, kind: 'contains', weight: 1, evidence: relativePath });
      for (const api of extractApiRoutes(content)) {
        const apiNodeId = `api:${app.appId}:${api}`;
        nodes.set(apiNodeId, { id: apiNodeId, appId: app.appId, kind: 'api', label: api });
        edges.push({ from: fileNodeId, to: apiNodeId, kind: 'exposes-api', weight: 3, evidence: `${relativePath} exposes ${api}` });
      }
      for (const entity of extractEntityNames(content)) {
        const entityNodeId = `entity:${app.appId}:${entity}`;
        nodes.set(entityNodeId, { id: entityNodeId, appId: app.appId, kind: 'entity', label: entity });
        edges.push({ from: fileNodeId, to: entityNodeId, kind: 'mentions-entity', weight: 2, evidence: `${relativePath} mentions ${entity}` });
      }
      for (const imported of extractImports(content)) {
        const depNodeId = `dependency:${imported}`;
        nodes.set(depNodeId, { id: depNodeId, appId: app.appId, kind: 'dependency', label: imported });
        edges.push({ from: fileNodeId, to: depNodeId, kind: 'imports', weight: 1, evidence: `${relativePath} imports ${imported}` });
      }
    }
  }
  for (const left of args.state.apps) {
    for (const right of args.state.apps) {
      if (left.appId === right.appId) continue;
      const rightTokens = tokenize(right.appId);
      const evidence = edges.find(edge =>
        edge.from.startsWith(`file:${left.appId}:`)
        && [...rightTokens].some(token => tokenize(edge.evidence).has(token))
      );
      if (!evidence) continue;
      edges.push({
        from: `app:${left.appId}`,
        to: `app:${right.appId}`,
        kind: 'depends-on',
        weight: 5,
        evidence: evidence.evidence,
      });
    }
  }
  const graph: LocalGitNexusGraph = {
    schemaVersion: 1,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    generatedAt: new Date().toISOString(),
    indexes,
    nodes: [...nodes.values()],
    edges,
  };
  const graphDir = path.join(args.paths.artifactsDir, 'knowledge', 'gitnexus');
  fs.mkdirSync(graphDir, { recursive: true });
  fs.writeFileSync(path.join(graphDir, 'global-graph.json'), JSON.stringify(graph, null, 2), 'utf-8');
  fs.writeFileSync(path.join(graphDir, 'graph-summary.md'), renderGraphSummary(graph), 'utf-8');
  return {
    graph,
    graphRef: registerArtifact(args.state, {
      type: 'app-knowledge-gitnexus-graph',
      path: 'artifacts/knowledge/gitnexus/global-graph.json',
      sourceType: 'workflow',
      summary: 'GitNexus-backed application graph',
      metadata: {
        indexes: indexes.map(toIndexMetadata),
      },
    }),
    summaryRef: registerArtifact(args.state, {
      type: 'app-knowledge-gitnexus-summary',
      path: 'artifacts/knowledge/gitnexus/graph-summary.md',
      sourceType: 'workflow',
      summary: 'GitNexus-backed graph summary',
      metadata: {
        indexes: indexes.map(toIndexMetadata),
      },
    }),
  };
}

export function buildLocalVectorIndex(args: {
  paths: RunPaths;
  state: LifecycleState;
}): { index: LocalVectorIndex; indexRef: ArtifactRef } {
  const chunks: VectorIndexChunk[] = [];
  for (const artifact of args.state.artifacts) {
    if (!artifact.path || !artifact.path.includes('/knowledge/')) continue;
    const file = path.join(args.paths.runDir, artifact.path);
    const text = readText(file).slice(0, 6000);
    if (!text.trim()) continue;
    chunks.push({
      chunkId: `chunk-${chunks.length + 1}`,
      appId: artifact.appId,
      sourcePath: artifact.path,
      text,
      tokens: tokenVector(text),
    });
  }
  const index: LocalVectorIndex = {
    schemaVersion: 1,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    generatedAt: new Date().toISOString(),
    chunks,
  };
  const indexDir = path.join(args.paths.artifactsDir, 'knowledge', 'vector-index');
  fs.mkdirSync(indexDir, { recursive: true });
  fs.writeFileSync(path.join(indexDir, 'index.json'), JSON.stringify(index, null, 2), 'utf-8');
  return {
    index,
    indexRef: registerArtifact(args.state, {
      type: 'knowledge-vector-index',
      path: 'artifacts/knowledge/vector-index/index.json',
      sourceType: 'workflow',
      summary: 'Lightweight local vector index over application knowledge artifacts',
    }),
  };
}

export function queryLocalVectorIndex(index: LocalVectorIndex, query: string, limit = 8): FanoutVectorHit[] {
  const queryVector = tokenVector(query);
  return index.chunks
    .map(chunk => ({
      appId: chunk.appId,
      score: cosine(queryVector, chunk.tokens),
      evidence: chunk.sourcePath,
    }))
    .filter((hit): hit is FanoutVectorHit => Boolean(hit.appId) && hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function graphEdgesForFanout(graph: LocalGitNexusGraph): FanoutGraphEdge[] {
  return graph.edges
    .filter(edge => edge.kind === 'depends-on' && edge.from.startsWith('app:') && edge.to.startsWith('app:'))
    .map(edge => ({
      fromAppId: edge.from.slice('app:'.length),
      toAppId: edge.to.slice('app:'.length),
      weight: edge.weight,
      reason: edge.evidence,
    }));
}

export function loadLocalVectorIndex(paths: RunPaths): LocalVectorIndex | undefined {
  return readJson<LocalVectorIndex>(path.join(paths.artifactsDir, 'knowledge', 'vector-index', 'index.json'));
}

export function loadLocalGitNexusGraph(paths: RunPaths): LocalGitNexusGraph | undefined {
  return readJson<LocalGitNexusGraph>(path.join(paths.artifactsDir, 'knowledge', 'gitnexus', 'global-graph.json'));
}

function listSourceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const result: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['node_modules', 'target', 'dist', 'build'].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (/\.(ts|tsx|js|jsx|java|kt|go|py|md|yaml|yml|json)$/.test(entry.name)) {
        result.push(fullPath);
      }
      if (result.length >= 500) return;
    }
  };
  visit(root);
  return result;
}

function extractApiRoutes(content: string): string[] {
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
  return [...routes].slice(0, 40);
}

function extractEntityNames(content: string): string[] {
  const entities = new Set<string>();
  const patterns = [
    /\b(class|interface|type|enum)\s+([A-Z][A-Za-z0-9_]*)/g,
    /@Entity\b[\s\S]{0,200}?\bclass\s+([A-Z][A-Za-z0-9_]*)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      entities.add(match[2] ?? match[1]);
    }
  }
  return [...entities].slice(0, 80);
}

function extractImports(content: string): string[] {
  const imports = new Set<string>();
  const patterns = [
    /^\s*import\s+.*?\s+from\s+['"`]([^'"`]+)['"`]/gm,
    /^\s*import\s+['"`]([^'"`]+)['"`]/gm,
    /^\s*import\s+([a-zA-Z0-9_.]+);/gm,
    /require\(['"`]([^'"`]+)['"`]\)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content))) {
      imports.add(match[1]);
    }
  }
  return [...imports].slice(0, 80);
}

function renderGraphSummary(graph: LocalGitNexusGraph): string {
  const byKind = graph.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.kind] = (acc[node.kind] ?? 0) + 1;
    return acc;
  }, {});
  return [
    '# Local GitNexus Graph Summary',
    '',
    `Nodes: ${graph.nodes.length}`,
    `Edges: ${graph.edges.length}`,
    `GitNexus indexes: ${graph.indexes.length}`,
    '',
    '## GitNexus Indexes',
    ...(graph.indexes.length
      ? graph.indexes.map(index => `- ${index.repoName}: ${index.status}${index.stats ? ` (${index.stats.nodes ?? 0} nodes, ${index.stats.edges ?? 0} edges, ${index.stats.processes ?? 0} flows)` : ''}`)
      : ['- none']),
    '',
    '## Node Kinds',
    ...Object.entries(byKind).map(([kind, count]) => `- ${kind}: ${count}`),
    '',
    '## App Dependencies',
    ...graph.edges
      .filter(edge => edge.kind === 'depends-on')
      .map(edge => `- ${edge.from} -> ${edge.to}: ${edge.evidence}`),
    '',
  ].join('\n');
}

function toIndexMetadata(index: GitNexusAnalyzeResult): Record<string, unknown> {
  return {
    repoName: index.repoName,
    repoRoot: index.repoRoot,
    indexPath: index.indexPath,
    registryPath: index.registryPath,
    status: index.status,
    stats: index.stats,
    indexedAt: index.indexedAt,
    error: index.error,
  };
}

function readText(file: string): string {
  try {
    if (!fs.existsSync(file)) return '';
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return '';
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

function tokenVector(text: string): Record<string, number> {
  const vector: Record<string, number> = {};
  for (const token of tokenize(text)) {
    vector[token] = (vector[token] ?? 0) + 1;
  }
  return vector;
}

function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9\u4e00-\u9fa5]+/).filter(token => token.length >= 2));
}

function cosine(left: Record<string, number>, right: Record<string, number>): number {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const value of Object.values(left)) leftNorm += value * value;
  for (const value of Object.values(right)) rightNorm += value * value;
  for (const [token, value] of Object.entries(left)) {
    dot += value * (right[token] ?? 0);
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}
