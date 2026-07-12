import type { DataPlan, DataStep, IntegrationTestCase } from '../../lifecycle/integrationTesting.js';

export const TESTING_SOURCE_FILES = [
  'src/tools/testing/dataPlan.ts',
];

export function enhanceCrossAppDataPlan(args: {
  dataPlan: DataPlan;
  testCases: IntegrationTestCase[];
}): DataPlan {
  const involvedAppIds = new Set(args.testCases.flatMap(testCase => testCase.appIds));
  const steps: DataStep[] = [...args.dataPlan.steps];
  let order = steps.length + 1;
  for (const appId of involvedAppIds) {
    steps.push({
      id: `testing-cross-app-${safeSegment(appId)}`,
      action: 'api',
      description: `Prepare cross-app data capability for ${appId}.`,
      validation: `Validate ${appId} observes the lifecycle isolation key.`,
      cleanup: `Rollback or expire ${appId} data created for ${args.dataPlan.isolationKey}.`,
      inputRef: `testing:data-plan-step:${order}`,
    });
    order += 1;
  }
  return {
    ...args.dataPlan,
    steps,
  };
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}
