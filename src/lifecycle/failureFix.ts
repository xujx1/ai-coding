import type {
  ArtifactRef,
  DiagnosisRef,
  FixCycleRef,
  LifecycleState,
  RequirementDeploymentSetRef,
  TestRunRef,
} from './types.js';

export type FailureCategory =
  | 'CODE_BUG'
  | 'TEST_SCRIPT'
  | 'TEST_DATA'
  | 'ENVIRONMENT'
  | 'CONFIGURATION'
  | 'CI_INFRA'
  | 'UNKNOWN';

export interface FailureClassification {
  failureClassificationId: string;
  requirementId: string;
  runId: string;
  category: FailureCategory;
  confidence: number;
  rootCauseCandidates: string[];
  recommendedNextAction: 'fix-code' | 'fix-test' | 'fix-data' | 'fix-config' | 'rerun' | 'wait-environment' | 'manual-approval';
  evidenceArtifactIds: string[];
}

export interface AutoFixPolicy {
  minimumCodeBugConfidence: number;
  allowedCategories: FailureCategory[];
}

export interface RerunFacts {
  previousDeploymentSetId?: string;
  previousTestRunId?: string;
  nextDeploymentSet: RequirementDeploymentSetRef;
  nextTestRun: TestRunRef;
}

export function collectFailureEvidence(args: {
  state: LifecycleState;
  testRunId?: string;
  pipelineRunId?: string;
}): ArtifactRef[] {
  const testRun = args.testRunId
    ? args.state.testRuns.find(item => item.testRunId === args.testRunId)
    : undefined;
  const artifactIds = new Set([
    ...(testRun?.artifactIds ?? []),
    ...(testRun?.evidenceArtifactIds ?? []),
    ...args.state.artifacts
      .filter(ref => args.pipelineRunId && ref.sourceId === args.pipelineRunId)
      .map(ref => ref.artifactId),
  ]);
  return args.state.artifacts.filter(ref => artifactIds.has(ref.artifactId));
}

export function createFailureClassification(args: {
  state: LifecycleState;
  category: FailureCategory;
  confidence: number;
  rootCauseCandidates: string[];
  evidenceArtifactIds: string[];
}): FailureClassification {
  return {
    failureClassificationId: `failure-${args.state.runId}-${args.state.diagnoses.length + 1}`,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    category: args.category,
    confidence: args.confidence,
    rootCauseCandidates: args.rootCauseCandidates,
    recommendedNextAction: recommendedAction(args.category, args.confidence),
    evidenceArtifactIds: args.evidenceArtifactIds,
  };
}

export function recordDiagnosis(args: {
  state: LifecycleState;
  classification: FailureClassification;
  testRunId?: string;
  pipelineRunId?: string;
  artifactIds?: string[];
}): DiagnosisRef {
  const diagnosis: DiagnosisRef = {
    diagnosisId: args.classification.failureClassificationId,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    testRunId: args.testRunId,
    pipelineRunId: args.pipelineRunId,
    category: args.classification.category,
    confidence: args.classification.confidence,
    artifactIds: args.artifactIds ?? [],
    evidenceArtifactIds: args.classification.evidenceArtifactIds,
  };
  args.state.diagnoses = [
    ...args.state.diagnoses.filter(item => item.diagnosisId !== diagnosis.diagnosisId),
    diagnosis,
  ];
  return diagnosis;
}

export function canAutoRepairCode(classification: FailureClassification, policy: AutoFixPolicy): boolean {
  return classification.category === 'CODE_BUG'
    && policy.allowedCategories.includes('CODE_BUG')
    && classification.confidence >= policy.minimumCodeBugConfidence
    && classification.recommendedNextAction === 'fix-code';
}

export function createFixCycle(args: {
  state: LifecycleState;
  failureClassificationId: string;
  failedDeploymentSetId?: string;
  failedTestRunId?: string;
  owner: FixCycleRef['owner'];
  fixType: string;
  artifactIds?: string[];
}): FixCycleRef {
  const fixCycle: FixCycleRef = {
    fixCycleId: `fix-cycle-${args.state.runId}-${args.state.fixCycles.length + 1}`,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    failedDeploymentSetId: args.failedDeploymentSetId,
    failedTestRunId: args.failedTestRunId,
    failureClassificationId: args.failureClassificationId,
    status: 'planned',
    owner: args.owner,
    fixType: args.fixType,
    artifactIds: args.artifactIds ?? [],
  };
  args.state.fixCycles = [...args.state.fixCycles, fixCycle];
  return fixCycle;
}

export function completeFixCycle(args: {
  state: LifecycleState;
  fixCycleId: string;
  status: Extract<FixCycleRef['status'], 'succeeded' | 'failed' | 'cancelled'>;
  artifactIds?: string[];
  nextDeploymentSetId?: string;
  nextTestRunId?: string;
}): FixCycleRef {
  let updated: FixCycleRef | undefined;
  args.state.fixCycles = args.state.fixCycles.map(cycle => {
    if (cycle.fixCycleId !== args.fixCycleId) return cycle;
    updated = {
      ...cycle,
      status: args.status,
      artifactIds: [...cycle.artifactIds, ...(args.artifactIds ?? [])],
      nextDeploymentSetId: args.nextDeploymentSetId,
      nextTestRunId: args.nextTestRunId,
    };
    return updated;
  });
  if (!updated) throw new Error(`Fix cycle not found: ${args.fixCycleId}`);
  return updated;
}

export function appendRerunFacts(args: {
  state: LifecycleState;
  previousDeploymentSetId?: string;
  previousTestRunId?: string;
  nextDeploymentSet: RequirementDeploymentSetRef;
  nextTestRun: TestRunRef;
}): RerunFacts {
  args.state.deploymentSets = [
    ...args.state.deploymentSets.filter(item => item.deploymentSetId !== args.nextDeploymentSet.deploymentSetId),
    args.nextDeploymentSet,
  ];
  args.state.testRuns = [
    ...args.state.testRuns.filter(item => item.testRunId !== args.nextTestRun.testRunId),
    args.nextTestRun,
  ];
  return {
    previousDeploymentSetId: args.previousDeploymentSetId,
    previousTestRunId: args.previousTestRunId,
    nextDeploymentSet: args.nextDeploymentSet,
    nextTestRun: args.nextTestRun,
  };
}

function recommendedAction(category: FailureCategory, confidence: number): FailureClassification['recommendedNextAction'] {
  if (confidence < 0.5 || category === 'UNKNOWN') return 'manual-approval';
  switch (category) {
    case 'CODE_BUG':
      return 'fix-code';
    case 'TEST_SCRIPT':
      return 'fix-test';
    case 'TEST_DATA':
      return 'fix-data';
    case 'CONFIGURATION':
      return 'fix-config';
    case 'ENVIRONMENT':
      return 'wait-environment';
    case 'CI_INFRA':
      return 'rerun';
    default:
      return 'manual-approval';
  }
}

