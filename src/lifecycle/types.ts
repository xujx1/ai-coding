export type LifecyclePhase =
  | 'created'
  | 'fanout'
  | 'planning'
  | 'implementation'
  | 'deployment'
  | 'testing'
  | 'diagnosis'
  | 'fixing'
  | 'archive'
  | 'completed'
  | 'failed';

export type LifecycleStatus =
  | 'active'
  | 'waiting_approval'
  | 'suspended'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type NodeRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'cancelled';

export type ArtifactSourceType =
  | 'agent'
  | 'tool'
  | 'workflow'
  | 'runtime'
  | 'testing'
  | 'ops'
  | 'user'
  | 'system';

export interface ArtifactRef {
  artifactId: string;
  requirementId: string;
  runId: string;
  type: string;
  path?: string;
  uri?: string;
  appId?: string;
  producerNodeRunId?: string;
  producerWorkflowRunId?: string;
  sourceType: ArtifactSourceType;
  sourceId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export interface WorkflowRunRef {
  workflowRunId: string;
  workflowId: string;
  status: WorkflowRunStatus;
}

export interface NodeRunRef {
  nodeRunId: string;
  workflowRunId: string;
  nodeId: string;
  status: NodeRunStatus;
}

export interface WorkflowRun {
  workflowRunId: string;
  requirementId: string;
  runId: string;
  workflowId: string;
  status: WorkflowRunStatus;
  nodeRunIds: string[];
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  traceId?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface NodeRunError {
  message: string;
  code?: string;
  recoverable: boolean;
  details?: Record<string, unknown>;
}

export interface NodeRun {
  nodeRunId: string;
  requirementId: string;
  runId: string;
  workflowRunId: string;
  nodeId: string;
  status: NodeRunStatus;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  approvalGateId?: string;
  traceId?: string;
  startedAt?: number;
  completedAt?: number;
  error?: NodeRunError;
  rerunOfNodeRunId?: string;
  metadata?: Record<string, unknown>;
}

export type ApprovalGateType =
  | 'requirement_clarification'
  | 'technical_design'
  | 'pre_test_environment_code_review'
  | 'high_risk_command'
  | 'large_code_change'
  | 'shared_environment_deployment'
  | 'data_change'
  | 'unknown_failure'
  | 'low_confidence_diagnosis'
  | 'cross_boundary_fix';

export type ApprovalDecision =
  | 'approved'
  | 'rejected'
  | 'needs_changes'
  | 'cancelled';

export interface ApprovalGateRef {
  approvalGateId: string;
  requirementId: string;
  runId: string;
  workflowRunId?: string;
  nodeRunId: string;
  gateType: ApprovalGateType;
  status: 'waiting' | 'resolved' | 'cancelled';
  artifactIds: string[];
  riskIds?: string[];
  resolvedBy?: string;
  decision?: ApprovalDecision;
  decisionReason?: string;
  feedback?: string;
  decidedAt?: number;
  createdAt: number;
}

export interface PipelineRunRef {
  pipelineRunId: string;
  requirementId: string;
  runId: string;
  appId: string;
  branchName?: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  provider: 'harness' | 'internal' | 'local-script' | string;
  artifactIds: string[];
  startedAt?: number;
  completedAt?: number;
}

export interface EnvironmentRef {
  environmentId: string;
  requirementId: string;
  runId: string;
  mode: 'shared-overlay' | 'dedicated' | 'local-simulated';
  baseUrl?: string;
  pipelineRunId?: string;
  metadata?: Record<string, unknown>;
}

export interface RequirementDeploymentSetRef {
  deploymentSetId: string;
  requirementId: string;
  runId: string;
  version: number;
  environmentId: string;
  appIds: string[];
  pipelineRunIds: string[];
  artifactIds: string[];
  createdAt: number;
}

export interface TestRunRef {
  testRunId: string;
  requirementId: string;
  runId: string;
  deploymentSetId: string;
  environmentId: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled' | 'skipped';
  artifactIds: string[];
  evidenceArtifactIds: string[];
}

export interface DiagnosisRef {
  diagnosisId: string;
  requirementId: string;
  runId: string;
  testRunId?: string;
  pipelineRunId?: string;
  category: string;
  confidence: number;
  artifactIds: string[];
  evidenceArtifactIds: string[];
}

export interface FixCycleRef {
  fixCycleId: string;
  requirementId: string;
  runId: string;
  failedDeploymentSetId?: string;
  failedTestRunId?: string;
  failureClassificationId: string;
  status: 'planned' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  owner: 'ai-coding' | 'testing' | 'ai-ops' | 'harness-runtime' | 'user';
  fixType: string;
  artifactIds: string[];
  nextDeploymentSetId?: string;
  nextTestRunId?: string;
}

export interface TraceRef {
  traceId: string;
  requirementId: string;
  runId: string;
  provider: 'langsmith' | 'local' | string;
  workflowRunId?: string;
  nodeRunId?: string;
  url?: string;
  metadata?: Record<string, unknown>;
}

export interface ArchiveRef {
  archiveId: string;
  requirementId: string;
  runId: string;
  reportArtifactId: string;
  knowledgeDeltaArtifactIds: string[];
  archivedAt: number;
}

export interface AppDeliveryState {
  appId: string;
  role: 'primary' | 'secondary' | 'test-only' | 'excluded';
  status:
    | 'pending'
    | 'planning'
    | 'implementing'
    | 'ready_for_deploy'
    | 'deployed'
    | 'testing'
    | 'passed'
    | 'failed'
    | 'archived';
  repoRef?: string;
  branchName?: string;
  artifactIds: string[];
  ciRunIds: string[];
  testRunIds: string[];
}

export type LifecycleEventType =
  | 'workflow_started'
  | 'workflow_completed'
  | 'node_started'
  | 'node_completed'
  | 'node_failed'
  | 'artifact_registered'
  | 'approval_waiting'
  | 'approval_resolved'
  | 'deployment_recorded'
  | 'test_run_recorded'
  | 'diagnosis_recorded'
  | 'fix_cycle_recorded'
  | 'archive_recorded'
  | 'state_migrated';

export interface LifecycleEvent {
  eventId: string;
  requirementId: string;
  runId: string;
  type: LifecycleEventType;
  timestamp: number;
  workflowRunId?: string;
  nodeRunId?: string;
  artifactId?: string;
  data?: Record<string, unknown>;
}

export interface LifecycleState {
  schemaVersion: 1;
  requirementId: string;
  runId: string;
  phase: LifecyclePhase;
  status: LifecycleStatus;
  activeWorkflowRunId?: string;
  apps: AppDeliveryState[];
  artifacts: ArtifactRef[];
  approvals: ApprovalGateRef[];
  workflowRuns: WorkflowRunRef[];
  nodeRuns: NodeRunRef[];
  ciRuns: PipelineRunRef[];
  environments: EnvironmentRef[];
  deploymentSets: RequirementDeploymentSetRef[];
  testRuns: TestRunRef[];
  diagnoses: DiagnosisRef[];
  fixCycles: FixCycleRef[];
  traces: TraceRef[];
  events: LifecycleEvent[];
  archive?: ArchiveRef;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}
