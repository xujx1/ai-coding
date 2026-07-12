import type {
  CoverageReport,
  ExecutionReport,
  GeneratedScript,
  TestCase,
} from '../../testing/artifacts.js';

export function calculateTestingMetrics(args: {
  caseSet: TestCase;
  scripts: GeneratedScript[];
  reports: ExecutionReport[];
  requirementRefs?: string[];
  workflowInstanceId?: string;
  generatedAt?: number;
}): CoverageReport {
  const totalCases = args.caseSet.cases.length;
  const scriptedCaseIds = new Set(args.scripts.flatMap(script => script.testCaseIds));
  const executedCaseIds = new Set(args.reports.flatMap(report => report.upstreamArtifactIds));
  const totalTests = args.reports.reduce((sum, report) => sum + report.summary.total, 0);
  const passedTests = args.reports.reduce((sum, report) => sum + report.summary.passed, 0);
  const requirementRefs = args.requirementRefs ?? unique(args.caseSet.cases.flatMap(testCase => testCase.requirementRefs));
  const coveredRequirementRefs = new Set(args.caseSet.cases.flatMap(testCase => testCase.requirementRefs));

  return {
    schemaVersion: 1,
    artifactKind: 'testing-coverage-report',
    requirementId: args.caseSet.requirementId,
    runId: args.caseSet.runId,
    workflowInstanceId: args.workflowInstanceId ?? args.caseSet.workflowInstanceId,
    sourceNodeId: 'calculate_metrics',
    status: args.reports.some(report => report.status === 'failed') ? 'failed' : 'passed',
    generatedAt: args.generatedAt ?? Date.now(),
    upstreamArtifactIds: [],
    coverageReportId: `coverage-${args.caseSet.caseSetId}`,
    requirementCoverage: ratio(coveredRequirementRefs.size, requirementRefs.length || coveredRequirementRefs.size),
    caseCoverage: ratio(executedCaseIds.size || scriptedCaseIds.size, totalCases),
    scriptCoverage: ratio(scriptedCaseIds.size, totalCases),
    successRate: ratio(passedTests, totalTests),
    uncoveredRequirementRefs: requirementRefs.filter(ref => !coveredRequirementRefs.has(ref)),
    uncoveredCaseIds: args.caseSet.cases
      .filter(testCase => !scriptedCaseIds.has(testCase.testCaseId))
      .map(testCase => testCase.testCaseId),
  };
}

export function evaluateQualityGate(report: CoverageReport, thresholds: {
  requirementCoverage?: number;
  caseCoverage?: number;
  scriptCoverage?: number;
  successRate?: number;
} = {}): { decision: 'passed' | 'failed' | 'blocked'; reasons: string[] } {
  const reasons: string[] = [];
  if (report.requirementCoverage < (thresholds.requirementCoverage ?? 0.8)) reasons.push('Requirement coverage is below threshold.');
  if (report.caseCoverage < (thresholds.caseCoverage ?? 0.8)) reasons.push('Case coverage is below threshold.');
  if (report.scriptCoverage < (thresholds.scriptCoverage ?? 0.8)) reasons.push('Script coverage is below threshold.');
  if (report.successRate < (thresholds.successRate ?? 0.95)) reasons.push('Success rate is below threshold.');
  return { decision: reasons.length ? 'failed' : 'passed', reasons };
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 1;
  return Math.max(0, Math.min(1, numerator / denominator));
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
