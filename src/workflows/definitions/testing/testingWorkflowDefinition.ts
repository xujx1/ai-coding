import type { TestingArtifactType } from '../../../lifecycle/testingArtifacts.js';

export type TestingWorkflowNodeId =
  | 'load_requirement'
  | 'retrieve_context'
  | 'generate_strategy'
  | 'review_strategy'
  | 'generate_cases'
  | 'review_cases'
  | 'generate_data_plans'
  | 'review_data_plans'
  | 'deploy_related_apps'
  | 'generate_scripts'
  | 'review_scripts'
  | 'execute_scripts'
  | 'collect_report'
  | 'calculate_metrics'
  | 'quality_gate'
  | 'failure_triage'
  | 'regression_update'
  | 'persist_artifacts';

export interface TestingWorkflowNodeDefinition {
  id: TestingWorkflowNodeId;
  label: string;
  inputArtifacts: TestingArtifactType[];
  outputArtifacts: TestingArtifactType[];
  reviewGate: boolean;
  retryable: boolean;
  skippable: boolean;
  terminal?: boolean;
}

export const TESTING_WORKFLOW_ID = 'ai-testing-management';

export const TESTING_WORKFLOW_NODES: TestingWorkflowNodeDefinition[] = [
  { id: 'load_requirement', label: 'Load Requirement', inputArtifacts: [], outputArtifacts: [], reviewGate: false, retryable: true, skippable: false },
  { id: 'retrieve_context', label: 'Retrieve Context', inputArtifacts: [], outputArtifacts: [], reviewGate: false, retryable: true, skippable: false },
  { id: 'generate_strategy', label: 'Generate Strategy', inputArtifacts: [], outputArtifacts: ['testing-strategy'], reviewGate: false, retryable: true, skippable: false },
  { id: 'review_strategy', label: 'Review Strategy', inputArtifacts: ['testing-strategy'], outputArtifacts: [], reviewGate: true, retryable: false, skippable: false },
  { id: 'generate_cases', label: 'Generate Cases', inputArtifacts: ['testing-strategy'], outputArtifacts: ['testing-test-cases'], reviewGate: false, retryable: true, skippable: false },
  { id: 'review_cases', label: 'Review Cases', inputArtifacts: ['testing-test-cases'], outputArtifacts: [], reviewGate: true, retryable: false, skippable: false },
  { id: 'generate_data_plans', label: 'Generate Data Plans', inputArtifacts: ['testing-test-cases'], outputArtifacts: ['testing-data-plan'], reviewGate: false, retryable: true, skippable: false },
  { id: 'review_data_plans', label: 'Review Data Plans', inputArtifacts: ['testing-data-plan'], outputArtifacts: [], reviewGate: true, retryable: false, skippable: false },
  { id: 'generate_scripts', label: 'Generate Scripts', inputArtifacts: ['testing-test-cases', 'testing-data-plan'], outputArtifacts: ['testing-generated-script'], reviewGate: false, retryable: true, skippable: false },
  { id: 'review_scripts', label: 'Review Scripts', inputArtifacts: ['testing-generated-script'], outputArtifacts: ['testing-quality-gate'], reviewGate: true, retryable: false, skippable: false },
  { id: 'deploy_related_apps', label: 'Deploy Related Apps', inputArtifacts: ['testing-generated-script'], outputArtifacts: [], reviewGate: false, retryable: true, skippable: true },
  { id: 'execute_scripts', label: 'Execute Scripts', inputArtifacts: ['testing-generated-script'], outputArtifacts: ['testing-execution-report'], reviewGate: false, retryable: true, skippable: true },
  { id: 'collect_report', label: 'Collect Report', inputArtifacts: ['testing-execution-report'], outputArtifacts: [], reviewGate: false, retryable: true, skippable: false },
  { id: 'calculate_metrics', label: 'Calculate Metrics', inputArtifacts: ['testing-execution-report'], outputArtifacts: ['testing-coverage-report'], reviewGate: false, retryable: true, skippable: false },
  { id: 'quality_gate', label: 'Quality Gate', inputArtifacts: ['testing-coverage-report'], outputArtifacts: ['testing-quality-gate'], reviewGate: true, retryable: false, skippable: false },
  { id: 'failure_triage', label: 'Failure Triage', inputArtifacts: ['testing-execution-report', 'testing-quality-gate'], outputArtifacts: ['testing-failure-triage'], reviewGate: false, retryable: true, skippable: true },
  { id: 'regression_update', label: 'Regression Update', inputArtifacts: ['testing-failure-triage'], outputArtifacts: ['testing-regression-plan'], reviewGate: false, retryable: true, skippable: true },
  { id: 'persist_artifacts', label: 'Persist Artifacts', inputArtifacts: [], outputArtifacts: [], reviewGate: false, retryable: false, skippable: false, terminal: true },
];

export function getTestingWorkflowNode(id: TestingWorkflowNodeId): TestingWorkflowNodeDefinition {
  const node = TESTING_WORKFLOW_NODES.find(candidate => candidate.id === id);
  if (!node) throw new Error(`Unknown testing workflow node: ${id}`);
  return node;
}

export function nextTestingWorkflowNode(id: TestingWorkflowNodeId): TestingWorkflowNodeDefinition | undefined {
  const index = TESTING_WORKFLOW_NODES.findIndex(node => node.id === id);
  return index >= 0 ? TESTING_WORKFLOW_NODES[index + 1] : undefined;
}
