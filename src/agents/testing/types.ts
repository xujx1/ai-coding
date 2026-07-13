import type {
  DataPlan,
  FailureTriage,
  GeneratedScript,
  QualityGateResult,
  RegressionPlan,
  TestCase,
  TestStrategy,
} from '../../lifecycle/testingArtifactSchemas.js';
import type { TestingDataDependencyEdge } from '../../tools/testing/data.js';

export interface TestingAgentContext {
  requirementId: string;
  runId: string;
  workflowInstanceId: string;
  generatedAt?: number;
  modelGenerate?: <T>(prompt: string, fallback: T) => Promise<T> | T;
}

export interface StrategyAgentInput extends TestingAgentContext {
  requirementSummary: string;
  appIds: string[];
  risks?: string[];
}

export interface CaseAgentInput extends TestingAgentContext {
  strategy: TestStrategy;
}

export interface DataPlanAgentInput extends TestingAgentContext {
  caseSet: TestCase;
  dependencyEdges?: TestingDataDependencyEdge[];
}

export interface ScriptReviewAgentInput extends TestingAgentContext {
  scripts: GeneratedScript[];
  minimumScriptCount?: number;
}

export interface FailureTriageAgentInput extends TestingAgentContext {
  message: string;
  evidenceArtifactIds?: string[];
}

export interface RegressionAgentInput extends TestingAgentContext {
  failedCaseIds: string[];
  impactedAppIds: string[];
  dependencyRefs?: string[];
  triage?: FailureTriage;
}

export interface TestingAgents {
  generateStrategy(input: StrategyAgentInput): Promise<TestStrategy>;
  generateCases(input: CaseAgentInput): Promise<TestCase>;
  generateDataPlan(input: DataPlanAgentInput): Promise<DataPlan>;
  reviewScripts(input: ScriptReviewAgentInput): Promise<QualityGateResult>;
  triageFailure(input: FailureTriageAgentInput): Promise<FailureTriage>;
  planRegression(input: RegressionAgentInput): Promise<RegressionPlan>;
}
