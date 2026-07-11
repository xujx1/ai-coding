/**
 * Fixed MRD-to-Code Pipeline definition.
 * Not a generic workflow editor - this is a fixed business pipeline.
 *
 * Pipeline stages:
 *   Upload / Init -> 需求拆解 -> Implementation Plan
 *   -> Spec Generate -> Java Impl(+Review)
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
  'openspec': 'spec-generate',
  'openspec-optional': 'spec-generate',
  'test-spec': 'spec-generate',
  'testspec-generate': 'spec-generate',
  'test-code': 'testcode-generate',
  'java-review': 'java-impl',
  'maven-test': 'testcode-generate',
  'maven-test-runner': 'testcode-generate',
  'mrd-clarification': 'mrd-render',
  'mrd-clarify': 'mrd-render',
  'requirement-decompose': 'mrd-render',
};

export function normalizeStageId(id: string): string {
  return LEGACY_STAGE_ID_MAP[id] ?? id;
}

export const PIPELINE_NODES: PipelineNode[] = [
  {
    id: 'upload-init',
    name: 'Upload / Init',
    description: 'Initialize run directory, process uploaded files, extract project',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 1,
    planModeRequired: false,
  },
  {
    id: 'mrd-render',
    name: '需求拆解',
    description: 'Render uploaded requirements and decompose them into feature ownership, project boundaries, and clarification questions',
    hasConfirmationGate: true,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutput: 'mrd-clarified.md',
    artifactOutputs: ['mrd-clarified.md', 'mrd-clarify-questions.md'],
  },
  {
    id: 'implementation-plan',
    name: '实施方案',
    description: 'Generate SDD technical design artifacts from the confirmed MRD/proposal',
    hasConfirmationGate: true,
    usesReActLoop: false,
    maxTurns: 15,
    planModeRequired: false,
    artifactOutput: '{project}/tech-design.md',
    artifactOutputs: ['implementation-plan-manifest.json', '{project}/tech-design.md'],
  },
  {
    id: 'spec-generate',
    name: 'SPEC生成',
    description: 'Generate development OpenSpec task list and OpenSpec test-code checklist',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 12,
    planModeRequired: false,
    artifactOutput: 'openspec-task.md',
    artifactOutputs: ['{project}/openspec-task.md', '{project}/openspec-test-task.md'],
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
    id: 'cross-app-test',
    name: '跨应用测试',
    description: 'Run cross-application integration checks after all application branches complete',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 5,
    planModeRequired: false,
    artifactOutputs: [
      'cross-app/test-results.json',
      'cross-app/delivery-metadata.json',
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
