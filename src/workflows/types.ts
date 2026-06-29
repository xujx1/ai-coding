export type WorkflowNodeType =
  | 'stage'
  | 'agent'
  | 'confirmation'
  | 'router'
  | 'fanout'
  | 'join'
  | 'aggregate_review'
  | 'end';

export type WorkflowEdgeKind =
  | 'normal'
  | 'conditional'
  | 'rollback'
  | 'retry'
  | 'approval';

export type StageRunnerId =
  | 'upload-init'
  | 'mrd-render'
  | 'implementation-plan'
  | 'spec-generate'
  | 'java-impl'
  | 'testcode-generate'
  | 'archive'
  | string;

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  locked: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  globalConfig: WorkflowGlobalConfig;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position?: WorkflowPosition;
  data: WorkflowNodeData;
}

export interface WorkflowPosition {
  x: number;
  y: number;
}

export interface WorkflowNodeData {
  label: string;
  description?: string;
  stageId?: string;
  runner?: StageRunnerId;
  hasConfirmationGate?: boolean;
  sourceStageId?: string;
  usesReActLoop?: boolean;
  maxTurns?: number;
  planModeRequired?: boolean;
  artifactOutputs?: string[];
  enabledBuiltins?: string[];
  enabledMcpTools?: string[];
  enabledSkills?: string[];
  systemPrompt?: string;
  promptTemplateId?: string;
  modelOverrideKey?: string;
  fanout?: FanoutConfig;
  join?: JoinConfig;
  router?: RouterConfig;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  kind: WorkflowEdgeKind;
  condition?: WorkflowEdgeCondition;
  priority?: number;
}

export interface WorkflowEdgeCondition {
  expression?: string;
  routeKey?: string;
  description?: string;
}

export interface WorkflowGlobalConfig {
  runtime: 'legacy' | 'langgraph';
  structureEditable: boolean;
  defaultModelOverrideKey?: string;
  maxSteps?: number;
  branchConcurrencyLimit?: number;
  llmConcurrencyLimit?: number;
  testConcurrencyLimit?: number;
}

export interface FanoutConfig {
  source: 'projects' | 'apps' | 'custom';
  branchWorkflowId: string;
  concurrencyLimit: number;
  failurePolicy: BranchFailurePolicy;
  maxFailures?: number;
}

export type BranchFailurePolicy =
  | 'fail_fast'
  | 'continue_and_collect'
  | 'threshold';

export interface JoinConfig {
  waitFor: 'all' | 'required_only' | 'threshold';
  minSuccess?: number;
  timeoutMs?: number;
}

export interface RouterConfig {
  routes: Record<string, string>;
  defaultTarget?: string;
  resetDownstream?: boolean;
}

export interface BranchWorkflowDefinition extends WorkflowDefinition {
  branchKind: 'project' | 'application' | 'module';
  inputSchema: BranchWorkflowInputSchema;
}

export interface BranchWorkflowInputSchema {
  branchId: string;
  projectName: string;
  projectRoot: string;
  requirementSlicePath: string;
  upstreamArtifacts: string[];
}

export interface WorkflowSnapshot {
  workflowId: string;
  workflowVersion: number;
  capturedAt: string;
  definition: WorkflowDefinition;
}

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  severity: 'error' | 'warning';
}

export interface WorkflowValidationResult {
  valid: boolean;
  issues: WorkflowValidationIssue[];
}
