import type { RunPaths } from '../runtime/paths.js';
import type { FailureCategory } from './failureFix.js';
import type { LifecycleState } from './types.js';
import type { DataPlan, IntegrationTestCase } from './integrationTesting.js';
import type { RepositoryRef } from './repositoryRuntime.js';
import { AI_OPS_SOURCE_FILES, classifyOperationalFailure } from '../tools/testing/opsFailureClassifier.js';
import { TESTING_SOURCE_FILES, enhanceCrossAppDataPlan } from '../tools/testing/dataPlan.js';
import { createHarnessManagedRepositoryRefs, HARNESS_SOURCE_FILES } from '../integrations/harness.js';

export const REFERENCE_IMPORTS = {
  testing: 'src/tools/testing/dataPlan.ts',
  aiOps: 'src/tools/testing/opsFailureClassifier.ts',
  harness: 'src/integrations/harness.ts',
} as const;

export interface ReferenceCapabilitySnapshot {
  available: boolean;
  root: string;
  sourceFiles: string[];
  notes: string[];
}

export interface ExternalCapabilitySnapshot {
  testing: ReferenceCapabilitySnapshot;
  aiOps: ReferenceCapabilitySnapshot;
  harness: ReferenceCapabilitySnapshot;
}

export function inspectExternalCapabilityImports(repoRoot: string): ExternalCapabilitySnapshot {
  void repoRoot;
  return {
    testing: availableSnapshot(REFERENCE_IMPORTS.testing, TESTING_SOURCE_FILES),
    aiOps: availableSnapshot(REFERENCE_IMPORTS.aiOps, AI_OPS_SOURCE_FILES),
    harness: availableSnapshot(REFERENCE_IMPORTS.harness, HARNESS_SOURCE_FILES),
  };
}

export function enhanceDataPlanWithTestingReference(args: {
  dataPlan: DataPlan;
  testCases: IntegrationTestCase[];
  state: LifecycleState;
  capabilities: ExternalCapabilitySnapshot;
}): DataPlan {
  void args.state;
  void args.capabilities;
  return enhanceCrossAppDataPlan({
    dataPlan: args.dataPlan,
    testCases: args.testCases,
  });
}

export function classifyWithAiOpsReference(message: string): {
  category: FailureCategory;
  confidence: number;
  source: string;
  matchedRule: string;
} {
  const matched = classifyOperationalFailure(message);
  return {
    category: matched.category,
    confidence: matched.confidence,
    source: REFERENCE_IMPORTS.aiOps,
    matchedRule: matched.matchedRule,
  };
}

export function createHarnessRepositoryRefs(args: {
  paths: RunPaths;
  state: LifecycleState;
  capabilities: ExternalCapabilitySnapshot;
}): RepositoryRef[] {
  void args.capabilities;
  return createHarnessManagedRepositoryRefs(args);
}

function availableSnapshot(root: string, sourceFiles: string[]): ReferenceCapabilitySnapshot {
  return {
    available: true,
    root,
    sourceFiles,
    notes: ['Product-scoped TypeScript integration is available in src/.'],
  };
}
