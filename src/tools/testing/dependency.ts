export interface TestingDependencyNode {
  id: string;
  appId?: string;
  type: 'app' | 'api' | 'db' | 'mq' | 'external' | 'unknown';
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface TestingDependencyEdge {
  edgeId: string;
  source: string;
  target: string;
  type: 'api' | 'db' | 'publish' | 'consume' | 'external';
  metadata?: Record<string, unknown>;
  evidence?: string[];
}

export interface TestingDependencyGraph {
  nodes: TestingDependencyNode[];
  edges: TestingDependencyEdge[];
}

export interface TestingDependencySlice {
  rootIds: string[];
  nodes: TestingDependencyNode[];
  edges: TestingDependencyEdge[];
}

export function sliceDependencyGraph(
  graph: TestingDependencyGraph,
  rootIds: string[],
  depth = 1,
): TestingDependencySlice {
  const visited = new Set(rootIds);
  let frontier = new Set(rootIds);
  for (let level = 0; level < depth; level += 1) {
    const next = new Set<string>();
    for (const edge of graph.edges) {
      if (frontier.has(edge.source)) next.add(edge.target);
      if (frontier.has(edge.target)) next.add(edge.source);
    }
    for (const nodeId of next) visited.add(nodeId);
    frontier = next;
  }
  return {
    rootIds,
    nodes: graph.nodes.filter(node => visited.has(node.id)),
    edges: graph.edges.filter(edge => visited.has(edge.source) && visited.has(edge.target)),
  };
}

export function graphEdgesForApps(graph: TestingDependencyGraph, appIds: string[]): TestingDependencyEdge[] {
  const nodeIds = new Set(graph.nodes.filter(node => node.appId && appIds.includes(node.appId)).map(node => node.id));
  return graph.edges.filter(edge => nodeIds.has(edge.source) || nodeIds.has(edge.target));
}
