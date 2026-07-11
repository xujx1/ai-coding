import * as fs from 'fs';
import * as path from 'path';
import type { RunPaths } from '../runtime/paths.js';
import type { ArchiveRef, ArtifactRef, LifecycleState } from './types.js';
import type { KnowledgeDelta } from './knowledge.js';
import { registerArtifact } from './artifacts.js';

export interface ArchiveReadiness {
  ready: boolean;
  missing: string[];
  warnings: string[];
}

export interface KnowledgeDeltaApplicationResult {
  applied: KnowledgeDelta[];
  reviewRequired: KnowledgeDelta[];
}

export function checkArchiveReadiness(state: LifecycleState): ArchiveReadiness {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (state.approvals.some(gate => gate.status === 'waiting')) missing.push('waiting approvals');
  if (state.deploymentSets.length === 0) missing.push('deployment set');
  if (state.testRuns.length === 0) missing.push('test run');
  if (state.artifacts.length === 0) missing.push('artifact refs');
  const failedTestRuns = state.testRuns.filter(testRun => testRun.status === 'failed');
  if (failedTestRuns.length && state.diagnoses.length === 0) missing.push('diagnosis for failed test runs');
  if (failedTestRuns.length && state.fixCycles.length === 0) warnings.push('failed test runs exist without fix cycles');
  if (!state.testRuns.some(testRun => testRun.status === 'passed')) warnings.push('no passed test run recorded');
  return {
    ready: missing.length === 0,
    missing,
    warnings,
  };
}

export function generateArchiveReport(state: LifecycleState, readiness = checkArchiveReadiness(state)): string {
  return [
    '# Lifecycle Archive Report',
    '',
    `Requirement: ${state.requirementId}`,
    `Run: ${state.runId}`,
    `Phase: ${state.phase}`,
    `Status: ${state.status}`,
    '',
    '## Readiness',
    `Ready: ${readiness.ready}`,
    ...readiness.missing.map(item => `- Missing: ${item}`),
    ...readiness.warnings.map(item => `- Warning: ${item}`),
    '',
    '## Deployment Sets',
    ...state.deploymentSets.map(set => `- ${set.deploymentSetId} v${set.version}: ${set.appIds.join(', ')}`),
    '',
    '## Test Runs',
    ...state.testRuns.map(testRun => `- ${testRun.testRunId}: ${testRun.status} (${testRun.deploymentSetId})`),
    '',
    '## Diagnoses',
    ...state.diagnoses.map(diagnosis => `- ${diagnosis.diagnosisId}: ${diagnosis.category} confidence=${diagnosis.confidence}`),
    '',
    '## Fix Cycles',
    ...state.fixCycles.map(cycle => `- ${cycle.fixCycleId}: ${cycle.status} ${cycle.fixType}`),
    '',
    '## Approvals',
    ...state.approvals.map(gate => `- ${gate.approvalGateId}: ${gate.gateType} ${gate.status}`),
    '',
    '## Artifacts',
    ...state.artifacts.map(artifact => `- ${artifact.artifactId}: ${artifact.type} ${artifact.path ?? artifact.uri ?? ''}`),
  ].join('\n');
}

export function applyKnowledgeDeltas(deltas: KnowledgeDelta[]): KnowledgeDeltaApplicationResult {
  return {
    applied: deltas.filter(delta => delta.risk === 'low'),
    reviewRequired: deltas.filter(delta => delta.risk !== 'low'),
  };
}

export function recordArchive(args: {
  paths: RunPaths;
  state: LifecycleState;
  report: string;
  knowledgeDeltaRefs?: ArtifactRef[];
  archivedAt?: number;
}): ArchiveRef {
  const archiveDir = path.join(args.paths.artifactsDir, 'archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  const reportPath = path.join(archiveDir, 'archive-report.md');
  fs.writeFileSync(reportPath, args.report, 'utf-8');
  const reportRef = registerArtifact(args.state, {
    type: 'archive-report',
    path: 'artifacts/archive/archive-report.md',
    sourceType: 'workflow',
    summary: 'Lifecycle archive report',
  });
  const archive: ArchiveRef = {
    archiveId: `archive-${args.state.runId}`,
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    reportArtifactId: reportRef.artifactId,
    knowledgeDeltaArtifactIds: args.knowledgeDeltaRefs?.map(ref => ref.artifactId) ?? [],
    archivedAt: args.archivedAt ?? Date.now(),
  };
  args.state.archive = archive;
  args.state.phase = 'completed';
  args.state.status = 'completed';
  return archive;
}

