import type { ArtifactRef, LifecycleState, TestRunRef } from '../lifecycle/types.js';
import { recordTestingRun, type TestingArtifactType } from '../lifecycle/testingArtifacts.js';
import { loadLifecycleState, saveLifecycleState } from '../lifecycle/store.js';
import { ensureRunDirectories, type RunPaths } from '../runtime/paths.js';
import type { TestingArtifact } from './artifacts.js';
import {
  TestingArtifactRepository,
  type SavedTestingArtifact,
} from './repository.js';

export interface TestingServiceContext {
  repository?: TestingArtifactRepository;
  pathsForRun?: (runId: string) => RunPaths;
  loadState?: (runId: string) => LifecycleState | null;
  saveState?: (state: LifecycleState) => LifecycleState;
}

export interface TestingArtifactQuery {
  runId: string;
  type?: TestingArtifactType;
  workflowInstanceId?: string;
  testRunId?: string;
}

export class TestingService {
  private readonly repository: TestingArtifactRepository;
  private readonly pathsForRun: (runId: string) => RunPaths;
  private readonly loadState: (runId: string) => LifecycleState | null;
  private readonly saveState: (state: LifecycleState) => LifecycleState;

  constructor(context: TestingServiceContext = {}) {
    this.repository = context.repository ?? new TestingArtifactRepository();
    this.pathsForRun = context.pathsForRun ?? ensureRunDirectories;
    this.loadState = context.loadState ?? loadLifecycleState;
    this.saveState = context.saveState ?? saveLifecycleState;
  }

  createArtifact<T extends TestingArtifact>(args: {
    artifact: T;
    summary?: string;
    artifactId?: string;
  }): SavedTestingArtifact<T> {
    const state = this.requireState(args.artifact.runId);
    const paths = this.pathsForRun(args.artifact.runId);
    const saved = this.repository.save({
      paths,
      state,
      artifact: args.artifact,
      summary: args.summary,
      artifactId: args.artifactId,
    });
    this.saveState(state);
    return saved;
  }

  getArtifact<T extends TestingArtifact = TestingArtifact>(runId: string, artifactId: string): SavedTestingArtifact<T> {
    const state = this.requireState(runId);
    const paths = this.pathsForRun(runId);
    const ref = this.repository.findById(state, artifactId);
    if (!ref) {
      throw new Error(`Testing artifact ${artifactId} was not found for run ${runId}`);
    }
    return this.repository.read<T>(paths, ref);
  }

  listArtifacts(query: TestingArtifactQuery): ArtifactRef[] {
    const state = this.requireState(query.runId);
    return this.repository.list(state, query);
  }

  linkArtifactToTestRun(args: {
    runId: string;
    testRunId: string;
    artifactIds: string[];
    evidenceArtifactIds?: string[];
  }): TestRunRef {
    const state = this.requireState(args.runId);
    const existing = state.testRuns.find(testRun => testRun.testRunId === args.testRunId);
    if (!existing) {
      throw new Error(`Test run ${args.testRunId} was not found for run ${args.runId}`);
    }
    const updated: TestRunRef = {
      ...existing,
      artifactIds: unique([...existing.artifactIds, ...args.artifactIds]),
      evidenceArtifactIds: unique([...existing.evidenceArtifactIds, ...(args.evidenceArtifactIds ?? [])]),
    };
    state.testRuns = [
      ...state.testRuns.filter(testRun => testRun.testRunId !== args.testRunId),
      updated,
    ];
    this.saveState(state);
    return updated;
  }

  recordTerminalTestRun(args: {
    runId: string;
    testRunId: string;
    deploymentSetId: string;
    environmentId: string;
    status: Extract<TestRunRef['status'], 'passed' | 'failed' | 'cancelled' | 'skipped'>;
    artifactIds?: string[];
    evidenceArtifactIds?: string[];
  }): TestRunRef {
    const state = this.requireState(args.runId);
    const testRun = recordTestingRun({
      state,
      testRunId: args.testRunId,
      deploymentSetId: args.deploymentSetId,
      environmentId: args.environmentId,
      status: args.status,
      artifactIds: args.artifactIds,
      evidenceArtifactIds: args.evidenceArtifactIds,
    });
    this.saveState(state);
    return testRun;
  }

  private requireState(runId: string): LifecycleState {
    const state = this.loadState(runId);
    if (!state) {
      throw new Error(`Lifecycle state does not exist for run ${runId}`);
    }
    return state;
  }
}

export function createTestingService(context?: TestingServiceContext): TestingService {
  return new TestingService(context);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
