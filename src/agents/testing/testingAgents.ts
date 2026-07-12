import { generateTestingCases } from './caseAgent.js';
import { generateTestingDataPlan } from './dataPlanAgent.js';
import { triageTestingFailure } from './failureTriageAgent.js';
import { planTestingRegression } from './regressionAgent.js';
import { reviewTestingScripts } from './scriptReviewAgent.js';
import { generateTestingStrategy } from './strategyAgent.js';
import type { TestingAgents } from './types.js';

export const DEFAULT_TESTING_AGENTS: TestingAgents = {
  generateStrategy: generateTestingStrategy,
  generateCases: generateTestingCases,
  generateDataPlan: generateTestingDataPlan,
  reviewScripts: reviewTestingScripts,
  triageFailure: triageTestingFailure,
  planRegression: planTestingRegression,
};
