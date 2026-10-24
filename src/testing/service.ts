import type { ArtifactRef, LifecycleState, TestRunRef } from '../lifecycle/types.js';
import { recordTestingRun, type TestingArtifactType } from '../lifecycle/testingArtifacts.js';
import { loadLifecycleState, saveLifecycleState } from '../lifecycle/store.js';
import { ensureRunDirectories, type RunPaths } from '../runtime/paths.js';
import {
  createTestingWorkflowRuntime,
  type ResumeTestingWorkflowInput,
  type StartTestingWorkflowInput,
  type TestingWorkflowRuntime,
  type TestingWorkflowRuntimeState,
} from '../workflows/runtime/testing/index.js';
import type { TestingArtifact } from './artifacts.js';
import {
  TestingArtifactRepository,
  type SavedTestingArtifact,
} from './repository.js';
import type { LifecycleStatePersistence } from '../storage/lifecycleStatePersistence.js';

export interface TestingServiceContext {
  repository?: TestingArtifactRepository;
  runtime?: TestingWorkflowRuntime;
  pathsForRun?: (runId: string) => RunPaths;
  loadState?: (runId: string) => LifecycleState | null;
  saveState?: (state: LifecycleState) => LifecycleState;
  lifecyclePersistence?: LifecycleStatePersistence;
}

export interface TestingArtifactQuery {
  runId: string;
  type?: TestingArtifactType;
  workflowInstanceId?: string;
  testRunId?: string;
}

export class TestingService {
  private readonly repository: TestingArtifactRepository;
  private readonly runtime: TestingWorkflowRuntime;
  private readonly pathsForRun: (runId: string) => RunPaths;
  private readonly loadState: (runId: string) => LifecycleState | null;
  private readonly saveState: (state: LifecycleState) => LifecycleState;
  private readonly lifecyclePersistence?: LifecycleStatePersistence;

  constructor(context: TestingServiceContext = {}) {
    this.repository = context.repository ?? new TestingArtifactRepository();
    this.runtime = context.runtime ?? createTestingWorkflowRuntime();
    this.pathsForRun = context.pathsForRun ?? ensureRunDirectories;
    this.loadState = context.loadState ?? loadLifecycleState;
    this.saveState = context.saveState ?? saveLifecycleState;
    this.lifecyclePersistence = context.lifecyclePersistence;
  }

  async startWorkflow(input: StartTestingWorkflowInput) {
    return this.runtime.start(input);
  }

  async resumeWorkflow(input: ResumeTestingWorkflowInput) {
    return this.runtime.resume(input);
  }

  getWorkflowStatus(runId: string, workflowInstanceId: string): TestingWorkflowRuntimeState {
    return this.runtime.status(runId, workflowInstanceId);
  }

  async getWorkflowStatusAsync(runId: string, workflowInstanceId: string): Promise<TestingWorkflowRuntimeState> {
    return this.runtime.statusAsync(runId, workflowInstanceId);
  }

  getDashboard(runId: string, workflowInstanceId?: string): {
    lifecycle: Pick<LifecycleState, 'requirementId' | 'runId' | 'phase' | 'status' | 'deploymentSets' | 'environments' | 'testRuns'>;
    workflow?: TestingWorkflowRuntimeState;
    artifacts: ArtifactRef[];
    executionReports: ArtifactRef[];
    coverageReports: ArtifactRef[];
    triage: ArtifactRef[];
    regressionPlans: ArtifactRef[];
  } {
    const state = this.requireState(runId);
    const artifacts = this.repository.list(state);
    const workflow = workflowInstanceId ? this.runtime.status(runId, workflowInstanceId) : undefined;
    return {
      lifecycle: {
        requirementId: state.requirementId,
        runId: state.runId,
        phase: state.phase,
        status: state.status,
        deploymentSets: state.deploymentSets,
        environments: state.environments,
        testRuns: state.testRuns,
      },
      workflow,
      artifacts,
      executionReports: artifacts.filter(ref => ref.type === 'testing-execution-report'),
      coverageReports: artifacts.filter(ref => ref.type === 'testing-coverage-report'),
      triage: artifacts.filter(ref => ref.type === 'testing-failure-triage'),
      regressionPlans: artifacts.filter(ref => ref.type === 'testing-regression-plan'),
    };
  }

  async getDashboardAsync(runId: string, workflowInstanceId?: string): Promise<ReturnType<TestingService['getDashboard']>> {
    const state = await this.requireStateAsync(runId);
    const artifacts = this.repository.list(state);
    const workflow = workflowInstanceId ? await this.runtime.statusAsync(runId, workflowInstanceId) : undefined;
    return {
      lifecycle: {
        requirementId: state.requirementId,
        runId: state.runId,
        phase: state.phase,
        status: state.status,
        deploymentSets: state.deploymentSets,
        environments: state.environments,
        testRuns: state.testRuns,
      },
      workflow,
      artifacts,
      executionReports: artifacts.filter(ref => ref.type === 'testing-execution-report'),
      coverageReports: artifacts.filter(ref => ref.type === 'testing-coverage-report'),
      triage: artifacts.filter(ref => ref.type === 'testing-failure-triage'),
      regressionPlans: artifacts.filter(ref => ref.type === 'testing-regression-plan'),
    };
  }

  getExecutionReport(runId: string, artifactId: string): SavedTestingArtifact {
    const saved = this.getArtifact(runId, artifactId);
    if (saved.ref.type !== 'testing-execution-report') {
      throw new Error(`Testing artifact ${artifactId} is not an execution report`);
    }
    return saved;
  }

  async getExecutionReportAsync(runId: string, artifactId: string): Promise<SavedTestingArtifact> {
    const saved = await this.getArtifactAsync(runId, artifactId);
    if (saved.ref.type !== 'testing-execution-report') {
      throw new Error(`Testing artifact ${artifactId} is not an execution report`);
    }
    return saved;
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

  async getArtifactAsync<T extends TestingArtifact = TestingArtifact>(runId: string, artifactId: string): Promise<SavedTestingArtifact<T>> {
    const state = await this.requireStateAsync(runId);
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

  async listArtifactsAsync(query: TestingArtifactQuery): Promise<ArtifactRef[]> {
    const state = await this.requireStateAsync(query.runId);
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

  private async requireStateAsync(runId: string): Promise<LifecycleState> {
    if (this.lifecyclePersistence) {
      const state = await this.lifecyclePersistence.load(runId);
      if (state) return state;
      throw new Error(`Lifecycle state does not exist for run ${runId}`);
    }
    return this.requireState(runId);
  }
}

export function createTestingService(context?: TestingServiceContext): TestingService {
  return new TestingService(context);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
