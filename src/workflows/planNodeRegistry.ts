import type { JsonSchema, NodeConfirmationPolicy, NodeReplanPolicy, PlanArtifactContract, PlanResourceRequirements } from './planSchemas.js';
import type { PlannedNodeType } from './sessionPlan.js';

export interface PlanNodeContract {
  nodeType: PlannedNodeType;
  runner: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  artifacts: PlanArtifactContract;
  resources: PlanResourceRequirements;
  confirmation: NodeConfirmationPolicy;
  replan: NodeReplanPolicy;
  allowedDependencies?: PlannedNodeType[];
}

const baseInputSchema: JsonSchema = {
  type: 'object',
  required: ['runId', 'projectName'],
  additionalProperties: true,
  properties: {
    runId: { type: 'string' },
    branchId: { type: 'string' },
    projectName: { type: 'string' },
    trackId: { type: 'string' },
  },
};

const baseOutputSchema: JsonSchema = {
  type: 'object',
  required: ['outputArtifacts'],
  additionalProperties: true,
  properties: {
    outputArtifacts: { type: 'array', items: { type: 'string' } },
    childAgentIds: { type: 'array', items: { type: 'string' } },
  },
};

const noResources: PlanResourceRequirements = {};
const modelResources: PlanResourceRequirements = { modelSlots: 1 };
const commandResources: PlanResourceRequirements = { commandSlots: 1 };
const browserResources: PlanResourceRequirements = { browserSlots: 1, commandSlots: 1 };

const defaultConfirmation: NodeConfirmationPolicy = { required: false };
const defaultReplan: NodeReplanPolicy = {
  replannable: true,
  invalidatesDownstream: true,
  maxAttempts: 3,
};

export const PLAN_NODE_REGISTRY: Readonly<Record<PlannedNodeType, PlanNodeContract>> = {
  'requirement-ownership-confirmation': contract('requirement-ownership-confirmation', 'requirement-ownership-confirmation', {
    requiredArtifacts: ['artifacts/mrd-clarified.md', 'artifacts/project-manifest.json'],
    producedArtifacts: ['artifacts/requirement-ownership.json'],
    resources: modelResources,
    confirmation: { required: true, kind: 'requirement-ownership', riskLevel: 'medium' },
    replan: { replannable: true, invalidatesDownstream: true, maxAttempts: 3 },
  }),
  'implementation-plan': contract('implementation-plan', 'implementation-plan', {
    requiredArtifacts: ['artifacts/mrd-clarified.md', 'artifacts/project-manifest.json', 'artifacts/requirement-ownership.json'],
    producedArtifacts: ['artifacts/{project}/tech-design.md', 'artifacts/implementation-plan-manifest.json'],
    resources: modelResources,
    confirmation: { required: true, kind: 'implementation-plan', riskLevel: 'medium' },
  }),
  'spec-generate': contract('spec-generate', 'spec-generate', {
    requiredArtifacts: ['artifacts/mrd-clarified.md', 'artifacts/{project}/tech-design.md'],
    producedArtifacts: [
      'artifacts/{project}/openspec-task.md',
      'artifacts/{project}/openspec-test-task.md',
      'artifacts/{project}/openspec/changes/*/proposal.md',
      'artifacts/{project}/openspec/changes/*/design.md',
      'artifacts/{project}/openspec/changes/*/tasks.md',
      'artifacts/{project}/openspec/changes/*/specs/*/spec.md',
    ],
    resources: modelResources,
    confirmation: { required: true, kind: 'spec', riskLevel: 'medium' },
  }),
  'backend-impl': codeContract('backend-impl', 'backend-impl'),
  'java-impl': codeContract('java-impl', 'java-impl'),
  'frontend-impl': codeContract('frontend-impl', 'frontend-impl'),
  'backend-test': testContract('backend-test', 'backend-test'),
  'frontend-test': testContract('frontend-test', 'frontend-test'),
  'e2e-verify': contract('e2e-verify', 'e2e-verify', {
    requiredArtifacts: ['artifacts/{project}/e2e/startup-manifest.json'],
    producedArtifacts: ['artifacts/{project}/e2e/e2e-summary.json'],
    resources: browserResources,
  }),
  'documentation-impl': contract('documentation-impl', 'documentation-impl', {
    requiredArtifacts: ['artifacts/{project}/openspec/changes/*/tasks.md'],
    producedArtifacts: ['artifacts/{project}/documentation-implementation.md'],
    resources: modelResources,
  }),
  'documentation-test': contract('documentation-test', 'documentation-test', {
    requiredArtifacts: ['artifacts/{project}/documentation-implementation.md'],
    producedArtifacts: ['artifacts/{project}/documentation-test-report.md'],
    resources: modelResources,
  }),
  'cross-app-test': contract('cross-app-test', 'cross-app-test', {
    requiredArtifacts: ['artifacts/*/branch-summary.json'],
    producedArtifacts: ['artifacts/cross-app/test-results.json'],
    resources: modelResources,
    replan: { replannable: true, invalidatesDownstream: true, maxAttempts: 2 },
  }),
  archive: contract('archive', 'archive', {
    requiredArtifacts: [
      'artifacts/*/branch-summary.json',
      'artifacts/cross-app/delivery-metadata.json',
    ],
    producedArtifacts: ['artifacts/archive-manifest.json'],
    resources: noResources,
    replan: { replannable: false, invalidatesDownstream: false, maxAttempts: 0 },
  }),
};

export function getPlanNodeContract(nodeType: PlannedNodeType): PlanNodeContract | undefined {
  return PLAN_NODE_REGISTRY[nodeType];
}

export function isRegisteredPlanNodeType(value: string): value is PlannedNodeType {
  return Object.prototype.hasOwnProperty.call(PLAN_NODE_REGISTRY, value);
}

export function listPlanNodeContracts(): PlanNodeContract[] {
  return Object.values(PLAN_NODE_REGISTRY);
}

function codeContract(nodeType: PlannedNodeType, runner: string): PlanNodeContract {
  return contract(nodeType, runner, {
    requiredArtifacts: ['artifacts/{project}/openspec/changes/*/tasks.md'],
    producedArtifacts: ['artifacts/{project}/changed-files.json'],
    resources: { modelSlots: 1, commandSlots: 1 },
  });
}

function testContract(nodeType: PlannedNodeType, runner: string): PlanNodeContract {
  return contract(nodeType, runner, {
    requiredArtifacts: ['artifacts/{project}/changed-files.json'],
    producedArtifacts: [`artifacts/{project}/${nodeType === 'frontend-test' ? 'frontend-test-report.md' : 'test-report.md'}`],
    resources: commandResources,
  });
}

function contract(
  nodeType: PlannedNodeType,
  runner: string,
  args: {
    requiredArtifacts: string[];
    producedArtifacts: string[];
    resources: PlanResourceRequirements;
    confirmation?: NodeConfirmationPolicy;
    replan?: NodeReplanPolicy;
  }
): PlanNodeContract {
  return {
    nodeType,
    runner,
    inputSchema: baseInputSchema,
    outputSchema: baseOutputSchema,
    artifacts: {
      requiredArtifacts: args.requiredArtifacts,
      producedArtifacts: args.producedArtifacts,
      artifactHints: args.producedArtifacts,
    },
    resources: args.resources,
    confirmation: args.confirmation ?? defaultConfirmation,
    replan: args.replan ?? defaultReplan,
  };
}
