import * as fs from 'fs';
import * as path from 'path';
import { RunPaths } from '../../../runtime/paths.js';
import {
  BranchSummary,
  CrossAppFinding,
  CrossAppReviewResult,
  PipelineGraphState,
  PipelineGraphStatePatch,
} from './state.js';

export interface CrossAppReviewRun {
  result: CrossAppReviewResult;
  summaries: BranchSummary[];
  artifactPaths: string[];
}

export interface CrossAppDeliveryMetadata {
  runId: string;
  generatedAt: number;
  branches: Array<{
    branchId: string;
    projectName: string;
    status: string;
    summaryPath?: string;
    tracks?: BranchSummary['tracks'];
    openSpec?: BranchSummary['openSpec'];
    changedFiles: string[];
    testStatus: string;
  }>;
  reviews: {
    code?: CrossAppReviewResult;
    integration?: CrossAppReviewResult;
  };
  deliveryStatus: 'ready' | 'blocked';
  blockingFindings: CrossAppFinding[];
}

export function runCrossAppCodeReview(args: {
  paths: RunPaths;
  state: PipelineGraphState;
  nodeId?: string;
}): CrossAppReviewRun {
  const summaries = readBranchSummaries(args.paths, args.state);
  const findings = [
    ...findDependencyConflictFindings(summaries),
    ...findPublicApiConflictFindings(summaries),
    ...findDatabaseConflictFindings(summaries),
    ...findRiskNoteFindings(summaries, 'code'),
  ];
  const result = buildReviewResult(args.state, summaries, findings, 'app-code-impl');
  const artifactPaths = writeReviewArtifacts(
    args.paths,
    args.nodeId ?? 'cross-app-test',
    'code-review',
    result,
    summaries
  );
  return { result, summaries, artifactPaths };
}

export function runCrossAppIntegrationReview(args: {
  paths: RunPaths;
  state: PipelineGraphState;
  codeReview?: CrossAppReviewResult;
  nodeId?: string;
}): CrossAppReviewRun {
  const summaries = readBranchSummaries(args.paths, args.state);
  const findings = [
    ...findFailedTestFindings(summaries),
    ...findRequiredCheckFindings(summaries),
    ...findRiskNoteFindings(summaries, 'integration'),
    ...(args.codeReview?.findings ?? []).filter(finding => finding.severity === 'blocking'),
  ];
  const result = buildReviewResult(args.state, summaries, findings, 'app-integration-test');
  const artifactPaths = writeReviewArtifacts(
    args.paths,
    args.nodeId ?? 'cross-app-test',
    'integration-review',
    result,
    summaries
  );
  return { result, summaries, artifactPaths };
}

export function createAffectedBranchRollbackPatch(args: {
  state: PipelineGraphState;
  review: CrossAppReviewResult;
  sourceNodeId: string;
  defaultTargetNodeId?: string;
  reason?: string;
}): PipelineGraphStatePatch {
  const targetByBranch = Object.fromEntries(
    args.review.requiredFixes.map(fix => [fix.branchId, fix.targetNodeId])
  );
  const affectedBranchIds = unique([
    ...args.review.affectedBranches,
    ...args.review.requiredFixes.map(fix => fix.branchId),
  ]).filter(branchId => Boolean(args.state.branches[branchId]));
  const defaultTarget = args.defaultTargetNodeId ?? 'app-code-impl';
  const affectedProjects = affectedBranchIds.map(
    branchId => args.state.branches[branchId]?.projectName ?? branchId
  );

  return {
    rollback: {
      active: affectedBranchIds.length > 0,
      sourceNodeId: args.sourceNodeId,
      targetNodeId: defaultTarget,
      affectedProjects,
      affectedBranchIds,
      targetNodeIdByBranch: Object.fromEntries(
        affectedBranchIds.map(branchId => [branchId, targetByBranch[branchId] ?? defaultTarget])
      ),
      reason: args.reason ?? 'Cross-application review blocked affected branches.',
      category: 'cross_app_review',
      startedAt: Date.now(),
      attempt: (args.state.retry.crossAppReviewBlockCount ?? 0) + 1,
    },
    branches: Object.fromEntries(affectedBranchIds.map(branchId => {
      const targetNodeId = targetByBranch[branchId] ?? defaultTarget;
      return [branchId, {
        status: 'waiting_fix' as const,
        currentNodeId: targetNodeId,
        retry: {
          ...args.state.branches[branchId].retry,
          crossAppReviewBlockCount: (args.state.branches[branchId].retry.crossAppReviewBlockCount ?? 0) + 1,
        },
        nodes: {
          [targetNodeId]: {
            id: targetNodeId,
            status: 'pending' as const,
            failureCount: args.state.branches[branchId].nodes[targetNodeId]?.failureCount ?? 0,
          },
        },
      }];
    })),
    projects: args.state.projects.map(project => {
      if (!affectedProjects.includes(project.name)) return project;
      return {
        ...project,
        status: 'waiting_fix',
        currentNodeId: targetByBranch[project.branchId ?? ''] ?? defaultTarget,
        retry: {
          ...project.retry,
          crossAppReviewBlockCount: (project.retry.crossAppReviewBlockCount ?? 0) + 1,
        },
      };
    }),
    retry: {
      crossAppReviewBlockCount: (args.state.retry.crossAppReviewBlockCount ?? 0) + 1,
    },
  };
}

export function createMainWorkflowRollbackPatch(args: {
  state: PipelineGraphState;
  review: CrossAppReviewResult;
  sourceNodeId: string;
  targetNodeId?: string;
  reason?: string;
}): PipelineGraphStatePatch | null {
  if (!hasPlanningLevelFinding(args.review)) return null;

  const targetNodeId = args.targetNodeId ?? 'implementation-plan';
  const affectedBranchIds = args.state.branchOrder.filter(branchId => Boolean(args.state.branches[branchId]));
  const affectedProjects = affectedBranchIds.map(
    branchId => args.state.branches[branchId]?.projectName ?? branchId
  );

  return {
    rollback: {
      active: true,
      sourceNodeId: args.sourceNodeId,
      targetNodeId,
      affectedProjects,
      affectedBranchIds,
      reason: args.reason ?? 'Cross-application review found a planning-level issue.',
      category: 'cross_app_planning',
      startedAt: Date.now(),
      attempt: (args.state.retry.crossAppReviewBlockCount ?? 0) + 1,
    },
    currentNodeId: targetNodeId,
    branches: Object.fromEntries(affectedBranchIds.map(branchId => [
      branchId,
      {
        status: 'pending' as const,
        currentNodeId: undefined,
        error: 'Invalidated by main workflow rollback.',
        nodes: resetBranchNodes(args.state.branches[branchId]),
      },
    ])),
    projects: args.state.projects.map(project => affectedProjects.includes(project.name)
      ? { ...project, status: 'pending', currentNodeId: targetNodeId }
      : project),
    retry: {
      crossAppReviewBlockCount: (args.state.retry.crossAppReviewBlockCount ?? 0) + 1,
    },
  };
}

export function writeCrossAppDeliveryMetadata(args: {
  paths: RunPaths;
  state: PipelineGraphState;
  codeReview?: CrossAppReviewResult;
  integrationReview?: CrossAppReviewResult;
}): { metadata: CrossAppDeliveryMetadata; artifactPath: string } {
  const summaries = readBranchSummaries(args.paths, args.state);
  const blockingFindings = [
    ...(args.codeReview?.findings ?? []),
    ...(args.integrationReview?.findings ?? []),
  ].filter(finding => finding.severity === 'blocking');
  const metadata: CrossAppDeliveryMetadata = {
    runId: args.state.runId,
    generatedAt: Date.now(),
    branches: args.state.branchOrder.map(branchId => {
      const branch = args.state.branches[branchId];
      const summary = summaries.find(item => item.branchId === branchId);
      return {
        branchId,
        projectName: branch?.projectName ?? summary?.projectName ?? branchId,
        status: branch?.status ?? 'pending',
        summaryPath: findBranchSummaryArtifactPath(args.state, branchId),
        tracks: summary?.tracks,
        openSpec: summary?.openSpec,
        changedFiles: summary?.changedFiles ?? [],
        testStatus: summary?.testResults.status ?? 'skipped',
      };
    }),
    reviews: {
      code: args.codeReview,
      integration: args.integrationReview,
    },
    deliveryStatus: blockingFindings.length ? 'blocked' : 'ready',
    blockingFindings,
  };
  const relativePath = 'cross-app/delivery-metadata.json';
  writeJson(args.paths, relativePath, metadata);
  return {
    metadata,
    artifactPath: `artifacts/${relativePath}`,
  };
}

export function readBranchSummaries(
  paths: RunPaths,
  state: PipelineGraphState
): BranchSummary[] {
  const summaryPaths = unique([
    ...state.branchOrder.flatMap(branchId =>
      Object.values(state.branches[branchId]?.artifactIndex ?? {}).flat()
    ),
    ...Object.values(state.artifactIndex).flat(),
  ])
    .filter(artifactPath => artifactPath.endsWith('/branch-summary.json') || artifactPath.endsWith('branch-summary.json'));

  const summaries = summaryPaths
    .map(artifactPath => readJsonArtifact<BranchSummary>(paths, artifactPath))
    .filter((summary): summary is BranchSummary => Boolean(summary?.branchId && summary.projectName));

  return summaries.length ? summaries : readBranchSummariesFromArtifactDirs(paths);
}

function buildReviewResult(
  state: PipelineGraphState,
  summaries: BranchSummary[],
  findings: CrossAppFinding[],
  defaultTargetNodeId: string
): CrossAppReviewResult {
  const blockingFindings = findings.filter(finding => finding.severity === 'blocking');
  const affectedBranches = unique(blockingFindings.flatMap(finding => finding.affectedBranches));
  return {
    status: blockingFindings.length ? 'blocked' : 'approved',
    findings,
    affectedBranches,
    requiredFixes: affectedBranches.map(branchId => {
      const branch = state.branches[branchId];
      const summary = summaries.find(item => item.branchId === branchId);
      return {
        branchId,
        projectName: branch?.projectName ?? summary?.projectName ?? branchId,
        targetNodeId: defaultTargetNodeId,
        feedback: findings
          .filter(finding => finding.severity === 'blocking' && finding.affectedBranches.includes(branchId))
          .map(finding => finding.message)
          .join('\n'),
      };
    }),
  };
}

function findDependencyConflictFindings(summaries: BranchSummary[]): CrossAppFinding[] {
  const byDependency = groupBy(
    summaries.flatMap(summary => summary.dependencyChanges.map(change => ({
      summary,
      key: change.name,
      version: change.toVersion ?? 'unknown',
    }))),
    item => item.key
  );
  return Object.entries(byDependency).flatMap(([dependencyName, items]) => {
    const versions = unique(items.map(item => item.version));
    if (versions.length <= 1) return [];
    return [{
      id: `dependency-${slug(dependencyName)}`,
      severity: 'blocking' as const,
      category: 'dependency' as const,
      message: `Dependency '${dependencyName}' resolves to multiple versions across branches: ${versions.join(', ')}.`,
      affectedBranches: unique(items.map(item => item.summary.branchId)),
    }];
  });
}

function findPublicApiConflictFindings(summaries: BranchSummary[]): CrossAppFinding[] {
  const byApi = groupBy(
    summaries.flatMap(summary => summary.publicApiChanges
      .filter(change => change.path || change.symbol)
      .map(change => ({
        summary,
        key: `${change.method ?? ''} ${change.path ?? change.symbol ?? ''}`.trim(),
        description: change.description,
      }))),
    item => item.key
  );
  return Object.entries(byApi).flatMap(([apiKey, items]) => {
    const descriptions = unique(items.map(item => item.description.trim()).filter(Boolean));
    if (items.length <= 1 || descriptions.length <= 1) return [];
    return [{
      id: `api-${slug(apiKey)}`,
      severity: 'blocking' as const,
      category: 'api' as const,
      message: `Public API '${apiKey}' has inconsistent descriptions across branches.`,
      affectedBranches: unique(items.map(item => item.summary.branchId)),
    }];
  });
}

function findDatabaseConflictFindings(summaries: BranchSummary[]): CrossAppFinding[] {
  const byObject = groupBy(
    summaries.flatMap(summary => summary.databaseChanges.map(change => ({
      summary,
      key: change.objectName,
      changeType: change.changeType,
    }))),
    item => item.key
  );
  return Object.entries(byObject).flatMap(([objectName, items]) => {
    const changeTypes = unique(items.map(item => item.changeType));
    if (items.length <= 1 || changeTypes.length <= 1) return [];
    return [{
      id: `database-${slug(objectName)}`,
      severity: 'blocking' as const,
      category: 'database' as const,
      message: `Database object '${objectName}' has conflicting change types: ${changeTypes.join(', ')}.`,
      affectedBranches: unique(items.map(item => item.summary.branchId)),
    }];
  });
}

function findFailedTestFindings(summaries: BranchSummary[]): CrossAppFinding[] {
  const unitFindings = summaries
    .filter(summary => summary.testResults.status === 'failed')
    .map(summary => ({
      id: `test-${slug(summary.branchId)}`,
      severity: 'blocking' as const,
      category: 'other' as const,
      message: `${summary.projectName} has failed branch tests and cannot pass cross-app integration review.`,
      affectedBranches: [summary.branchId],
    }));
  const e2eFindings = summaries
    .filter(summary => summary.e2eVerification?.status === 'failed')
    .map(summary => ({
      id: `e2e-${slug(summary.branchId)}`,
      severity: 'blocking' as const,
      category: inferFindingCategory(summary.e2eVerification?.failureClassification ?? 'integration'),
      message: `${summary.projectName} E2E verification failed (${summary.e2eVerification?.failureClassification ?? 'unclassified'}).`,
      affectedBranches: [summary.branchId],
    }));
  return [...unitFindings, ...e2eFindings];
}

function findRequiredCheckFindings(summaries: BranchSummary[]): CrossAppFinding[] {
  return summaries.flatMap(summary => summary.requiredCrossAppChecks.map((check, index) => ({
    id: `required-check-${slug(summary.branchId)}-${index + 1}`,
    severity: blockingText(check) ? 'blocking' as const : 'medium' as const,
    category: inferFindingCategory(check),
    message: `${summary.projectName}: ${check}`,
    affectedBranches: [summary.branchId],
  })));
}

function findRiskNoteFindings(
  summaries: BranchSummary[],
  reviewKind: 'code' | 'integration'
): CrossAppFinding[] {
  return summaries.flatMap(summary => summary.riskNotes
    .filter(note => blockingText(note) || /cross[- ]?app|integration|contract|兼容|联调|集成/i.test(note))
    .map((note, index) => ({
      id: `${reviewKind}-risk-${slug(summary.branchId)}-${index + 1}`,
      severity: blockingText(note) ? 'blocking' as const : 'medium' as const,
      category: inferFindingCategory(note),
      message: `${summary.projectName}: ${note}`,
      affectedBranches: [summary.branchId],
    })));
}

function hasPlanningLevelFinding(review: CrossAppReviewResult): boolean {
  return review.findings.some(finding =>
    finding.severity === 'blocking' &&
    (finding.category === 'release' || finding.category === 'other') &&
    /planning|requirement|decomposition|prd|mrd|需求|方案|拆解|计划/i.test(finding.message)
  );
}

function resetBranchNodes(branch: PipelineGraphState['branches'][string] | undefined) {
  if (!branch) return {};
  return Object.fromEntries(Object.entries(branch.nodes).map(([nodeId, node]) => [
    nodeId,
    {
      ...node,
      status: 'pending' as const,
      startedAt: undefined,
      completedAt: undefined,
      error: undefined,
    },
  ]));
}

function writeReviewArtifacts(
  paths: RunPaths,
  nodeId: string,
  kind: 'code-review' | 'integration-review',
  result: CrossAppReviewResult,
  summaries: BranchSummary[]
): string[] {
  const jsonPath = `cross-app/${kind}-findings.json`;
  const markdownPath = `cross-app/${kind}.md`;
  writeJson(paths, jsonPath, {
    nodeId,
    result,
    summaryCount: summaries.length,
  });
  writeText(paths, markdownPath, renderReviewMarkdown(kind, result, summaries));
  return [`artifacts/${jsonPath}`, `artifacts/${markdownPath}`];
}

function renderReviewMarkdown(
  kind: string,
  result: CrossAppReviewResult,
  summaries: BranchSummary[]
): string {
  const lines = [
    `# Cross-App ${kind}`,
    '',
    `- Status: ${result.status}`,
    `- Branch summaries: ${summaries.length}`,
    `- Findings: ${result.findings.length}`,
    '',
    '## Findings',
  ];
  if (!result.findings.length) {
    lines.push('- No cross-application findings.');
  } else {
    for (const finding of result.findings) {
      lines.push(`- [${finding.severity}] ${finding.category}: ${finding.message} (branches: ${finding.affectedBranches.join(', ')})`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function readBranchSummariesFromArtifactDirs(paths: RunPaths): BranchSummary[] {
  if (!fs.existsSync(paths.artifactsDir)) return [];
  return fs.readdirSync(paths.artifactsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(entry.name, 'branch-summary.json'))
    .map(relativePath => readJsonArtifact<BranchSummary>(paths, `artifacts/${relativePath}`))
    .filter((summary): summary is BranchSummary => Boolean(summary?.branchId && summary.projectName));
}

function findBranchSummaryArtifactPath(state: PipelineGraphState, branchId: string): string | undefined {
  const branch = state.branches[branchId];
  return Object.values(branch?.artifactIndex ?? {}).flat()
    .find(artifactPath => artifactPath.endsWith('branch-summary.json'));
}

function readJsonArtifact<T>(paths: RunPaths, artifactPath: string): T | null {
  const normalized = artifactPath.startsWith('artifacts/')
    ? artifactPath.slice('artifacts/'.length)
    : artifactPath;
  const absolutePath = path.join(paths.artifactsDir, normalized);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJson(paths: RunPaths, relativePath: string, value: unknown): void {
  writeText(paths, relativePath, JSON.stringify(value, null, 2));
}

function writeText(paths: RunPaths, relativePath: string, content: string): void {
  const absolutePath = path.join(paths.artifactsDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf-8');
}

function groupBy<T>(
  items: T[],
  keyFor: (item: T) => string
): Record<string, T[]> {
  const grouped: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFor(item);
    grouped[key] = grouped[key] ?? [];
    grouped[key].push(item);
  }
  return grouped;
}

function blockingText(value: string): boolean {
  return /block|blocking|must fix|conflict|mismatch|阻断|必须修复|冲突|不兼容/i.test(value);
}

function inferFindingCategory(value: string): CrossAppFinding['category'] {
  if (/api|interface|endpoint|contract|接口|契约/i.test(value)) return 'api';
  if (/dto|schema|字段/i.test(value)) return 'dto';
  if (/database|table|sql|db|数据库|表/i.test(value)) return 'database';
  if (/config|配置/i.test(value)) return 'config';
  if (/dependency|version|依赖|版本/i.test(value)) return 'dependency';
  if (/release|deploy|order|发布|上线|顺序/i.test(value)) return 'release';
  return 'other';
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'item';
}
