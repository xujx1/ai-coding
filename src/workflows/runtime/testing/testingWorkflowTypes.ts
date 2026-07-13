import type {
  ArtifactRef,
  LifecycleState,
  TestRunRef,
} from '../../../lifecycle/types.js';
import type {
  CoverageReport,
  DataPlan,
  ExecutionReport,
  FailureTriage,
  GeneratedScript,
  QualityGateResult,
  RegressionPlan,
  TestCase,
  TestingArtifact,
  TestStrategy,
} from '../../../lifecycle/testingArtifactSchemas.js';
import type { TestingDataDependencyEdge } from '../../../tools/testing/data.js';
import type { TestingWorkflowNodeId } from '../../definitions/testing/testingWorkflowDefinition.js';

export type TestingWorkflowStatus =
  | 'pending'
  | 'running'
  | 'waiting_review'
  | 'blocked'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface TestingReviewGate {
  gateId: string;
  nodeId: TestingWorkflowNodeId;
  status: 'waiting' | 'approved' | 'needs_changes' | 'cancelled';
  artifactIds: string[];
  riskIds: string[];
  resumeToken: string;
  feedback?: string;
  decidedAt?: number;
  createdAt: number;
}

export interface TestingWorkflowNodeState {
  nodeId: TestingWorkflowNodeId;
  status: 'pending' | 'running' | 'waiting_review' | 'succeeded' | 'failed' | 'skipped' | 'blocked' | 'cancelled';
  artifactIds: string[];
  message?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface TestingWorkflowRuntimeState {
  schemaVersion: 1;
  workflowInstanceId: string;
  workflowId: string;
  requirementId: string;
  runId: string;
  status: TestingWorkflowStatus;
  currentNodeId: TestingWorkflowNodeId;
  nodes: TestingWorkflowNodeState[];
  pendingGate?: TestingReviewGate;
  gates: TestingReviewGate[];
  artifactIds: string[];
  testRunId?: string;
  deploymentSetId?: string;
  environmentId?: string;
  blockedReason?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StartTestingWorkflowInput {
  requirementId: string;
  runId: string;
  workflowInstanceId?: string;
  requirementSummary?: string;
  appIds?: string[];
  dependencyEdges?: TestingDataDependencyEdge[];
  deploymentSetId?: string;
  environmentId?: string;
  autoApproveReviews?: boolean;
  dryRunExecution?: boolean;
  continueExisting?: boolean;
  stopAfterNode?: TestingWorkflowNodeId;
  now?: number;
}

export interface ResumeTestingWorkflowInput {
  runId: string;
  workflowInstanceId: string;
  resumeToken: string;
  decision: 'approved' | 'needs_changes' | 'cancelled';
  feedback?: string;
  autoApproveReviews?: boolean;
  dryRunExecution?: boolean;
  now?: number;
}

export interface TestingWorkflowContext {
  lifecycle: LifecycleState;
  requirementSummary: string;
  appIds: string[];
  dependencyEdges: TestingDataDependencyEdge[];
  artifacts: Partial<{
    strategy: TestStrategy;
    caseSet: TestCase;
    dataPlan: DataPlan;
    scripts: GeneratedScript[];
    scriptReview: QualityGateResult;
    reports: ExecutionReport[];
    coverage: CoverageReport;
    qualityGate: QualityGateResult;
    triage: FailureTriage;
    regression: RegressionPlan;
  }>;
  refs: ArtifactRef[];
  testRun?: TestRunRef;
}

export interface TestingWorkflowRunResult {
  state: TestingWorkflowRuntimeState;
  context: TestingWorkflowContext;
}

export type AnyTestingWorkflowArtifact = TestingArtifact;
