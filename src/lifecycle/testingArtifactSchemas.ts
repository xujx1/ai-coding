import { z } from 'zod';
import {
  TESTING_ARTIFACT_TYPES,
  type TestingArtifactType,
} from './testingArtifacts.js';

export { TESTING_ARTIFACT_TYPES, type TestingArtifactType };

export const TestingArtifactStatusSchema = z.enum([
  'draft',
  'waiting_review',
  'approved',
  'rejected',
  'running',
  'passed',
  'failed',
  'skipped',
  'blocked',
]);

export type TestingArtifactStatus = z.infer<typeof TestingArtifactStatusSchema>;

const BaseTestingArtifactSchema = z.object({
  schemaVersion: z.literal(1),
  artifactKind: z.enum(TESTING_ARTIFACT_TYPES),
  requirementId: z.string().min(1),
  runId: z.string().min(1),
  workflowInstanceId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  status: TestingArtifactStatusSchema,
  generatedAt: z.number(),
  testRunId: z.string().optional(),
  deploymentSetId: z.string().optional(),
  environmentId: z.string().optional(),
  upstreamArtifactIds: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).optional(),
});

export const TestStrategySchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-strategy'),
  strategyId: z.string().min(1),
  title: z.string().min(1),
  scope: z.object({
    appIds: z.array(z.string()),
    requirementSummary: z.string().optional(),
    risks: z.array(z.string()).default([]),
  }),
  objectives: z.array(z.string()).default([]),
  testLevels: z.array(z.enum(['api', 'integration', 'e2e', 'contract', 'data', 'regression'])).default([]),
  assumptions: z.array(z.string()).default([]),
});

export const TestCaseSchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-test-cases'),
  caseSetId: z.string().min(1),
  cases: z.array(z.object({
    testCaseId: z.string().min(1),
    title: z.string().min(1),
    appIds: z.array(z.string()).default([]),
    priority: z.enum(['p0', 'p1', 'p2']).default('p1'),
    preconditions: z.array(z.string()).default([]),
    steps: z.array(z.string()).default([]),
    expectedResult: z.string().default(''),
    requirementRefs: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
  })),
});

export const DataPlanSchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-data-plan'),
  dataPlanId: z.string().min(1),
  isolationKey: z.string().min(1),
  steps: z.array(z.object({
    id: z.string().min(1),
    action: z.enum(['api', 'db', 'message', 'mock', 'config', 'faker']),
    description: z.string().min(1),
    inputRef: z.string().optional(),
    outputRef: z.string().optional(),
    rollbackRef: z.string().optional(),
    validation: z.string().default(''),
    cleanup: z.string().default(''),
  })),
  cleanupRequired: z.boolean().default(true),
  rollbackRefs: z.array(z.string()).default([]),
});

export const GeneratedScriptSchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-generated-script'),
  scriptId: z.string().min(1),
  testCaseIds: z.array(z.string()).default([]),
  dataPlanId: z.string().optional(),
  language: z.enum(['python', 'typescript', 'javascript', 'shell']).default('python'),
  path: z.string().min(1),
  command: z.string().min(1),
  content: z.string().default(''),
  environmentRequirements: z.array(z.string()).default([]),
});

export const ExecutionReportSchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-execution-report'),
  executionReportId: z.string().min(1),
  executor: z.string().default('pytest'),
  command: z.string().default(''),
  exitCode: z.number().int().nullable(),
  durationMs: z.number().nonnegative().default(0),
  stdout: z.string().default(''),
  stderr: z.string().default(''),
  timedOut: z.boolean().default(false),
  dependencyErrors: z.array(z.string()).default([]),
  evidenceArtifactIds: z.array(z.string()).default([]),
  summary: z.object({
    passed: z.number().int().nonnegative().default(0),
    failed: z.number().int().nonnegative().default(0),
    skipped: z.number().int().nonnegative().default(0),
    errored: z.number().int().nonnegative().default(0),
    total: z.number().int().nonnegative().default(0),
  }),
});

export const CoverageReportSchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-coverage-report'),
  coverageReportId: z.string().min(1),
  requirementCoverage: z.number().min(0).max(1),
  caseCoverage: z.number().min(0).max(1),
  scriptCoverage: z.number().min(0).max(1),
  successRate: z.number().min(0).max(1),
  uncoveredRequirementRefs: z.array(z.string()).default([]),
  uncoveredCaseIds: z.array(z.string()).default([]),
});

export const FailureTriageSchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-failure-triage'),
  triageId: z.string().min(1),
  category: z.enum(['test', 'script', 'data', 'environment', 'dependency', 'application_regression', 'operational']),
  confidence: z.number().min(0).max(1),
  summary: z.string().default(''),
  evidenceArtifactIds: z.array(z.string()).default([]),
  recommendedActions: z.array(z.string()).default([]),
});

export const RegressionPlanSchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-regression-plan'),
  regressionPlanId: z.string().min(1),
  rerunCaseIds: z.array(z.string()).default([]),
  impactedAppIds: z.array(z.string()).default([]),
  dependencyRefs: z.array(z.string()).default([]),
  rationale: z.string().default(''),
});

export const QualityGateResultSchema = BaseTestingArtifactSchema.extend({
  artifactKind: z.literal('testing-quality-gate'),
  qualityGateId: z.string().min(1),
  decision: z.enum(['passed', 'failed', 'blocked']),
  reasons: z.array(z.string()).default([]),
  metricArtifactIds: z.array(z.string()).default([]),
});

export const TestingArtifactSchema = z.discriminatedUnion('artifactKind', [
  TestStrategySchema,
  TestCaseSchema,
  DataPlanSchema,
  GeneratedScriptSchema,
  ExecutionReportSchema,
  CoverageReportSchema,
  FailureTriageSchema,
  RegressionPlanSchema,
  QualityGateResultSchema,
]);

export type TestStrategy = z.infer<typeof TestStrategySchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type DataPlan = z.infer<typeof DataPlanSchema>;
export type GeneratedScript = z.infer<typeof GeneratedScriptSchema>;
export type ExecutionReport = z.infer<typeof ExecutionReportSchema>;
export type CoverageReport = z.infer<typeof CoverageReportSchema>;
export type FailureTriage = z.infer<typeof FailureTriageSchema>;
export type RegressionPlan = z.infer<typeof RegressionPlanSchema>;
export type QualityGateResult = z.infer<typeof QualityGateResultSchema>;
export type TestingArtifact = z.infer<typeof TestingArtifactSchema>;

export function validateTestingArtifact(artifact: unknown): TestingArtifact {
  return TestingArtifactSchema.parse(artifact);
}

export function testingArtifactFileName(artifact: Pick<TestingArtifact, 'artifactKind'>): string {
  return `${artifact.artifactKind}.json`;
}
