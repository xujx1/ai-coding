import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_TESTING_AGENTS,
  type TestingAgents,
} from '../../../agents/testing/index.js';
import {
  loadLifecycleState,
  saveLifecycleState,
} from '../../../lifecycle/store.js';
import {
  registerTestingArtifact,
  recordTestingRun,
} from '../../../lifecycle/testingArtifacts.js';
import type {
  ArtifactRef,
  LifecycleState,
} from '../../../lifecycle/types.js';
import { validateTestingArtifact } from '../../../lifecycle/testingArtifactSchemas.js';
import type {
  ExecutionReport,
  GeneratedScript,
  TestCase,
} from '../../../lifecycle/testingArtifactSchemas.js';
import {
  type AnyTestingWorkflowArtifact,
  type ResumeTestingWorkflowInput,
  type StartTestingWorkflowInput,
  type TestingReviewGate,
  type TestingWorkflowContext,
  type TestingWorkflowNodeState,
  type TestingWorkflowRunResult,
  type TestingWorkflowRuntimeState,
} from './testingWorkflowTypes.js';
import {
  TESTING_WORKFLOW_ID,
  TESTING_WORKFLOW_NODES,
  type TestingWorkflowNodeId,
} from '../../definitions/testing/testingWorkflowDefinition.js';
import { ensureRunDirectories, getRunPaths, type RunPaths } from '../../../runtime/paths.js';
import {
  calculateTestingMetrics,
  evaluateQualityGate,
  executePytestScript,
  parsePytestOutput,
  runTestingCommand,
} from '../../../tools/testing/index.js';
import { InMemoryTestingRepositoryResolver, type TestingRepository, type TestingRepositoryResolver } from '../../../platform-sources/testingRepositoryResolver.js';
import type { NodeLeaseExecutor } from '../../../storage/nodeLeaseExecutor.js';
import type { LifecycleStatePersistence } from '../../../storage/lifecycleStatePersistence.js';
import type { Lease } from '../../../storage/contracts/leaseRepository.js';
import type { ArtifactObject } from '../../../storage/contracts/artifactStore.js';
import type { FencedRuntimeTransitionCommitter } from '../../../storage/runtimeNodeTransition.js';
import type { PipelineArtifactWriter } from '../../../storage/pipelineArtifactWriter.js';

export interface TestingWorkflowRuntimeOptions {
  agents?: TestingAgents;
  repositoryResolver?: TestingRepositoryResolver;
  nodeLeaseExecutor?: NodeLeaseExecutor;
  lifecyclePersistence?: LifecycleStatePersistence;
  transitionCommitter?: FencedRuntimeTransitionCommitter;
  artifactWriter?: PipelineArtifactWriter;
}

export class TestingWorkflowRuntime {
  private readonly agents: TestingAgents;
  private readonly repositoryResolver: TestingRepositoryResolver;
  private readonly nodeLeaseExecutor?: NodeLeaseExecutor;
  private readonly lifecyclePersistence?: LifecycleStatePersistence;
  private readonly transitionCommitter?: FencedRuntimeTransitionCommitter;
  private readonly artifactWriter?: PipelineArtifactWriter;

  constructor(options: TestingWorkflowRuntimeOptions = {}) {
    this.agents = options.agents ?? DEFAULT_TESTING_AGENTS;
    this.repositoryResolver = options.repositoryResolver ?? new InMemoryTestingRepositoryResolver();
    this.nodeLeaseExecutor = options.nodeLeaseExecutor;
    this.lifecyclePersistence = options.lifecyclePersistence;
    this.transitionCommitter = options.transitionCommitter;
    this.artifactWriter = options.artifactWriter;
  }

  async start(input: StartTestingWorkflowInput): Promise<TestingWorkflowRunResult> {
    const lifecycle = await this.loadLifecycle(input.runId);
    const paths = ensureRunDirectories(input.runId);
    const workflowInstanceId = input.workflowInstanceId ?? `testing-${input.runId}`;
    const now = input.now ?? Date.now();
    const existingWorkflow = input.continueExisting === true
      ? await this.loadWorkflowState(input.runId, workflowInstanceId)
      : null;
    let shouldContinue = Boolean(existingWorkflow);
    if (shouldContinue && input.dryRunExecution === false) {
      if (existingWorkflow!.status === 'completed') shouldContinue = false;
    }
    const runtimeState = shouldContinue
      ? existingWorkflow!
      : initialRuntimeState({
          input,
          workflowInstanceId,
          now,
          lifecycle,
        });
    const context: TestingWorkflowContext = shouldContinue
      ? {
          ...rebuildContextFromLifecycle(lifecycle, paths),
          requirementSummary: input.requirementSummary ?? String(lifecycle.metadata?.requirementSummary ?? lifecycle.requirementId),
          appIds: input.appIds?.length ? input.appIds : lifecycle.apps.map(app => app.appId),
          dependencyEdges: input.dependencyEdges ?? [],
        }
      : {
          lifecycle,
          requirementSummary: input.requirementSummary ?? String(lifecycle.metadata?.requirementSummary ?? lifecycle.requirementId),
          appIds: input.appIds?.length ? input.appIds : lifecycle.apps.map(app => app.appId),
          dependencyEdges: input.dependencyEdges ?? [],
          artifacts: {},
          refs: [],
        };
    return this.runUntilStop({
      paths,
      state: runtimeState,
      context,
      autoApproveReviews: input.autoApproveReviews,
      dryRunExecution: input.dryRunExecution === true,
      stopAfterNode: input.stopAfterNode,
    });
  }

  async resume(input: ResumeTestingWorkflowInput): Promise<TestingWorkflowRunResult> {
    const lifecycle = await this.loadLifecycle(input.runId);
    const paths = ensureRunDirectories(input.runId);
    const runtimeState = await this.loadWorkflowState(input.runId, input.workflowInstanceId);
    if (!runtimeState) throw new Error(`Testing workflow state does not exist: ${input.workflowInstanceId}`);
    if (!runtimeState.pendingGate) {
      throw new Error(`Testing workflow ${input.workflowInstanceId} is not waiting for review`);
    }
    if (runtimeState.pendingGate.resumeToken !== input.resumeToken) {
      throw new Error(`Invalid resume token for testing workflow ${input.workflowInstanceId}`);
    }
    const now = input.now ?? Date.now();
    const pendingGate = runtimeState.pendingGate;
    const context = rebuildContextFromLifecycle(lifecycle, paths);
    const applyDecision = async (lease?: Lease) => {
      const gate: TestingReviewGate = {
        ...pendingGate,
        status: input.decision,
        feedback: input.feedback,
        decidedAt: now,
      };
      runtimeState.gates = runtimeState.gates.map(existing => existing.gateId === gate.gateId ? gate : existing);
      runtimeState.pendingGate = undefined;
      runtimeState.updatedAt = now;
      if (input.decision === 'cancelled') {
        runtimeState.status = 'cancelled';
        setNode(runtimeState, gate.nodeId, 'cancelled', gate.artifactIds, 'Review cancelled.', now);
      } else if (input.decision === 'needs_changes') {
        runtimeState.status = 'waiting_review';
        runtimeState.blockedReason = input.feedback ?? 'Reviewer requested changes.';
        setNode(runtimeState, gate.nodeId, 'waiting_review', gate.artifactIds, runtimeState.blockedReason, now);
      } else {
        setNode(runtimeState, gate.nodeId, 'succeeded', gate.artifactIds, 'Review approved.', now);
        const next = TESTING_WORKFLOW_NODES[TESTING_WORKFLOW_NODES.findIndex(node => node.id === gate.nodeId) + 1];
        if (next) runtimeState.currentNodeId = next.id;
      }
      await this.commitVisibleTransition({ paths, state: runtimeState, context }, gate.nodeId, lease, []);
      writeTestingWorkflowState(paths, runtimeState);
    };
    if (this.nodeLeaseExecutor) {
      await this.nodeLeaseExecutor.execute(runtimeState.runId, testingLeaseNodeId(runtimeState, pendingGate.nodeId), applyDecision);
    } else {
      await applyDecision();
    }
    if (!this.transitionCommitter) await this.persistLifecycle(lifecycle);
    if (input.decision !== 'approved') return { state: runtimeState, context };
    return this.runUntilStop({ paths, state: runtimeState, context, autoApproveReviews: input.autoApproveReviews, dryRunExecution: input.dryRunExecution === true });
  }

  status(runId: string, workflowInstanceId: string): TestingWorkflowRuntimeState {
    return loadTestingWorkflowState(runId, workflowInstanceId);
  }

  async statusAsync(runId: string, workflowInstanceId: string): Promise<TestingWorkflowRuntimeState> {
    const state = await this.loadWorkflowState(runId, workflowInstanceId);
    if (!state) throw new Error(`Testing workflow state does not exist: ${workflowInstanceId}`);
    return state;
  }

  async cancel(runId: string, workflowInstanceId: string, now = Date.now()): Promise<TestingWorkflowRuntimeState> {
    const paths = ensureRunDirectories(runId);
    const state = await this.loadWorkflowState(runId, workflowInstanceId);
    if (!state) throw new Error(`Testing workflow state does not exist: ${workflowInstanceId}`);
    const lifecycle = await this.loadLifecycle(runId);
    const context = rebuildContextFromLifecycle(lifecycle, paths);
    const nodeId = state.currentNodeId;
    const cancel = async (lease?: Lease) => {
      state.status = 'cancelled';
      state.pendingGate = undefined;
      state.updatedAt = now;
      setNode(state, nodeId, 'cancelled', [], 'Workflow cancelled.', now);
      await this.commitVisibleTransition({ paths, state, context }, nodeId, lease, []);
      writeTestingWorkflowState(paths, state);
    };
    if (this.nodeLeaseExecutor) {
      await this.nodeLeaseExecutor.execute(runId, testingLeaseNodeId(state, nodeId), cancel);
    } else {
      await cancel();
    }
    if (!this.transitionCommitter) await this.persistLifecycle(lifecycle);
    return state;
  }

  private async runUntilStop(args: {
    paths: RunPaths;
    state: TestingWorkflowRuntimeState;
    context: TestingWorkflowContext;
    autoApproveReviews?: boolean;
    dryRunExecution?: boolean;
    stopAfterNode?: TestingWorkflowNodeId;
  }): Promise<TestingWorkflowRunResult> {
    if (args.state.status === 'completed') {
      return { state: args.state, context: args.context };
    }
    args.state.status = 'running';
    while (args.state.status === 'running') {
      const nodeId = args.state.currentNodeId;
      const node = TESTING_WORKFLOW_NODES.find(candidate => candidate.id === nodeId)!;
      if (node.reviewGate && !args.autoApproveReviews) {
        const pause = async (lease?: Lease) => {
          pauseForReview(args.state, nodeId, latestArtifactIds(args.context), Date.now());
          await this.commitVisibleTransition(args, nodeId, lease, []);
          writeTestingWorkflowState(args.paths, args.state);
        };
        if (this.nodeLeaseExecutor) {
          await this.nodeLeaseExecutor.execute(args.state.runId, testingLeaseNodeId(args.state, nodeId), pause);
        } else {
          await pause();
        }
        if (!this.transitionCommitter) await this.persistLifecycle(args.context.lifecycle);
        return { state: args.state, context: args.context };
      }
      const work = async (lease?: Lease) => {
        const priorArtifactIds = new Set(args.context.lifecycle.artifacts.map(artifact => artifact.artifactId));
        await this.executeNode({ ...args, nodeId, dryRunExecution: args.dryRunExecution === true });
        args.context.refs = args.context.lifecycle.artifacts;
        if (args.state.status === 'running') {
          const next = TESTING_WORKFLOW_NODES[TESTING_WORKFLOW_NODES.findIndex(candidate => candidate.id === nodeId) + 1];
          if (!next) {
            args.state.status = 'completed';
          } else if (args.stopAfterNode === nodeId) {
            args.state.currentNodeId = next.id;
            args.state.status = 'pending';
          } else {
            args.state.currentNodeId = next.id;
          }
        }
        args.state.updatedAt = Date.now();
        const committedArtifacts = await this.prepareTestingArtifacts(args, nodeId, priorArtifactIds);
        await this.commitVisibleTransition(args, nodeId, lease, committedArtifacts);
        writeTestingWorkflowState(args.paths, args.state);
      };
      if (this.nodeLeaseExecutor) {
        await this.nodeLeaseExecutor.execute(args.state.runId, testingLeaseNodeId(args.state, nodeId), work);
      } else {
        await work();
      }
      if (args.state.status !== 'running') break;
    }
    args.state.updatedAt = Date.now();
    writeTestingWorkflowState(args.paths, args.state);
    if (!this.transitionCommitter) await this.persistLifecycle(args.context.lifecycle);
    return { state: args.state, context: args.context };
  }

  private async commitVisibleTransition(
    args: { paths: RunPaths; state: TestingWorkflowRuntimeState; context: TestingWorkflowContext },
    nodeId: TestingWorkflowNodeId,
    lease: Lease | undefined,
    committedArtifacts: ArtifactObject[],
  ): Promise<void> {
    if (!this.transitionCommitter) return;
    if (!lease) throw new Error(`Testing node '${nodeId}' requires a lease for its product-state transition.`);
    const node = args.state.nodes.find(candidate => candidate.nodeId === nodeId);
    const transitionAt = node?.completedAt ?? args.state.updatedAt;
    await this.transitionCommitter.commit({
      runtime: 'testing',
      runId: args.state.runId,
      nodeId: testingLeaseNodeId(args.state, nodeId),
      transitionId: `testing:${args.state.runId}:${args.state.workflowInstanceId}:${nodeId}:${node?.status ?? args.state.status}:${transitionAt}`,
      lease,
      updateRun: current => ({
        ...current,
        updatedAt: Math.max(current.updatedAt, args.state.updatedAt),
        metadata: {
          ...current.metadata,
          testingWorkflows: {
            ...testingWorkflowReadModels(current.metadata),
            [args.state.workflowInstanceId]: structuredClone(args.state),
          },
        },
      }),
      lifecycle: args.context.lifecycle,
      committedArtifacts,
      eventData: {
        workflowInstanceId: args.state.workflowInstanceId,
        status: node?.status ?? args.state.status,
        artifactIds: committedArtifacts.map(artifact => artifact.artifactId),
      },
      timestamp: transitionAt,
    });
  }

  private async prepareTestingArtifacts(
    args: { paths: RunPaths; state: TestingWorkflowRuntimeState; context: TestingWorkflowContext },
    nodeId: TestingWorkflowNodeId,
    priorArtifactIds: Set<string>,
  ): Promise<ArtifactObject[]> {
    if (!this.artifactWriter) return [];
    const refs = args.context.lifecycle.artifacts.filter(ref => !priorArtifactIds.has(ref.artifactId) && ref.path);
    const prepared: ArtifactObject[] = [];
    for (const ref of refs) {
      const absolutePath = safeRunPath(args.paths.runDir, ref.path!);
      if (!absolutePath || !fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) continue;
      prepared.push(await this.artifactWriter.write({
        runId: args.state.runId,
        nodeId: testingLeaseNodeId(args.state, nodeId),
        artifactId: ref.artifactId,
        kind: ref.type,
        relativePath: ref.path!,
        body: fs.readFileSync(absolutePath),
        contentType: 'application/json',
      }));
    }
    return prepared;
  }

  private async persistLifecycle(lifecycle: LifecycleState): Promise<void> {
    if (this.lifecyclePersistence) {
      await this.lifecyclePersistence.save(lifecycle);
      return;
    }
    saveLifecycleState(lifecycle);
  }

  private async loadLifecycle(runId: string): Promise<LifecycleState> {
    if (this.lifecyclePersistence) {
      const lifecycle = await this.lifecyclePersistence.load(runId);
      if (!lifecycle) throw new Error(`Lifecycle state does not exist for run ${runId}`);
      return lifecycle;
    }
    return requireLifecycleState(runId);
  }

  private async loadWorkflowState(runId: string, workflowInstanceId: string): Promise<TestingWorkflowRuntimeState | null> {
    if (this.transitionCommitter) {
      const run = await this.transitionCommitter.loadRun(runId);
      const state = testingWorkflowReadModels(run?.metadata)[workflowInstanceId];
      return state ? structuredClone(state) : null;
    }
    const file = testingWorkflowStatePath(runId, workflowInstanceId);
    return fs.existsSync(file) ? loadTestingWorkflowState(runId, workflowInstanceId) : null;
  }

  private async executeNode(args: {
    paths: RunPaths;
    state: TestingWorkflowRuntimeState;
    context: TestingWorkflowContext;
    nodeId: TestingWorkflowNodeId;
    dryRunExecution: boolean;
  }): Promise<void> {
    const now = Date.now();
    setNode(args.state, args.nodeId, 'running', [], undefined, now);
    switch (args.nodeId) {
      case 'load_requirement':
      case 'retrieve_context':
        setNode(args.state, args.nodeId, 'succeeded', [], undefined, now);
        return;
      case 'generate_strategy': {
        const artifact = await this.agents.generateStrategy({
          requirementId: args.state.requirementId,
          runId: args.state.runId,
          workflowInstanceId: args.state.workflowInstanceId,
          requirementSummary: args.context.requirementSummary,
          appIds: args.context.appIds,
          risks: [],
        });
        args.context.artifacts.strategy = artifact;
        setNode(args.state, args.nodeId, 'succeeded', [saveArtifact(args.paths, args.context.lifecycle, artifact).artifactId], undefined, now);
        return;
      }
      case 'review_strategy':
      case 'review_cases':
      case 'review_data_plans':
        setNode(args.state, args.nodeId, 'succeeded', [], 'Review auto-approved.', now);
        return;
      case 'generate_cases': {
        const strategy = requireArtifact(args.context.artifacts.strategy, 'strategy');
        const artifact = await this.agents.generateCases({
          requirementId: args.state.requirementId,
          runId: args.state.runId,
          workflowInstanceId: args.state.workflowInstanceId,
          strategy,
        });
        args.context.artifacts.caseSet = artifact;
        setNode(args.state, args.nodeId, 'succeeded', [saveArtifact(args.paths, args.context.lifecycle, artifact).artifactId], undefined, now);
        return;
      }
      case 'generate_data_plans': {
        const caseSet = requireArtifact(args.context.artifacts.caseSet, 'caseSet');
        const artifact = await this.agents.generateDataPlan({
          requirementId: args.state.requirementId,
          runId: args.state.runId,
          workflowInstanceId: args.state.workflowInstanceId,
          caseSet,
          dependencyEdges: args.context.dependencyEdges,
        });
        args.context.artifacts.dataPlan = artifact;
        setNode(args.state, args.nodeId, 'succeeded', [saveArtifact(args.paths, args.context.lifecycle, artifact).artifactId], undefined, now);
        return;
      }
      case 'deploy_related_apps': {
        const deployment = resolveDeploymentContext(args.state, args.context.lifecycle);
        if (!deployment) {
          args.state.status = 'blocked';
          args.state.blockedReason = 'Missing deployment set or environment refs for testing execution.';
          setNode(args.state, args.nodeId, 'blocked', [], args.state.blockedReason, now);
          return;
        }
        args.state.deploymentSetId = deployment.deploymentSetId;
        args.state.environmentId = deployment.environmentId;
        const repository = this.resolveTestingRepository(args.state, args.context);
        if (!repository) {
          args.state.status = 'blocked';
          args.state.blockedReason = 'No compatible integration testing repository is configured for this requirement and application scope.';
          setNode(args.state, args.nodeId, 'blocked', [], args.state.blockedReason, now);
          return;
        }
        if (!args.dryRunExecution) {
          if (repository.commands.start) {
            const [command, ...commandArgs] = splitCommand(repository.commands.start);
            await runTestingCommand({
              command,
              args: commandArgs,
              cwd: repository.root,
              timeoutMs: 180_000,
            });
          }
        }
        setNode(args.state, args.nodeId, 'succeeded', [], undefined, now);
        return;
      }
      case 'generate_scripts': {
        const caseSet = requireArtifact(args.context.artifacts.caseSet, 'caseSet');
        const repository = this.resolveTestingRepository(args.state, args.context);
        if (!repository) {
          args.state.status = 'blocked';
          args.state.blockedReason = 'No compatible integration testing repository is configured for this requirement and application scope.';
          setNode(args.state, args.nodeId, 'blocked', [], args.state.blockedReason, now);
          return;
        }
        const scripts = generateRepositoryScripts({
          caseSet,
          dataPlanId: args.context.artifacts.dataPlan?.dataPlanId,
          workflowInstanceId: args.state.workflowInstanceId,
          repository,
        });
        args.context.artifacts.scripts = scripts;
        const refs = scripts.map(script => saveArtifact(args.paths, args.context.lifecycle, script));
        setNode(args.state, args.nodeId, 'succeeded', refs.map(ref => ref.artifactId), undefined, now);
        return;
      }
      case 'review_scripts': {
        const scripts = args.context.artifacts.scripts ?? [];
        const artifact = await this.agents.reviewScripts({
          requirementId: args.state.requirementId,
          runId: args.state.runId,
          workflowInstanceId: args.state.workflowInstanceId,
          scripts,
        });
        args.context.artifacts.scriptReview = artifact;
        setNode(args.state, args.nodeId, 'succeeded', [saveArtifact(args.paths, args.context.lifecycle, artifact).artifactId], undefined, now);
        return;
      }
      case 'execute_scripts': {
        const scripts = args.context.artifacts.scripts ?? [];
        const repository = this.resolveTestingRepository(args.state, args.context);
        if (!repository) {
          args.state.status = 'blocked';
          args.state.blockedReason = 'No compatible integration testing repository is configured for this requirement and application scope.';
          setNode(args.state, args.nodeId, 'blocked', [], args.state.blockedReason, now);
          return;
        }
        const reports = !args.dryRunExecution
          ? await executeTestingRepository({
              state: args.state,
              repository,
              scripts,
            })
          : [];
        if (!reports.length) {
          for (const script of scripts) {
            reports.push(await executePytestScript(script, {
              cwd: args.paths.artifactsDir,
              dryRun: args.dryRunExecution,
              stdout: args.dryRunExecution ? 'test_generated.py::test_primary PASSED [100%]\n1 passed' : undefined,
            }));
          }
        }
        args.context.artifacts.reports = reports;
        const refs = reports.map(report => saveArtifact(args.paths, args.context.lifecycle, report));
        const status = reports.some(report => report.status === 'failed') ? 'failed' : 'passed';
        const testRun = recordTestingRun({
          state: args.context.lifecycle,
          testRunId: args.state.testRunId ?? `test-run-${args.state.workflowInstanceId}`,
          deploymentSetId: args.state.deploymentSetId ?? 'deployment-set-unresolved',
          environmentId: args.state.environmentId ?? 'environment-unresolved',
          status,
          artifactIds: refs.map(ref => ref.artifactId),
          evidenceArtifactIds: [],
        });
        args.context.testRun = testRun;
        args.state.testRunId = testRun.testRunId;
        setNode(args.state, args.nodeId, 'succeeded', refs.map(ref => ref.artifactId), undefined, now);
        return;
      }
      case 'collect_report':
        setNode(args.state, args.nodeId, 'succeeded', args.context.artifacts.reports?.flatMap(report => report.evidenceArtifactIds) ?? [], undefined, now);
        return;
      case 'calculate_metrics': {
        const caseSet = requireArtifact(args.context.artifacts.caseSet, 'caseSet');
        const artifact = calculateTestingMetrics({
          caseSet,
          scripts: args.context.artifacts.scripts ?? [],
          reports: args.context.artifacts.reports ?? [],
          workflowInstanceId: args.state.workflowInstanceId,
        });
        args.context.artifacts.coverage = artifact;
        setNode(args.state, args.nodeId, 'succeeded', [saveArtifact(args.paths, args.context.lifecycle, artifact).artifactId], undefined, now);
        return;
      }
      case 'quality_gate': {
        const coverage = requireArtifact(args.context.artifacts.coverage, 'coverage');
        const evaluation = evaluateQualityGate(coverage);
        const artifact = {
          schemaVersion: 1 as const,
          artifactKind: 'testing-quality-gate' as const,
          requirementId: args.state.requirementId,
          runId: args.state.runId,
          workflowInstanceId: args.state.workflowInstanceId,
          sourceNodeId: 'quality_gate',
          status: evaluation.decision === 'passed' ? 'passed' as const : 'failed' as const,
          generatedAt: now,
          upstreamArtifactIds: [],
          qualityGateId: `quality-gate-${args.state.workflowInstanceId}`,
          decision: evaluation.decision,
          reasons: evaluation.reasons,
          metricArtifactIds: [],
        };
        args.context.artifacts.qualityGate = artifact;
        setNode(args.state, args.nodeId, 'succeeded', [saveArtifact(args.paths, args.context.lifecycle, artifact).artifactId], undefined, now);
        return;
      }
      case 'failure_triage': {
        const qualityGate = args.context.artifacts.qualityGate;
        if (qualityGate?.decision === 'passed') {
          setNode(args.state, args.nodeId, 'skipped', [], 'Quality gate passed.', now);
          return;
        }
        const artifact = await this.agents.triageFailure({
          requirementId: args.state.requirementId,
          runId: args.state.runId,
          workflowInstanceId: args.state.workflowInstanceId,
          message: qualityGate?.reasons.join('\n') || 'Testing execution failed.',
        });
        args.context.artifacts.triage = artifact;
        setNode(args.state, args.nodeId, 'succeeded', [saveArtifact(args.paths, args.context.lifecycle, artifact).artifactId], undefined, now);
        return;
      }
      case 'regression_update': {
        const caseSet = args.context.artifacts.caseSet;
        const artifact = await this.agents.planRegression({
          requirementId: args.state.requirementId,
          runId: args.state.runId,
          workflowInstanceId: args.state.workflowInstanceId,
          failedCaseIds: caseSet?.cases.map(testCase => testCase.testCaseId) ?? [],
          impactedAppIds: args.context.appIds,
          triage: args.context.artifacts.triage,
        });
        args.context.artifacts.regression = artifact;
        setNode(args.state, args.nodeId, 'succeeded', [saveArtifact(args.paths, args.context.lifecycle, artifact).artifactId], undefined, now);
        return;
      }
      case 'persist_artifacts':
        args.state.status = 'completed';
        setNode(args.state, args.nodeId, 'succeeded', args.state.artifactIds, 'Testing artifacts persisted.', now);
        return;
    }
  }

  private resolveTestingRepository(state: TestingWorkflowRuntimeState, context: TestingWorkflowContext): TestingRepository | null {
    return this.repositoryResolver.resolve({ requirementId: state.requirementId, applicationIds: context.appIds, repositoryType: 'integration' });
  }
}

export function createTestingWorkflowRuntime(options?: TestingWorkflowRuntimeOptions): TestingWorkflowRuntime {
  return new TestingWorkflowRuntime(options);
}

export function testingWorkflowStatePath(runId: string, workflowInstanceId: string): string {
  return path.join(getRunPaths(runId).artifactsDir, 'testing', workflowInstanceId, 'workflow-state.json');
}

export function loadTestingWorkflowState(runId: string, workflowInstanceId: string): TestingWorkflowRuntimeState {
  const file = testingWorkflowStatePath(runId, workflowInstanceId);
  if (!fs.existsSync(file)) throw new Error(`Testing workflow state does not exist: ${workflowInstanceId}`);
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as TestingWorkflowRuntimeState;
}

function writeTestingWorkflowState(paths: RunPaths, state: TestingWorkflowRuntimeState): void {
  const file = path.join(paths.artifactsDir, 'testing', state.workflowInstanceId, 'workflow-state.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf-8');
}

function saveArtifact(paths: RunPaths, lifecycle: LifecycleState, artifact: AnyTestingWorkflowArtifact): ArtifactRef {
  const relativePath = path.posix.join(
    'artifacts',
    'testing',
    artifact.workflowInstanceId,
    artifact.sourceNodeId,
    `${artifact.artifactKind}-${testingArtifactFileId(artifact)}.json`
  );
  const absolutePath = path.join(paths.runDir, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, JSON.stringify(artifact, null, 2), 'utf-8');
  const ref = registerTestingArtifact(lifecycle, {
    type: artifact.artifactKind,
    path: relativePath,
    producerWorkflowRunId: artifact.workflowInstanceId,
    sourceId: artifact.sourceNodeId,
    summary: artifact.artifactKind,
    metadata: {
      artifactId: `testing-${artifact.workflowInstanceId}-${artifact.sourceNodeId}-${testingArtifactFileId(artifact)}`.replace(/[^a-zA-Z0-9_.-]+/g, '-'),
      status: artifact.status,
      testRunId: artifact.testRunId,
      deploymentSetId: artifact.deploymentSetId,
      environmentId: artifact.environmentId,
    },
  });
  return ref;
}

function testingLeaseNodeId(state: TestingWorkflowRuntimeState, nodeId: TestingWorkflowNodeId): string {
  return `testing:${state.workflowInstanceId}:${nodeId}`;
}

function testingWorkflowReadModels(metadata: Record<string, unknown> | undefined): Record<string, TestingWorkflowRuntimeState> {
  const value = metadata?.testingWorkflows;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, TestingWorkflowRuntimeState>
    : {};
}

function safeRunPath(runDir: string, relativePath: string): string | undefined {
  const root = path.resolve(runDir);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return undefined;
  return resolved;
}

function testingArtifactFileId(artifact: AnyTestingWorkflowArtifact): string {
  const id =
    artifact.artifactKind === 'testing-strategy' ? artifact.strategyId :
    artifact.artifactKind === 'testing-test-cases' ? artifact.caseSetId :
    artifact.artifactKind === 'testing-data-plan' ? artifact.dataPlanId :
    artifact.artifactKind === 'testing-generated-script' ? artifact.scriptId :
    artifact.artifactKind === 'testing-execution-report' ? artifact.executionReportId :
    artifact.artifactKind === 'testing-coverage-report' ? artifact.coverageReportId :
    artifact.artifactKind === 'testing-failure-triage' ? artifact.triageId :
    artifact.artifactKind === 'testing-regression-plan' ? artifact.regressionPlanId :
    artifact.artifactKind === 'testing-quality-gate' ? artifact.qualityGateId :
    (artifact as { artifactKind: string }).artifactKind;
  return id.replace(/[^a-zA-Z0-9_.-]+/g, '-');
}

function initialRuntimeState(args: {
  input: StartTestingWorkflowInput;
  workflowInstanceId: string;
  now: number;
  lifecycle: LifecycleState;
}): TestingWorkflowRuntimeState {
  return {
    schemaVersion: 1,
    workflowInstanceId: args.workflowInstanceId,
    workflowId: TESTING_WORKFLOW_ID,
    requirementId: args.input.requirementId,
    runId: args.input.runId,
    status: 'pending',
    currentNodeId: 'load_requirement',
    nodes: TESTING_WORKFLOW_NODES.map(node => ({ nodeId: node.id, status: 'pending', artifactIds: [] })),
    gates: [],
    artifactIds: [],
    deploymentSetId: args.input.deploymentSetId ?? args.lifecycle.deploymentSets.at(-1)?.deploymentSetId,
    environmentId: args.input.environmentId ?? args.lifecycle.environments.at(-1)?.environmentId ?? args.lifecycle.deploymentSets.at(-1)?.environmentId,
    createdAt: args.now,
    updatedAt: args.now,
  };
}

function setNode(
  state: TestingWorkflowRuntimeState,
  nodeId: TestingWorkflowNodeId,
  status: TestingWorkflowNodeState['status'],
  artifactIds: string[],
  message: string | undefined,
  now: number,
): void {
  state.nodes = state.nodes.map(node => node.nodeId === nodeId
    ? {
        ...node,
        status,
        artifactIds,
        message,
        startedAt: node.startedAt ?? now,
        completedAt: status === 'running' || status === 'waiting_review' ? node.completedAt : now,
      }
    : node);
  state.artifactIds = unique([...state.artifactIds, ...artifactIds]);
  state.updatedAt = now;
}

function pauseForReview(
  state: TestingWorkflowRuntimeState,
  nodeId: TestingWorkflowNodeId,
  artifactIds: string[],
  now: number,
): void {
  const gate: TestingReviewGate = {
    gateId: `gate-${state.workflowInstanceId}-${nodeId}`,
    nodeId,
    status: 'waiting',
    artifactIds,
    riskIds: [],
    resumeToken: `resume-${state.workflowInstanceId}-${nodeId}`,
    createdAt: now,
  };
  state.status = 'waiting_review';
  state.pendingGate = gate;
  state.gates = [...state.gates.filter(existing => existing.gateId !== gate.gateId), gate];
  setNode(state, nodeId, 'waiting_review', artifactIds, 'Waiting for testing review.', now);
}

function latestArtifactIds(context: TestingWorkflowContext): string[] {
  return context.lifecycle.artifacts
    .filter(ref => ref.producerWorkflowRunId)
    .slice(-5)
    .map(ref => ref.artifactId);
}

function resolveDeploymentContext(
  state: TestingWorkflowRuntimeState,
  lifecycle: LifecycleState,
): { deploymentSetId: string; environmentId: string } | undefined {
  const deploymentSet = state.deploymentSetId
    ? lifecycle.deploymentSets.find(candidate => candidate.deploymentSetId === state.deploymentSetId)
    : lifecycle.deploymentSets.at(-1);
  const environmentId = state.environmentId ?? deploymentSet?.environmentId ?? lifecycle.environments.at(-1)?.environmentId;
  if (!deploymentSet || !environmentId) return undefined;
  return { deploymentSetId: deploymentSet.deploymentSetId, environmentId };
}

function rebuildContextFromLifecycle(lifecycle: LifecycleState, paths: RunPaths): TestingWorkflowContext {
  const context: TestingWorkflowContext = {
    lifecycle,
    requirementSummary: String(lifecycle.metadata?.requirementSummary ?? lifecycle.requirementId),
    appIds: lifecycle.apps.map(app => app.appId),
    dependencyEdges: [],
    artifacts: {},
    refs: lifecycle.artifacts,
  };
  for (const artifact of readTestingArtifacts(paths, lifecycle)) {
    if (artifact.artifactKind === 'testing-strategy') context.artifacts.strategy = artifact;
    if (artifact.artifactKind === 'testing-test-cases') context.artifacts.caseSet = artifact;
    if (artifact.artifactKind === 'testing-data-plan') context.artifacts.dataPlan = artifact;
    if (artifact.artifactKind === 'testing-generated-script') context.artifacts.scripts = [...(context.artifacts.scripts ?? []), artifact];
    if (artifact.artifactKind === 'testing-execution-report') context.artifacts.reports = [...(context.artifacts.reports ?? []), artifact];
    if (artifact.artifactKind === 'testing-coverage-report') context.artifacts.coverage = artifact;
    if (artifact.artifactKind === 'testing-quality-gate') context.artifacts.qualityGate = artifact;
    if (artifact.artifactKind === 'testing-failure-triage') context.artifacts.triage = artifact;
    if (artifact.artifactKind === 'testing-regression-plan') context.artifacts.regression = artifact;
  }
  return context;
}

function createEmptyResumeContext(lifecycle: LifecycleState): TestingWorkflowContext {
  return {
    lifecycle,
    requirementSummary: String(lifecycle.metadata?.requirementSummary ?? lifecycle.requirementId),
    appIds: lifecycle.apps.map(app => app.appId),
    dependencyEdges: [],
    artifacts: {},
    refs: lifecycle.artifacts,
  };
}

function generateRepositoryScripts(args: {
  caseSet: TestCase;
  dataPlanId?: string;
  workflowInstanceId: string;
  repository: TestingRepository;
}): GeneratedScript[] {
  const testPath = path.join(args.repository.root, 'tests', 'integration', `${args.caseSet.requirementId}.test.js`);
  const content = fs.existsSync(testPath) ? fs.readFileSync(testPath, 'utf-8') : '';
  return [{
    schemaVersion: 1,
    artifactKind: 'testing-generated-script',
    requirementId: args.caseSet.requirementId,
    runId: args.caseSet.runId,
    workflowInstanceId: args.workflowInstanceId,
    sourceNodeId: 'generate_scripts',
    status: 'approved',
    generatedAt: Date.now(),
    upstreamArtifactIds: [],
    scriptId: `script-${args.workflowInstanceId}-${args.repository.repositoryId}`,
    testCaseIds: args.caseSet.cases.map(testCase => testCase.testCaseId),
    dataPlanId: args.dataPlanId,
    language: 'javascript',
    path: path.relative(process.cwd(), testPath).replace(/\\/g, '/'),
    command: args.repository.commands.test,
    content,
    environmentRequirements: ['node>=20', 'npm', 'product service', 'inventory service', 'marketing service'],
  }];
}

async function executeTestingRepository(args: {
  state: TestingWorkflowRuntimeState;
  repository: TestingRepository;
  scripts: GeneratedScript[];
}): Promise<ExecutionReport[]> {
  const primaryScript = args.scripts[0] ?? syntheticRepositoryScript(args.state, args.repository);
  const reports: ExecutionReport[] = [];
  if (args.repository.commands.seed) {
    const [seedCommand, ...seedArgs] = splitCommand(args.repository.commands.seed);
    const seed = await runTestingCommand({ command: seedCommand, args: seedArgs, cwd: args.repository.root, timeoutMs: 120_000 });
    reports.push(commandExecutionReport({
      state: args.state, script: primaryScript, sourceNodeId: 'execute_scripts',
      reportId: `report-${args.state.workflowInstanceId}-${args.repository.repositoryId}-seed`, executor: seedCommand,
      command: args.repository.commands.seed, result: seed, parseAsNodeTest: /node|npm/.test(seedCommand),
    }));
  }
  const [testCommand, ...testArgs] = splitCommand(args.repository.commands.test);
  const test = await runTestingCommand({
    command: testCommand,
    args: testArgs,
    cwd: args.repository.root,
    timeoutMs: 180_000,
  });
  reports.push(
    commandExecutionReport({
      state: args.state,
      script: primaryScript,
      sourceNodeId: 'execute_scripts',
      reportId: `report-${args.state.workflowInstanceId}-${args.repository.repositoryId}`,
      executor: testCommand,
      command: args.repository.commands.test,
      result: test,
      parseAsNodeTest: /node|npm/.test(testCommand),
    }),
  );
  return reports;
}

function syntheticRepositoryScript(state: TestingWorkflowRuntimeState, repository: TestingRepository): GeneratedScript {
  return {
    schemaVersion: 1,
    artifactKind: 'testing-generated-script',
    requirementId: state.requirementId,
    runId: state.runId,
    workflowInstanceId: state.workflowInstanceId,
    sourceNodeId: 'generate_scripts',
    status: 'approved',
    generatedAt: Date.now(),
    upstreamArtifactIds: [],
    scriptId: `script-${state.workflowInstanceId}-${repository.repositoryId}`,
    testCaseIds: [],
    language: 'javascript',
    path: path.relative(process.cwd(), repository.root).replace(/\\/g, '/'),
    command: repository.commands.test,
    content: '',
    environmentRequirements: ['node>=20', 'npm'],
  };
}

function splitCommand(command: string): [string, ...string[]] {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) throw new Error('Testing repository command must not be empty.');
  return parts as [string, ...string[]];
}

function commandExecutionReport(args: {
  state: TestingWorkflowRuntimeState;
  script: GeneratedScript;
  sourceNodeId: string;
  reportId: string;
  executor: string;
  command: string;
  result: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean };
  parseAsNodeTest: boolean;
}): ExecutionReport {
  const summary = args.parseAsNodeTest
    ? parseNodeTestOutput(args.result.stdout, args.result.exitCode)
    : normalizeExecutionSummary(parsePytestOutput(args.result.stdout, args.result.stderr, args.result.exitCode));
  const status = args.result.timedOut
    ? 'blocked'
    : args.result.exitCode === 0 && summary.failed === 0 && summary.errored === 0
      ? 'passed'
      : 'failed';
  return {
    schemaVersion: 1,
    artifactKind: 'testing-execution-report',
    requirementId: args.state.requirementId,
    runId: args.state.runId,
    workflowInstanceId: args.state.workflowInstanceId,
    sourceNodeId: args.sourceNodeId,
    status,
    generatedAt: Date.now(),
    testRunId: args.state.testRunId,
    deploymentSetId: args.state.deploymentSetId,
    environmentId: args.state.environmentId,
    upstreamArtifactIds: [],
    executionReportId: args.reportId,
    executor: args.executor,
    command: args.command,
    exitCode: args.result.exitCode,
    durationMs: 0,
    stdout: args.result.stdout,
    stderr: args.result.stderr,
    timedOut: args.result.timedOut,
    dependencyErrors: [],
    evidenceArtifactIds: [],
    summary,
    metadata: {
      scriptPath: args.script.path,
      testCaseIds: args.script.testCaseIds,
    },
  };
}

function parseNodeTestOutput(stdout: string, exitCode: number | null): ExecutionReport['summary'] {
  const tests = Number(stdout.match(/(?:#|ℹ)\s*tests\s+(\d+)/i)?.[1] ?? 0);
  const passed = Number(stdout.match(/(?:#|ℹ)\s*pass\s+(\d+)/i)?.[1] ?? 0);
  const failed = Number(stdout.match(/(?:#|ℹ)\s*fail\s+(\d+)/i)?.[1] ?? 0);
  const skipped = Number(stdout.match(/(?:#|ℹ)\s*skipped\s+(\d+)/i)?.[1] ?? 0);
  const errored = Number(stdout.match(/(?:#|ℹ)\s*cancelled\s+(\d+)/i)?.[1] ?? 0);
  if (tests || passed || failed || skipped || errored) {
    return { passed, failed, skipped, errored, total: tests || passed + failed + skipped + errored };
  }
  return {
    passed: exitCode === 0 ? 1 : 0,
    failed: exitCode === 0 ? 0 : 1,
    skipped: 0,
    errored: 0,
    total: 1,
  };
}

function normalizeExecutionSummary(summary: {
  passed: number;
  failed: number;
  skipped: number;
  errored: number;
  total: number;
}): ExecutionReport['summary'] {
  return {
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    errored: summary.errored,
    total: summary.total,
  };
}

function requireLifecycleState(runId: string): LifecycleState {
  const state = loadLifecycleState(runId);
  if (!state) throw new Error(`Lifecycle state does not exist for run ${runId}`);
  return state;
}

function readTestingArtifacts(paths: RunPaths, lifecycle: LifecycleState): AnyTestingWorkflowArtifact[] {
  const artifacts: AnyTestingWorkflowArtifact[] = [];
  for (const ref of lifecycle.artifacts) {
    if (!ref.type.startsWith('testing-') || !ref.path) continue;
    const file = path.join(paths.runDir, ref.path);
    if (!fs.existsSync(file)) continue;
    artifacts.push(validateTestingArtifact(JSON.parse(fs.readFileSync(file, 'utf-8'))));
  }
  return artifacts;
}

function requireArtifact<T>(artifact: T | undefined, name: string): T {
  if (!artifact) throw new Error(`Testing workflow missing ${name} artifact`);
  return artifact;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
