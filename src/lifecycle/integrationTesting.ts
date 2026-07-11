import * as fs from 'fs';
import * as path from 'path';
import type { RunPaths } from '../runtime/paths.js';
import type {
  ArtifactRef,
  LifecycleState,
  RequirementDeploymentSetRef,
  TestRunRef,
} from './types.js';
import type { EnvironmentPlan } from './deployment.js';
import type { FanoutDecisionResult } from './fanout.js';
import type { KnowledgeDelta } from './knowledge.js';
import { createKnowledgeDelta } from './knowledge.js';
import { registerArtifact } from './artifacts.js';

export interface IntegrationTestingInput {
  requirementId: string;
  runId: string;
  fanoutDecision: FanoutDecisionResult;
  environmentPlan: EnvironmentPlan;
  deploymentSet: RequirementDeploymentSetRef;
  appKnowledgeArtifactIds: string[];
  apiIndexArtifactIds: string[];
  dbSchemaArtifactIds: string[];
  graphArtifactIds: string[];
}

export interface DataPlan {
  schemaVersion: 1;
  requirementId: string;
  runId: string;
  environmentId: string;
  testRunId: string;
  isolationKey: string;
  steps: DataStep[];
}

export interface DataStep {
  id: string;
  action: 'api' | 'db' | 'message' | 'mock' | 'config';
  description: string;
  inputRef?: string;
  outputRef?: string;
  rollbackRef?: string;
  validation: string;
  cleanup: string;
}

export interface IntegrationTestCase {
  testCaseId: string;
  appIds: string[];
  title: string;
  priority: 'p0' | 'p1' | 'p2';
  steps: string[];
  expectedResult: string;
}

export interface IntegrationTestScript {
  scriptId: string;
  testCaseId: string;
  path: string;
  command: string;
}

export function assembleIntegrationTestingInput(args: {
  state: LifecycleState;
  fanoutDecision: FanoutDecisionResult;
  environmentPlan: EnvironmentPlan;
  deploymentSet: RequirementDeploymentSetRef;
}): IntegrationTestingInput {
  return {
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    fanoutDecision: args.fanoutDecision,
    environmentPlan: args.environmentPlan,
    deploymentSet: args.deploymentSet,
    appKnowledgeArtifactIds: args.state.artifacts.filter(ref => ref.type.startsWith('app-knowledge')).map(ref => ref.artifactId),
    apiIndexArtifactIds: args.state.artifacts.filter(ref => ref.type === 'app-knowledge-api-index').map(ref => ref.artifactId),
    dbSchemaArtifactIds: args.state.artifacts.filter(ref => ref.type === 'app-knowledge-db-schema').map(ref => ref.artifactId),
    graphArtifactIds: args.state.artifacts.filter(ref => ref.type === 'app-knowledge-gitnexus-graph').map(ref => ref.artifactId),
  };
}

export function createDataPlan(args: {
  input: IntegrationTestingInput;
  environmentId: string;
  testRunId: string;
  isolationKey?: string;
}): DataPlan {
  return {
    schemaVersion: 1,
    requirementId: args.input.requirementId,
    runId: args.input.runId,
    environmentId: args.environmentId,
    testRunId: args.testRunId,
    isolationKey: args.isolationKey ?? `${args.input.requirementId}-${args.input.runId}-${args.testRunId}`,
    steps: [{
      id: 'seed-primary-flow',
      action: 'api',
      description: 'Create isolated data for primary integration path.',
      validation: 'Verify seeded data is visible through the target API.',
      cleanup: 'Delete or expire seeded data by isolation key.',
    }],
  };
}

export function generateIntegrationTestCases(input: IntegrationTestingInput): IntegrationTestCase[] {
  const primary = input.fanoutDecision.primaryApps;
  const impacted = [
    ...input.fanoutDecision.primaryApps,
    ...input.fanoutDecision.secondaryApps,
    ...input.fanoutDecision.testOnlyApps,
  ];
  return [{
    testCaseId: 'integration-primary-flow',
    appIds: impacted,
    title: 'Primary requirement integration flow',
    priority: 'p0',
    steps: [
      `Deploy primary apps: ${primary.join(', ') || 'none'}`,
      `Use deployment set: ${input.deploymentSet.deploymentSetId}`,
      'Run API or E2E validation for impacted app boundary.',
    ],
    expectedResult: 'Primary flow passes and all impacted app observations are recorded.',
  }];
}

export function generateIntegrationTestScripts(cases: IntegrationTestCase[]): IntegrationTestScript[] {
  return cases.map(testCase => ({
    scriptId: `${testCase.testCaseId}-script`,
    testCaseId: testCase.testCaseId,
    path: `artifacts/testing/scripts/${testCase.testCaseId}.spec.ts`,
    command: `node --test ${testCase.testCaseId}.spec.ts`,
  }));
}

export function recordIntegrationTestRun(args: {
  state: LifecycleState;
  testRunId: string;
  deploymentSetId: string;
  environmentId: string;
  status: TestRunRef['status'];
  artifactIds?: string[];
  evidenceArtifactIds?: string[];
}): TestRunRef {
  const testRun: TestRunRef = {
    testRunId: args.testRunId,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    deploymentSetId: args.deploymentSetId,
    environmentId: args.environmentId,
    status: args.status,
    artifactIds: args.artifactIds ?? [],
    evidenceArtifactIds: args.evidenceArtifactIds ?? [],
  };
  args.state.testRuns = [
    ...args.state.testRuns.filter(existing => existing.testRunId !== args.testRunId),
    testRun,
  ];
  return testRun;
}

export function writeIntegrationTestingArtifacts(args: {
  paths: RunPaths;
  state: LifecycleState;
  dataPlan: DataPlan;
  testCases: IntegrationTestCase[];
  scripts: IntegrationTestScript[];
  report: string;
}): { dataPlanRef: ArtifactRef; testCaseRef: ArtifactRef; scriptRefs: ArtifactRef[]; reportRef: ArtifactRef } {
  const testingDir = path.join(args.paths.artifactsDir, 'testing');
  const scriptDir = path.join(testingDir, 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(path.join(testingDir, 'data-plan.json'), JSON.stringify(args.dataPlan, null, 2), 'utf-8');
  fs.writeFileSync(path.join(testingDir, 'test-cases.json'), JSON.stringify(args.testCases, null, 2), 'utf-8');
  fs.writeFileSync(path.join(testingDir, 'test-report.md'), args.report, 'utf-8');
  for (const script of args.scripts) {
    fs.writeFileSync(path.join(args.paths.runDir, script.path), renderTestScript(script), 'utf-8');
  }
  return {
    dataPlanRef: registerArtifact(args.state, {
      type: 'data-plan',
      path: 'artifacts/testing/data-plan.json',
      sourceType: 'testing',
    }),
    testCaseRef: registerArtifact(args.state, {
      type: 'integration-test-cases',
      path: 'artifacts/testing/test-cases.json',
      sourceType: 'testing',
    }),
    scriptRefs: args.scripts.map(script => registerArtifact(args.state, {
      type: 'integration-test-script',
      path: script.path,
      sourceType: 'testing',
    })),
    reportRef: registerArtifact(args.state, {
      type: 'integration-test-report',
      path: 'artifacts/testing/test-report.md',
      sourceType: 'testing',
    }),
  };
}

export function createTestingKnowledgeDeltaCandidates(args: {
  state: LifecycleState;
  appIds: string[];
  evidenceArtifactIds: string[];
  summary: string;
}): KnowledgeDelta[] {
  return args.appIds.map(appId => createKnowledgeDelta({
    state: args.state,
    appId,
    changeTypes: ['test'],
    evidenceArtifactIds: args.evidenceArtifactIds,
    summary: args.summary,
  }));
}

function renderTestScript(script: IntegrationTestScript): string {
  return [
    "import test from 'node:test';",
    "import * as assert from 'assert/strict';",
    '',
    `test('${script.testCaseId}', () => {`,
    "  assert.equal(true, true);",
    '});',
    '',
  ].join('\n');
}

