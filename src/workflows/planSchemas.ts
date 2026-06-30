import type {
  PlannedNodeType,
  PlannedTrackKind,
  SessionExecutionPlan,
} from './sessionPlan.js';

export type JsonSchema = {
  type?: string | string[];
  enum?: readonly unknown[];
  const?: unknown;
  required?: readonly string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  minItems?: number;
  pattern?: string;
  description?: string;
};

export const PLAN_SCHEMA_VERSION = 1;
export const PLAN_SCHEMA_ID = 'ai-coding.session-execution-plan.v1';

export interface PlanArtifactContract {
  requiredArtifacts: string[];
  producedArtifacts: string[];
  artifactHints: string[];
}

export interface PlanResourceRequirements {
  branchSlots?: number;
  modelSlots?: number;
  commandSlots?: number;
  browserSlots?: number;
  toolSlots?: Record<string, number>;
}

export interface NodeConfirmationPolicy {
  required: boolean;
  kind?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface NodeReplanPolicy {
  replannable: boolean;
  invalidatesDownstream: boolean;
  maxAttempts: number;
}

export interface PlanRevision {
  revisionId: string;
  parentRevisionId?: string;
  reason: 'initial' | 'replan' | 'migration';
  createdAt: string;
  changedNodeIds: string[];
  lockedNodeIds: string[];
  validation: SessionExecutionPlan['validation'];
}

export interface ReplanRequest {
  requestId: string;
  runId: string;
  branchId?: string;
  failedNodeIds: string[];
  remainingNodeIds: string[];
  lockedNodeIds: string[];
  invalidatedArtifactPaths: string[];
  reason: 'node-failure' | 'user-feedback' | 'artifact-change' | 'environment-change';
  createdAt: string;
}

export interface PlanMigrationMetadata {
  source: 'structured' | 'legacy-plan' | 'legacy-fixed-pipeline';
  legacyFallbackUsed: boolean;
  warnings: string[];
}

export const plannedTrackKindSchema: JsonSchema = {
  type: 'string',
  enum: ['backend', 'frontend', 'contract', 'e2e', 'documentation'] satisfies PlannedTrackKind[],
};

export const plannedNodeTypeSchema: JsonSchema = {
  type: 'string',
  enum: [
    'requirement-ownership-confirmation',
    'implementation-plan',
    'spec-generate',
    'backend-impl',
    'java-impl',
    'frontend-impl',
    'backend-test',
    'frontend-test',
    'e2e-verify',
    'documentation-impl',
    'documentation-test',
    'cross-app-test',
    'archive',
  ] satisfies PlannedNodeType[],
};

export const plannedNodeSchema: JsonSchema = {
  type: 'object',
  required: ['id', 'type', 'label', 'runner', 'dependsOn', 'requiredArtifacts', 'artifactHints'],
  additionalProperties: true,
  properties: {
    id: { type: 'string' },
    type: plannedNodeTypeSchema,
    label: { type: 'string' },
    runner: { type: 'string' },
    trackId: { type: 'string' },
    dependsOn: { type: 'array', items: { type: 'string' } },
    requiredArtifacts: { type: 'array', items: { type: 'string' } },
    artifactHints: { type: 'array', items: { type: 'string' } },
  },
};

export const appTrackPlanSchema: JsonSchema = {
  type: 'object',
  required: ['trackId', 'kind', 'label', 'required', 'dependsOn', 'nodes'],
  additionalProperties: true,
  properties: {
    trackId: { type: 'string' },
    kind: plannedTrackKindSchema,
    label: { type: 'string' },
    required: { type: 'boolean' },
    dependsOn: { type: 'array', items: { type: 'string' } },
    nodes: { type: 'array', items: plannedNodeSchema },
    fallbackReason: { type: 'string' },
  },
};

export const applicationBranchPlanSchema: JsonSchema = {
  type: 'object',
  required: ['branchId', 'projectName', 'projectRoot', 'capability', 'evidence', 'omittedTracks', 'tracks', 'nodes'],
  additionalProperties: true,
  properties: {
    branchId: { type: 'string' },
    projectName: { type: 'string' },
    projectRoot: { type: 'string' },
    capability: { type: 'object' },
    evidence: { type: 'array', items: { type: 'object' } },
    omittedTracks: { type: 'array', items: { type: 'object' } },
    tracks: { type: 'array', items: appTrackPlanSchema },
    nodes: { type: 'array', items: plannedNodeSchema },
  },
};

export const sessionExecutionPlanSchema: JsonSchema = {
  type: 'object',
  required: [
    'schemaVersion',
    'plannerVersion',
    'runId',
    'generatedAt',
    'sourceArtifacts',
    'branches',
    'validation',
    'currentRevisionId',
    'revisions',
    'migration',
    'nodeContracts',
  ],
  additionalProperties: true,
  properties: {
    schemaVersion: { const: PLAN_SCHEMA_VERSION },
    plannerVersion: { type: 'string' },
    runId: { type: 'string' },
    generatedAt: { type: 'string' },
    sourceArtifacts: { type: 'array', items: { type: 'string' } },
    branches: { type: 'array', items: applicationBranchPlanSchema },
    validation: { type: 'object' },
    currentRevisionId: { type: 'string' },
    revisions: { type: 'array', items: { type: 'object' } },
    migration: { type: 'object' },
    nodeContracts: { type: 'array', items: { type: 'object' } },
  },
};

export const replanRequestSchema: JsonSchema = {
  type: 'object',
  required: ['requestId', 'runId', 'failedNodeIds', 'remainingNodeIds', 'lockedNodeIds', 'invalidatedArtifactPaths', 'reason', 'createdAt'],
  additionalProperties: false,
  properties: {
    requestId: { type: 'string' },
    runId: { type: 'string' },
    branchId: { type: 'string' },
    failedNodeIds: { type: 'array', items: { type: 'string' } },
    remainingNodeIds: { type: 'array', items: { type: 'string' } },
    lockedNodeIds: { type: 'array', items: { type: 'string' } },
    invalidatedArtifactPaths: { type: 'array', items: { type: 'string' } },
    reason: { type: 'string', enum: ['node-failure', 'user-feedback', 'artifact-change', 'environment-change'] },
    createdAt: { type: 'string' },
  },
};
