/**
 * Fixed MRD-to-Code Pipeline definition.
 * Not a generic workflow editor - this is a fixed business pipeline.
 *
 * Pipeline stages:
 *   MRD / Knowledge Init -> 需求拆解 -> Implementation Plan + OpenSpec Tasks
 *   -> Java Impl(+Review)
 *   -> Test Code Generate(+Unit Test Runner) -> Cross App Test -> Archive
 */

export interface PipelineNode {
  id: string;
  name: string;
  description: string;
  hasConfirmationGate: boolean;
  usesReActLoop: boolean;   // Whether this stage uses a full ReAct agent loop
  maxTurns: number;
  planModeRequired: boolean; // Whether plan mode is required before execution
  artifactOutput?: string;  // Artifact file path relative to artifacts/
  artifactOutputs?: string[]; // Multiple artifact files relative to artifacts/
}

export const LEGACY_STAGE_ID_MAP: Record<string, string> = {
  'prd-generate': 'implementation-plan',
  'tech-design-generate': 'implementation-plan',
  'tech-design': 'implementation-plan',
  'implementation': 'implementation-plan',
  'openspec': 'implementation-plan',
  'openspec-optional': 'implementation-plan',
  'spec-generate': 'implementation-plan',
  'test-spec': 'implementation-plan',
  'testspec-generate': 'implementation-plan',
  'test-code': 'testcode-generate',
  'java-review': 'java-impl',
  'maven-test': 'testcode-generate',
  'maven-test-runner': 'testcode-generate',
  'mrd-clarification': 'mrd-render',
  'mrd-clarify': 'mrd-render',
  'requirement-decompose': 'mrd-render',
  'cross-app-test': 'execute-integration-tests',
};

export function normalizeStageId(id: string): string {
  return LEGACY_STAGE_ID_MAP[id] ?? id;
}

export const PIPELINE_NODES: PipelineNode[] = [
  {
    id: 'upload-init',
    name: 'MRD / Knowledge Init',
    description: 'Initialize run directory and prepare requirement, knowledge-base, and repository-index context',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 1,
    planModeRequired: false,
  },
  {
    id: 'mrd-render',
    name: '需求分析与归属确认',
    description: 'Render uploaded requirements and decompose them into feature ownership, project boundaries, implementation surfaces, and clarification questions',
    hasConfirmationGate: true,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutput: 'mrd-clarified.md',
    artifactOutputs: ['mrd-clarified.md', 'mrd-clarify-questions.md'],
  },
  {
    id: 'implementation-plan',
    name: '实施方案与任务',
    description: 'Generate SDD technical design artifacts and OpenSpec development/test task artifacts from the confirmed MRD/proposal',
    hasConfirmationGate: true,
    usesReActLoop: false,
    maxTurns: 15,
    planModeRequired: false,
    artifactOutput: '{project}/tech-design.md',
    artifactOutputs: [
      'implementation-plan-manifest.json',
      '{project}/tech-design.md',
      '{project}/openspec-task.md',
      '{project}/openspec-test-task.md',
      '{project}/openspec/changes/*/proposal.md',
      '{project}/openspec/changes/*/design.md',
      '{project}/openspec/changes/*/tasks.md',
      '{project}/openspec/changes/*/specs/*/spec.md',
      'spec-manifest.json',
    ],
  },
  {
    id: 'java-impl',
    name: 'Java Impl',
    description: 'Implement Java code, review changes, and produce project-scoped change/review artifacts',
    hasConfirmationGate: false,
    usesReActLoop: true,
    maxTurns: 80,
    planModeRequired: false,
    artifactOutputs: [
      '{project}/changed-files/*.java',
      '{project}/changed-files.json',
      '{project}/code-preview-manifest.json',
      '{project}/code-review.md',
      '{project}/review-findings.json',
    ],
  },
  {
    id: 'testcode-generate',
    name: 'Test Code Generate',
    description: 'Generate unit test code, run Maven tests, and classify failures',
    hasConfirmationGate: true,
    usesReActLoop: true,
    maxTurns: 50,
    planModeRequired: false,
    artifactOutputs: [
      '{project}/changed-test-files/*.java',
      '{project}/test-file-list.md',
      '{project}/testcode-generation-report.md',
      '{project}/test-report.md',
      '{project}/surefire-summary.json',
      '{project}/coverage-summary.json',
      '{project}/failure-classification.json',
      '{project}/autofix-history.md',
    ],
  },
  {
    id: 'integration-test-cases',
    name: '集成测试用例',
    description: 'Generate and review integration testing strategy and test cases after application branches complete',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutputs: [
      'testing/*/workflow-state.json',
      'testing/*/testing-strategy-*.json',
      'testing/*/testing-test-cases-*.json',
    ],
  },
  {
    id: 'test-data-plan',
    name: '造数',
    description: 'Generate and review testing data plans for cross-application integration tests',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutputs: [
      'testing/*/workflow-state.json',
      'testing/*/testing-data-plan-*.json',
    ],
  },
  {
    id: 'integration-test-code',
    name: '生成集成测试代码',
    description: 'Generate and review executable integration test scripts',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutputs: [
      'testing/*/workflow-state.json',
      'testing/*/testing-generated-script-*.json',
      'testing/*/testing-quality-gate-*.json',
    ],
  },
  {
    id: 'deploy-related-apps',
    name: '部署关联应用',
    description: 'Resolve and validate related application deployment context for integration testing',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutputs: [
      'testing/*/workflow-state.json',
      'cross-app/delivery-metadata.json',
    ],
  },
  {
    id: 'execute-integration-tests',
    name: '执行集成测试',
    description: 'Run AI Testing and E2E verification, collect reports, calculate metrics, triage failures, and update regression scope',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutputs: [
      'cross-app/test-results.json',
      'cross-app/delivery-metadata.json',
      '{project}/e2e/e2e-summary.json',
      'testing/*/workflow-state.json',
    ],
  },
  {
    id: 'archive',
    name: 'Archive',
    description: 'Generate project-scoped archive reports and create final delivery package',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutputs: ['{project}/archive-report.md', 'archive-manifest.json', 'downloads/{runId}-projects.zip'],
  },
];

export function getNodeById(id: string): PipelineNode | undefined {
  const normalized = normalizeStageId(id);
  return PIPELINE_NODES.find(n => n.id === normalized);
}

export function getNodeIndex(id: string): number {
  const normalized = normalizeStageId(id);
  return PIPELINE_NODES.findIndex(n => n.id === normalized);
}
