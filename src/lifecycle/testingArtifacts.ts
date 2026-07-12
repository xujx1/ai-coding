import type { ArtifactRef, LifecycleState, TestRunRef } from './types.js';
import { registerArtifact, type RegisterArtifactInput } from './artifacts.js';
import { recordIntegrationTestRun } from './integrationTesting.js';

export const TESTING_ARTIFACT_TYPES = [
  'testing-strategy',
  'testing-test-cases',
  'testing-data-plan',
  'testing-generated-script',
  'testing-execution-report',
  'testing-coverage-report',
  'testing-failure-triage',
  'testing-regression-plan',
  'testing-quality-gate',
] as const;

export type TestingArtifactType = typeof TESTING_ARTIFACT_TYPES[number];

export function isTestingArtifactType(type: string): type is TestingArtifactType {
  return (TESTING_ARTIFACT_TYPES as readonly string[]).includes(type);
}

export function registerTestingArtifact(
  state: LifecycleState,
  input: Omit<RegisterArtifactInput, 'type' | 'sourceType'> & { type: TestingArtifactType },
): ArtifactRef {
  return registerArtifact(state, {
    ...input,
    sourceType: 'testing',
  });
}

export function recordTestingRun(args: {
  state: LifecycleState;
  testRunId: string;
  deploymentSetId: string;
  environmentId: string;
  status: TestRunRef['status'];
  artifactIds?: string[];
  evidenceArtifactIds?: string[];
}): TestRunRef {
  return recordIntegrationTestRun(args);
}
