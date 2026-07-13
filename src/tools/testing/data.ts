import type { DataPlan } from '../../lifecycle/testingArtifactSchemas.js';

export interface TestingDataDependencyEdge {
  edgeId: string;
  type: 'publish' | 'consume' | 'api' | 'db';
  source: string;
  target: string;
  metadata?: Record<string, unknown>;
  evidence?: string[];
}

export function fakerValue(kind: 'email' | 'uuid' | 'phone' | 'timestamp'): string {
  if (kind === 'email') return `test-${Math.random().toString(36).slice(2, 8)}@example.com`;
  if (kind === 'uuid') return `id-${Math.random().toString(36).slice(2, 10)}`;
  if (kind === 'phone') return `138${Math.floor(Math.random() * 1e8).toString().padStart(8, '0')}`;
  return new Date().toISOString();
}

export function buildDataPlanFromEdges(args: {
  requirementId: string;
  runId: string;
  workflowInstanceId: string;
  sourceNodeId?: string;
  dataPlanId: string;
  isolationKey: string;
  edges: TestingDataDependencyEdge[];
  generatedAt?: number;
}): DataPlan {
  return {
    schemaVersion: 1,
    artifactKind: 'testing-data-plan',
    requirementId: args.requirementId,
    runId: args.runId,
    workflowInstanceId: args.workflowInstanceId,
    sourceNodeId: args.sourceNodeId ?? 'generate_data_plans',
    status: 'draft',
    generatedAt: args.generatedAt ?? Date.now(),
    upstreamArtifactIds: [],
    dataPlanId: args.dataPlanId,
    isolationKey: args.isolationKey,
    cleanupRequired: true,
    rollbackRefs: [],
    steps: args.edges.map((edge, index) => ({
      id: `data-step-${index + 1}-${safeSegment(edge.edgeId)}`,
      action: edge.type === 'publish' || edge.type === 'consume' ? 'message' : edge.type,
      description: describeEdge(edge),
      inputRef: edge.source,
      outputRef: edge.target,
      rollbackRef: `rollback:${edge.edgeId}`,
      validation: `Validate ${edge.target} observes data from ${edge.source}.`,
      cleanup: `Cleanup data isolated by ${args.isolationKey}.`,
    })),
  };
}

export function buildMqDataStep(edge: TestingDataDependencyEdge, order: number): DataPlan['steps'][number] {
  const topic = typeof edge.metadata?.topic === 'string' ? edge.metadata.topic : inferTopic(edge);
  return {
    id: `mq-step-${order}-${safeSegment(edge.edgeId)}`,
    action: 'message',
    description: edge.type === 'consume'
      ? `Consume message from topic ${topic}`
      : `Publish message to topic ${topic}`,
    inputRef: edge.source,
    outputRef: edge.target,
    rollbackRef: `rollback:${edge.edgeId}`,
    validation: `Validate topic ${topic} propagation.`,
    cleanup: `Expire or delete message fixtures for ${topic}.`,
  };
}

function describeEdge(edge: TestingDataDependencyEdge): string {
  if (edge.type === 'publish' || edge.type === 'consume') return buildMqDataStep(edge, 1).description;
  return `Prepare ${edge.type} data from ${edge.source} to ${edge.target}`;
}

function inferTopic(edge: TestingDataDependencyEdge): string {
  for (const item of edge.evidence ?? []) {
    const match = item.match(/topic[:\s=]+["']?([A-Z0-9_.-]+)/i);
    if (match) return match[1];
  }
  return `topic-${safeSegment(edge.target)}`;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
