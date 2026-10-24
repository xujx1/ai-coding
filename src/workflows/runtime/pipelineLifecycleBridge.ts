import * as fs from 'fs';
import * as path from 'path';
import type { PipelineNode } from '../definitions/pipelineDefinition.js';
import type { ExecutionState, NodeState, RollbackState } from '../../persistence/executionTypes.js';
import type { RunPaths } from '../../runtime/paths.js';
import type { LifecycleStatePersistence } from '../../storage/lifecycleStatePersistence.js';
import {
  appendLifecycleEvent,
  applyFanoutAdjustments,
  assembleIntegrationTestingInput,
  checkArchiveReadiness,
  createApprovalGate,
  createDataPlan,
  createEmptyLifecycleState,
  createEnvironmentPlan,
  createFailureClassification,
  createFixCycle,
  createRequirementDeploymentSet,
  createTestingKnowledgeDeltaCandidates,
  generateArchiveReport,
  generateIntegrationTestCases,
  generateIntegrationTestScripts,
  initializeApplicationKnowledgeArtifacts,
  loadLifecycleState,
  persistNodeRun,
  persistWorkflowRun,
  recallFanoutCandidates,
  recordArchive,
  recordDiagnosis,
  recordIntegrationTestRun,
  registerArtifact,
  registerDeploymentArtifacts,
  resolveApprovalGate,
  saveLifecycleState,
  writeFanoutLifecycleArtifacts,
  writeIntegrationTestingArtifacts,
  writeKnowledgeDeltaArtifact,
} from '../../lifecycle/index.js';
import type {
  ApprovalGateType,
  ArtifactRef,
  EnvironmentRef,
  LifecyclePhase,
  LifecycleState,
  NodeRun,
  NodeRunStatus,
  PipelineRunRef,
  WorkflowRun,
} from '../../lifecycle/types.js';
import {
  classifyWithAiOpsReference,
  createHarnessRepositoryRefs,
  enhanceDataPlanWithTestingReference,
  inspectExternalCapabilityImports,
} from '../../lifecycle/externalAdapters.js';
import {
  buildLocalGitNexusGraph,
  buildLocalVectorIndex,
  graphEdgesForFanout,
  loadLocalGitNexusGraph,
  loadLocalVectorIndex,
  queryLocalVectorIndex,
} from '../../tools/knowledge/knowledgeGraph.js';

const WORKFLOW_ID = 'legacy-pipeline';

export interface PipelineLifecycleOptions {
  workflowId?: string;
  now?: number;
  /** When supplied, the repository is authoritative and no lifecycle JSON is read or written. */
  persistence?: LifecycleStatePersistence;
}

export function ensurePipelineLifecycleForExecution(
  execution: ExecutionState,
  options: PipelineLifecycleOptions = {},
): ExecutionState | Promise<ExecutionState> {
  if (options.persistence) {
    return (async () => {
      const state = await loadOrCreateLifecycleStateAsync(execution, options);
      await options.persistence!.save(state);
      return attachLifecycleMetadata(execution, state);
    })();
  }
  const state = loadOrCreateLifecycleState(execution, options);
  saveLifecycleState(state);
  return attachLifecycleMetadata(execution, state);
}

export function recordPipelineLifecycleStarted(
  execution: ExecutionState,
  options: PipelineLifecycleOptions = {},
): void | Promise<void> {
  return updatePipelineLifecycle(execution, options, state => {
    state.phase = inferPhase(execution.currentNodeId);
    state.status = 'active';
    const workflow = workflowRunForExecution(execution, 'running', options);
    persistWorkflowRun(state, workflow);
    appendLifecycleEvent(state, {
      type: 'workflow_started',
      workflowRunId: workflow.workflowRunId,
      data: { fromNodeId: execution.currentNodeId },
      now: options.now,
    });
  });
}

export function recordPipelineLifecycleCompleted(
  execution: ExecutionState,
  options: PipelineLifecycleOptions = {},
): void | Promise<void> {
  return updatePipelineLifecycle(execution, options, state => {
    state.phase = 'completed';
    state.status = 'completed';
    const workflow = workflowRunForExecution(execution, 'completed', options);
    workflow.completedAt = options.now ?? Date.now();
    persistWorkflowRun(state, workflow);
    appendLifecycleEvent(state, {
      type: 'workflow_completed',
      workflowRunId: workflow.workflowRunId,
      now: options.now,
    });
  });
}

export function recordPipelineLifecycleFailed(
  execution: ExecutionState,
  error: string,
  options: PipelineLifecycleOptions = {},
): void | Promise<void> {
  return updatePipelineLifecycle(execution, options, state => {
    state.phase = 'failed';
    state.status = execution.status === 'cancelled' ? 'cancelled' : 'failed';
    const workflow = workflowRunForExecution(execution, execution.status === 'cancelled' ? 'cancelled' : 'failed', options);
    workflow.completedAt = options.now ?? Date.now();
    workflow.error = error;
    persistWorkflowRun(state, workflow);
  });
}

export function recordPipelineLifecycleNodeStarted(args: {
  execution: ExecutionState;
  node: PipelineNode;
  nodeState: NodeState;
  now?: number;
  persistence?: LifecycleStatePersistence;
}): void | Promise<void> {
  return updatePipelineLifecycle(args.execution, { now: args.now, persistence: args.persistence }, state => {
    state.phase = inferPhase(args.node.id);
    state.status = 'active';
    syncAppsFromExecution(state, args.execution);
    const nodeRun = nodeRunForState(args.execution, args.node, args.nodeState, 'running', state, args.now);
    persistNodeRun(state, nodeRun);
    appendLifecycleEvent(state, {
      type: 'node_started',
      workflowRunId: nodeRun.workflowRunId,
      nodeRunId: nodeRun.nodeRunId,
      data: { nodeId: args.node.id, nodeName: args.node.name },
      now: args.now,
    });
  });
}

export function recordPipelineLifecycleNodeCompleted(args: {
  execution: ExecutionState;
  node: PipelineNode;
  nodeState: NodeState;
  outputArtifacts: string[];
  paths: RunPaths;
  now?: number;
  persistence?: LifecycleStatePersistence;
}): void | Promise<void> {
  return updatePipelineLifecycle(args.execution, { now: args.now, persistence: args.persistence }, state => {
    state.phase = inferPhase(args.node.id);
    state.status = 'active';
    syncAppsFromExecution(state, args.execution);
    const nodeRun = nodeRunForState(args.execution, args.node, args.nodeState, 'succeeded', state, args.now);
    const artifactRefs = registerOutputArtifacts(state, {
      nodeRun,
      node: args.node,
      artifacts: args.outputArtifacts,
    });
    nodeRun.outputArtifactIds = artifactRefs.map(ref => ref.artifactId);
    persistNodeRun(state, nodeRun);
    appendLifecycleEvent(state, {
      type: 'node_completed',
      workflowRunId: nodeRun.workflowRunId,
      nodeRunId: nodeRun.nodeRunId,
      data: { nodeId: args.node.id, artifactIds: nodeRun.outputArtifactIds },
      now: args.now,
    });
    recordDomainFactsAfterNode({ state, execution: args.execution, node: args.node, outputArtifacts: args.outputArtifacts, paths: args.paths, now: args.now });
  });
}

export function recordPipelineLifecycleNodeFailed(args: {
  execution: ExecutionState;
  node: PipelineNode;
  nodeState: NodeState;
  error: string;
  now?: number;
  persistence?: LifecycleStatePersistence;
}): void | Promise<void> {
  return updatePipelineLifecycle(args.execution, { now: args.now, persistence: args.persistence }, state => {
    state.phase = isPipelineTestingNode(args.node.id) ? 'diagnosis' : inferPhase(args.node.id);
    state.status = 'failed';
    syncAppsFromExecution(state, args.execution);
    const nodeRun = nodeRunForState(args.execution, args.node, args.nodeState, 'failed', state, args.now);
    nodeRun.error = {
      message: args.error,
      recoverable: (args.nodeState.failureCount ?? 0) < 3,
    };
    persistNodeRun(state, nodeRun);
    appendLifecycleEvent(state, {
      type: 'node_failed',
      workflowRunId: nodeRun.workflowRunId,
      nodeRunId: nodeRun.nodeRunId,
      data: { nodeId: args.node.id, error: args.error },
      now: args.now,
    });
    if (args.node.id.includes('test')) {
      recordFailureDiagnosis(state, args.error, undefined, args.now);
    }
  });
}

export function recordPipelineLifecycleApprovalWaiting(args: {
  execution: ExecutionState;
  nodeId: string;
  artifactPaths?: string[];
  gateType?: ApprovalGateType;
  riskIds?: string[];
  now?: number;
  persistence?: LifecycleStatePersistence;
}): void | Promise<void> {
  const gateType = args.gateType ?? gateTypeForNode(args.nodeId);
  if (!gateType) return;
  return updatePipelineLifecycle(args.execution, { now: args.now, persistence: args.persistence }, state => {
    const workflowRunId = workflowRunIdFor(args.execution);
    const nodeRunId = nodeRunIdFor(args.execution, args.nodeId);
    const artifactIds = (args.artifactPaths ?? [])
      .map(artifactPath => findOrRegisterArtifact(state, artifactPath, args.nodeId, nodeRunId, workflowRunId).artifactId);
    if (state.approvals.some(gate =>
      gate.nodeRunId === nodeRunId
      && gate.gateType === gateType
      && gate.status === 'waiting'
    )) {
      return;
    }
    createApprovalGate(state, {
      workflowRunId,
      nodeRunId,
      gateType,
      artifactIds,
      riskIds: args.riskIds,
      now: args.now,
    });
  });
}

export function recordPipelineLifecycleApprovalResolved(args: {
  execution: ExecutionState;
  nodeId: string;
  approved: boolean;
  feedback?: string;
  resolvedBy?: string;
  now?: number;
  persistence?: LifecycleStatePersistence;
}): void | Promise<void> {
  return updatePipelineLifecycle(args.execution, { now: args.now, persistence: args.persistence }, state => {
    const nodeRunId = nodeRunIdFor(args.execution, args.nodeId);
    const gate = [...state.approvals].reverse().find(item =>
      item.nodeRunId === nodeRunId && item.status === 'waiting'
    );
    if (!gate) return;
    resolveApprovalGate(state, {
      approvalGateId: gate.approvalGateId,
      decision: args.approved ? 'approved' : args.feedback ? 'needs_changes' : 'rejected',
      resolvedBy: args.resolvedBy ?? 'user',
      decisionReason: args.approved ? 'Approved in pipeline confirmation gate.' : 'Rejected in pipeline confirmation gate.',
      feedback: args.feedback,
      now: args.now,
    });
  });
}

export function recordPipelineLifecycleApprovalCancelled(args: {
  execution: ExecutionState;
  nodeId: string;
  resolvedBy?: string;
  now?: number;
  persistence?: LifecycleStatePersistence;
}): void | Promise<void> {
  return updatePipelineLifecycle(args.execution, { now: args.now, persistence: args.persistence }, state => {
    const nodeRunId = nodeRunIdFor(args.execution, args.nodeId);
    const gate = [...state.approvals].reverse().find(item =>
      item.nodeRunId === nodeRunId && item.status === 'waiting'
    );
    if (gate) {
      resolveApprovalGate(state, {
        approvalGateId: gate.approvalGateId,
        decision: 'rejected',
        resolvedBy: args.resolvedBy ?? 'user',
        decisionReason: 'Rejected in pipeline confirmation gate.',
        now: args.now,
      });
    }
    state.phase = 'failed';
    state.status = 'cancelled';
    const workflow = workflowRunForExecution(args.execution, 'cancelled', { now: args.now });
    workflow.completedAt = args.now ?? Date.now();
    persistWorkflowRun(state, workflow);
  });
}

export function recordPipelineLifecycleRollback(args: {
  execution: ExecutionState;
  rollback: RollbackState;
  now?: number;
  persistence?: LifecycleStatePersistence;
}): void | Promise<void> {
  return updatePipelineLifecycle(args.execution, { now: args.now, persistence: args.persistence }, state => {
    state.phase = 'fixing';
    const classification = createFailureClassification({
      state,
      category: args.rollback.category === 'review_block' ? 'CODE_BUG' : 'TEST_SCRIPT',
      confidence: 0.8,
      rootCauseCandidates: [args.rollback.reason],
      evidenceArtifactIds: [],
    });
    recordDiagnosis({
      state,
      classification,
    });
    const cycle = createFixCycle({
      state,
      failureClassificationId: classification.failureClassificationId,
      owner: 'ai-coding',
      fixType: args.rollback.category ?? 'pipeline-rollback',
      artifactIds: [],
    });
    appendLifecycleEvent(state, {
      type: 'fix_cycle_recorded',
      data: {
        fixCycleId: cycle.fixCycleId,
        targetNodeId: args.rollback.targetNodeId,
        affectedProjects: args.rollback.affectedProjects,
      },
      now: args.now,
    });
  });
}

function updatePipelineLifecycle(
  execution: ExecutionState,
  options: PipelineLifecycleOptions,
  updater: (state: LifecycleState) => void,
): void | Promise<void> {
  if (options.persistence) {
    return (async () => {
      const state = await loadOrCreateLifecycleStateAsync(execution, options);
      updater(state);
      attachLifecycleMetadata(execution, state);
      await options.persistence!.save(state);
    })();
  }
  const state = loadOrCreateLifecycleState(execution, options);
  updater(state);
  saveLifecycleState(state);
  attachLifecycleMetadata(execution, state);
}

function loadOrCreateLifecycleState(
  execution: ExecutionState,
  options: PipelineLifecycleOptions = {},
): LifecycleState {
  const existing = loadLifecycleState(execution.runId);
  if (existing) {
    syncAppsFromExecution(existing, execution);
    return existing;
  }
  return createLifecycleState(execution, options);
}

function createLifecycleState(
  execution: ExecutionState,
  options: PipelineLifecycleOptions,
): LifecycleState {
  const state = createEmptyLifecycleState({
    requirementId: requirementIdFor(execution),
    runId: execution.runId,
    phase: inferPhase(execution.currentNodeId),
    status: execution.status === 'waiting_confirmation' ? 'waiting_approval' : 'active',
    apps: (execution.projects ?? []).map(project => ({
      appId: project.name,
      role: 'primary',
      status: appStatusForProject(project.status),
      repoRef: project.root,
      branchName: project.branchId,
      artifactIds: [],
      ciRunIds: [],
      testRunIds: [],
    })),
    workflowRuns: [{
      workflowRunId: workflowRunIdFor(execution),
      workflowId: options.workflowId ?? WORKFLOW_ID,
      status: workflowStatusForExecution(execution),
    }],
    nodeRuns: execution.nodes.map(node => ({
      nodeRunId: nodeRunIdFor(execution, node.id),
      workflowRunId: workflowRunIdFor(execution),
      nodeId: node.id,
      status: nodeRunStatusForNode(node.status),
    })),
    metadata: {
      executionStateName: execution.name,
      pipeline: 'fixed-mrd-to-code',
    },
    now: options.now,
  });
  appendLifecycleEvent(state, {
    type: 'state_migrated',
    workflowRunId: workflowRunIdFor(execution),
    data: { source: 'pipeline-bridge' },
    now: options.now,
  });
  return state;
}

async function loadOrCreateLifecycleStateAsync(
  execution: ExecutionState,
  options: PipelineLifecycleOptions,
): Promise<LifecycleState> {
  const existing = await options.persistence!.load(execution.runId);
  if (existing) {
    syncAppsFromExecution(existing, execution);
    return existing;
  }
  return createLifecycleState(execution, options);
}

function attachLifecycleMetadata(execution: ExecutionState, state: LifecycleState): ExecutionState {
  execution.metadata = {
    ...execution.metadata,
    lifecycle: {
      statePath: 'artifacts/lifecycle-state.json',
      schemaVersion: state.schemaVersion,
      workflowRunId: workflowRunIdFor(execution),
    },
  };
  return execution;
}

function workflowRunForExecution(
  execution: ExecutionState,
  status: WorkflowRun['status'],
  options: { workflowId?: string; now?: number },
): WorkflowRun {
  return {
    workflowRunId: workflowRunIdFor(execution),
    requirementId: requirementIdFor(execution),
    runId: execution.runId,
    workflowId: options.workflowId ?? String(execution.metadata?.workflowId ?? WORKFLOW_ID),
    status,
    nodeRunIds: execution.nodes.map(node => nodeRunIdFor(execution, node.id)),
    inputArtifactIds: [],
    outputArtifactIds: [],
    startedAt: execution.startedAt,
    completedAt: status === 'completed' || status === 'failed' || status === 'cancelled'
      ? options.now ?? Date.now()
      : undefined,
    metadata: {
      currentNodeId: execution.currentNodeId,
      pipelineStatus: execution.status,
    },
  };
}

function nodeRunForState(
  execution: ExecutionState,
  node: Pick<PipelineNode, 'id'>,
  nodeState: NodeState,
  status: NodeRunStatus,
  lifecycle: LifecycleState,
  now?: number,
): NodeRun {
  const existing = lifecycle.nodeRuns.find(ref => ref.nodeId === node.id);
  return {
    nodeRunId: existing?.nodeRunId ?? nodeRunIdFor(execution, node.id),
    requirementId: lifecycle.requirementId,
    runId: execution.runId,
    workflowRunId: workflowRunIdFor(execution),
    nodeId: node.id,
    status,
    inputArtifactIds: inferInputArtifactIds(lifecycle, node.id),
    outputArtifactIds: [],
    startedAt: nodeState.startedAt ?? now,
    completedAt: status === 'succeeded' || status === 'failed' || status === 'cancelled'
      ? nodeState.completedAt ?? now ?? Date.now()
      : undefined,
    metadata: {
      failureCount: nodeState.failureCount,
      childAgentIds: nodeState.childAgentIds,
      agentRunId: nodeState.agentRunId,
    },
  };
}

function registerOutputArtifacts(
  state: LifecycleState,
  args: {
    nodeRun: NodeRun;
    node: PipelineNode;
    artifacts: string[];
  },
): ArtifactRef[] {
  return args.artifacts.map(artifactPath => findOrRegisterArtifact(
    state,
    artifactPath,
    args.node.id,
    args.nodeRun.nodeRunId,
    args.nodeRun.workflowRunId,
  ));
}

function findOrRegisterArtifact(
  state: LifecycleState,
  artifactPath: string,
  nodeId: string,
  nodeRunId: string,
  workflowRunId: string,
): ArtifactRef {
  const normalized = normalizeArtifactPath(artifactPath);
  const existing = state.artifacts.find(ref => ref.path === normalized);
  if (existing) return existing;
  return registerArtifact(state, {
    type: artifactTypeForPath(normalized),
    path: normalized,
    appId: appIdForArtifactPath(normalized),
    producerNodeRunId: nodeRunId,
    producerWorkflowRunId: workflowRunId,
    sourceType: sourceTypeForNode(nodeId),
    sourceId: nodeId,
    summary: normalized,
    metadata: { artifactId: deterministicArtifactId(state.runId, normalized) },
  });
}

function recordDomainFactsAfterNode(args: {
  state: LifecycleState;
  execution: ExecutionState;
  node: PipelineNode;
  outputArtifacts: string[];
  paths: RunPaths;
  now?: number;
}): void {
  if (args.node.id === 'upload-init') {
    recordKnowledgeInitialization(args.state, args.execution, args.paths);
  }
  if (args.node.id === 'mrd-render') {
    recordFanout(args.state, args.execution, args.paths);
  }
  if (args.node.id === 'execute-integration-tests') {
    recordDeploymentAndIntegrationTesting(args.state, args.execution, args.paths, args.outputArtifacts, args.now);
  }
  if (args.node.id === 'archive') {
    const evidenceArtifactIds = args.state.testRuns.flatMap(testRun => [
      ...testRun.artifactIds,
      ...testRun.evidenceArtifactIds,
    ]);
    const knowledgeDeltaRefs = createTestingKnowledgeDeltaCandidates({
      state: args.state,
      appIds: args.state.apps.filter(app => app.role !== 'excluded').map(app => app.appId),
      evidenceArtifactIds,
      summary: 'Archive-time integration testing discoveries and lifecycle evidence.',
    }).map(delta => writeKnowledgeDeltaArtifact({
      paths: args.paths,
      state: args.state,
      delta,
    }));
    const readiness = checkArchiveReadiness(args.state);
    const report = generateArchiveReport(args.state, readiness);
    const archive = recordArchive({
      paths: args.paths,
      state: args.state,
      report,
      knowledgeDeltaRefs,
      archivedAt: args.now,
    });
    appendLifecycleEvent(args.state, {
      type: 'archive_recorded',
      data: {
        archiveId: archive.archiveId,
        readiness,
      },
      now: args.now,
    });
  }
}

function recordKnowledgeInitialization(
  state: LifecycleState,
  execution: ExecutionState,
  paths: RunPaths,
): void {
  const capabilities = inspectExternalCapabilityImports(process.cwd());
  state.metadata = {
    ...state.metadata,
    externalCapabilities: capabilities,
  };
  const apps = (execution.projects ?? []).map(project => ({
    appId: project.name,
    name: project.name,
    root: project.root,
    summary: `Application ${project.name} detected during upload initialization.`,
    architectureNotes: ['Initialized from uploaded project manifest.'],
  }));
  const missing = apps.filter(app =>
    !state.artifacts.some(ref => ref.appId === app.appId && ref.type === 'app-knowledge-summary')
  );
  if (missing.length) {
    initializeApplicationKnowledgeArtifacts({ paths, state, apps: missing });
  }
  if (!state.artifacts.some(ref => ref.type === 'app-knowledge-gitnexus-graph' && ref.path?.endsWith('global-graph.json'))) {
    const graph = buildLocalGitNexusGraph({ paths, state });
    appendLifecycleEvent(state, {
      type: 'artifact_registered',
      artifactId: graph.graphRef.artifactId,
      data: { type: graph.graphRef.type, path: graph.graphRef.path },
    });
  }
  if (!state.artifacts.some(ref => ref.type === 'knowledge-vector-index')) {
    const vector = buildLocalVectorIndex({ paths, state });
    appendLifecycleEvent(state, {
      type: 'artifact_registered',
      artifactId: vector.indexRef.artifactId,
      data: { type: vector.indexRef.type, path: vector.indexRef.path },
    });
  }
  const repositories = createHarnessRepositoryRefs({ paths, state, capabilities });
  const repositoryIndexPath = path.join(paths.artifactsDir, 'runtime', 'repositories.json');
  fs.mkdirSync(path.dirname(repositoryIndexPath), { recursive: true });
  fs.writeFileSync(repositoryIndexPath, JSON.stringify({
    source: capabilities.harness.available ? 'local-git' : 'local',
    integrationFiles: capabilities.harness.sourceFiles,
    repositories,
  }, null, 2), 'utf-8');
  registerArtifact(state, {
    type: 'repository-index',
    path: 'artifacts/runtime/repositories.json',
    sourceType: 'runtime',
    summary: 'Repository refs mapped from product-scoped local Git integration.',
    metadata: {
      integrationSource: capabilities.harness.sourceFiles,
    },
  });
}

function recordFanout(
  state: LifecycleState,
  execution: ExecutionState,
  paths: RunPaths,
): void {
  if (state.artifacts.some(ref => ref.type === 'fanout-decision')) return;
  const query = readText(path.join(paths.artifactsDir, 'mrd-clarified.md')) ?? execution.description ?? execution.name;
  const applications = (execution.projects ?? []).map(project => ({
    appId: project.name,
    name: project.name,
    root: project.root,
    keywords: [project.name, path.basename(project.root)],
    capabilities: ['uploaded-project'],
  }));
  const recall = recallFanoutCandidates({
    requirementId: state.requirementId,
    runId: state.runId,
    query,
    applications,
    vectorHits: loadLocalVectorIndex(paths)
      ? queryLocalVectorIndex(loadLocalVectorIndex(paths)!, query)
      : undefined,
    graphEdges: loadLocalGitNexusGraph(paths)
      ? graphEdgesForFanout(loadLocalGitNexusGraph(paths)!)
      : undefined,
  });
  const existingDecision = readJson<{
    includedProjects?: Array<{ name: string }>;
    excludedProjects?: Array<{ name: string; reason?: string }>;
  }>(path.join(paths.artifactsDir, 'fanout-decision.json'));
  const adjustments = [
    ...(existingDecision?.includedProjects ?? []).map(project => ({
      appId: project.name,
      role: 'primary' as const,
      reason: 'Included by pipeline fanout decision.',
    })),
    ...(existingDecision?.excludedProjects ?? []).map(project => ({
      appId: project.name,
      role: 'excluded' as const,
      reason: project.reason ?? 'Excluded by pipeline fanout decision.',
    })),
  ];
  const decision = applyFanoutAdjustments(recall, adjustments);
  const refs = writeFanoutLifecycleArtifacts({
    paths,
    state,
    recall,
    decision,
  });
  state.apps = state.apps.map(app => ({
    ...app,
    role: decision.primaryApps.includes(app.appId)
      ? 'primary'
      : decision.secondaryApps.includes(app.appId)
      ? 'secondary'
      : decision.testOnlyApps.includes(app.appId)
      ? 'test-only'
      : decision.excludedApps.some(excluded => excluded.appId === app.appId)
      ? 'excluded'
      : app.role,
  }));
  for (const ref of [refs.recallRef, refs.decisionRef, refs.evidenceRef]) {
    appendLifecycleEvent(state, {
      type: 'artifact_registered',
      artifactId: ref.artifactId,
      data: { type: ref.type, path: ref.path },
    });
  }
}

function recordDeploymentAndIntegrationTesting(
  state: LifecycleState,
  execution: ExecutionState,
  paths: RunPaths,
  outputArtifacts: string[],
  now?: number,
): void {
  if (state.testRuns.some(testRun => testRun.testRunId === `integration-${state.runId}-v${state.deploymentSets.length || 1}`)) {
    return;
  }
  const apps = state.apps.filter(app => app.role !== 'excluded');
  const primaryApps = apps.filter(app => app.role === 'primary').map(app => app.appId);
  const secondaryApps = apps.filter(app => app.role === 'secondary').map(app => app.appId);
  const testOnlyApps = apps.filter(app => app.role === 'test-only').map(app => app.appId);
  const buildRefs = apps.map(app => ({
    appId: app.appId,
    branchName: app.branchName ?? `feature/${state.requirementId}/${app.appId}`,
    repoRef: app.repoRef,
    pipelineRunId: `local-pipeline-${state.runId}-${safeSegment(app.appId)}`,
  }));
  const environmentPlan = createEnvironmentPlan({
    state,
    primaryApps,
    secondaryApps,
    testOnlyApps,
    buildRefs,
    sharedEnvironmentHealthy: true,
    now,
  });
  const environment: EnvironmentRef = {
    environmentId: `env-${state.runId}-v${state.deploymentSets.length + 1}`,
    requirementId: state.requirementId,
    runId: state.runId,
    mode: environmentPlan.mode,
    baseUrl: `local://${state.runId}`,
    metadata: {
      source: 'pipeline-bridge',
      harnessIntegration: inspectExternalCapabilityImports(process.cwd()).harness.sourceFiles,
    },
  };
  const capabilities = inspectExternalCapabilityImports(process.cwd());
  const pipelineRuns: PipelineRunRef[] = buildRefs.map(ref => ({
    pipelineRunId: ref.pipelineRunId,
    requirementId: state.requirementId,
    runId: state.runId,
    appId: ref.appId,
    branchName: ref.branchName,
    status: 'succeeded',
    provider: capabilities.harness.available ? 'harness-ts' : 'local-script',
    artifactIds: [],
    startedAt: now ?? Date.now(),
    completedAt: now ?? Date.now(),
  }));
  for (const pipelineRun of pipelineRuns) {
    state.ciRuns = [
      ...state.ciRuns.filter(existing => existing.pipelineRunId !== pipelineRun.pipelineRunId),
      pipelineRun,
    ];
  }
  const deploymentSet = createRequirementDeploymentSet({
    state,
    environmentId: environment.environmentId,
    apps: buildRefs,
    artifactIds: outputArtifacts
      .map(artifactPath => state.artifacts.find(ref => ref.path === normalizeArtifactPath(artifactPath))?.artifactId)
      .filter((artifactId): artifactId is string => Boolean(artifactId)),
    now,
  });
  const deploymentRefs = registerDeploymentArtifacts({
    paths,
    state,
    environmentPlan,
    deploymentSet,
    environmentRefs: [environment],
  });
  deploymentSet.artifactIds = [
    ...deploymentSet.artifactIds,
    deploymentRefs.environmentPlanRef.artifactId,
    deploymentRefs.deploymentSetRef.artifactId,
  ];
  appendLifecycleEvent(state, {
    type: 'deployment_recorded',
    data: {
      deploymentSetId: deploymentSet.deploymentSetId,
      environmentId: environment.environmentId,
      appIds: deploymentSet.appIds,
    },
    now,
  });

  const fanoutDecision = {
    schemaVersion: 1 as const,
    requirementId: state.requirementId,
    runId: state.runId,
    primaryApps,
    secondaryApps,
    testOnlyApps,
    excludedApps: state.apps
      .filter(app => app.role === 'excluded')
      .map(app => ({ appId: app.appId, reason: 'Excluded by lifecycle fanout decision.' })),
    evidence: [],
    generatedAt: new Date(now ?? Date.now()).toISOString(),
  };
  const integrationInput = assembleIntegrationTestingInput({
    state,
    fanoutDecision,
    environmentPlan,
    deploymentSet,
  });
  const testRunId = `integration-${state.runId}-v${deploymentSet.version}`;
  const dataPlan = createDataPlan({
    input: integrationInput,
    environmentId: environment.environmentId,
    testRunId,
  });
  const testCases = generateIntegrationTestCases(integrationInput);
  const enhancedDataPlan = enhanceDataPlanWithTestingReference({
    dataPlan,
    testCases,
    state,
    capabilities,
  });
  const scripts = generateIntegrationTestScripts(testCases);
  const crossAppStatus = readCrossAppStatus(paths);
  const testingRefs = writeIntegrationTestingArtifacts({
    paths,
    state,
    dataPlan: enhancedDataPlan,
    testCases,
    scripts,
    report: renderIntegrationReport(testRunId, crossAppStatus),
  });
  const testRun = recordIntegrationTestRun({
    state,
    testRunId,
    deploymentSetId: deploymentSet.deploymentSetId,
    environmentId: environment.environmentId,
    status: crossAppStatus === 'blocked' ? 'failed' : 'passed',
    artifactIds: [
      testingRefs.dataPlanRef.artifactId,
      testingRefs.testCaseRef.artifactId,
      ...testingRefs.scriptRefs.map(ref => ref.artifactId),
      testingRefs.reportRef.artifactId,
    ],
    evidenceArtifactIds: outputArtifacts
      .map(artifactPath => state.artifacts.find(ref => ref.path === normalizeArtifactPath(artifactPath))?.artifactId)
      .filter((artifactId): artifactId is string => Boolean(artifactId)),
  });
  appendLifecycleEvent(state, {
    type: 'test_run_recorded',
    data: {
      testRunId: testRun.testRunId,
      status: testRun.status,
      deploymentSetId: testRun.deploymentSetId,
    },
    now,
  });
  if (testRun.status === 'failed') {
    recordFailureDiagnosis(state, 'Cross-application test was blocked.', testRun.testRunId, now);
  }
}

function recordFailureDiagnosis(
  state: LifecycleState,
  error: string,
  testRunId?: string,
  now?: number,
): void {
  const aiOpsClassification = classifyWithAiOpsReference(error);
  const classification = createFailureClassification({
    state,
    category: aiOpsClassification.category,
    confidence: aiOpsClassification.confidence,
    rootCauseCandidates: [`${error} (matched ${aiOpsClassification.matchedRule})`],
    evidenceArtifactIds: [],
  });
  const diagnosis = recordDiagnosis({
    state,
    classification,
    testRunId,
  });
  appendLifecycleEvent(state, {
    type: 'diagnosis_recorded',
    data: {
      diagnosisId: diagnosis.diagnosisId,
      category: diagnosis.category,
      confidence: diagnosis.confidence,
    },
    now,
  });
}

function syncAppsFromExecution(state: LifecycleState, execution: ExecutionState): void {
  const existing = new Map(state.apps.map(app => [app.appId, app]));
  state.apps = (execution.projects ?? state.apps.map(app => ({
    name: app.appId,
    root: app.repoRef ?? '',
    branchId: app.branchName,
    status: 'pending' as const,
    retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 },
  }))).map(project => {
    const previous = existing.get(project.name);
    return {
      appId: project.name,
      role: previous?.role ?? 'primary',
      status: appStatusForProject(project.status),
      repoRef: project.root,
      branchName: project.branchId ?? previous?.branchName,
      artifactIds: previous?.artifactIds ?? [],
      ciRunIds: previous?.ciRunIds ?? [],
      testRunIds: previous?.testRunIds ?? [],
    };
  });
}

function inferInputArtifactIds(state: LifecycleState, nodeId: string): string[] {
  if (nodeId === 'upload-init') return [];
  return state.artifacts
    .filter(ref => ref.producerNodeRunId)
    .slice(-12)
    .map(ref => ref.artifactId);
}

function workflowRunIdFor(execution: ExecutionState): string {
  return `${execution.runId}-${String(execution.metadata?.workflowId ?? WORKFLOW_ID)}`;
}

function nodeRunIdFor(execution: ExecutionState, nodeId: string): string {
  return `${workflowRunIdFor(execution)}-${nodeId}`;
}

function requirementIdFor(execution: ExecutionState): string {
  return String(execution.metadata?.requirementId ?? execution.runId);
}

function workflowStatusForExecution(execution: ExecutionState): WorkflowRun['status'] {
  switch (execution.status) {
    case 'running':
      return 'running';
    case 'waiting_confirmation':
      return 'waiting_approval';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'idle':
    case 'suspended':
    default:
      return 'pending';
  }
}

function nodeRunStatusForNode(status: NodeState['status']): NodeRunStatus {
  switch (status) {
    case 'running':
      return 'running';
    case 'waiting_confirmation':
      return 'waiting_approval';
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'skipped':
      return 'skipped';
    case 'interrupted':
    case 'suspended':
      return 'cancelled';
    case 'pending':
    case 'waiting_fix':
    default:
      return 'pending';
  }
}

function appStatusForProject(status: string): LifecycleState['apps'][number]['status'] {
  switch (status) {
    case 'running':
      return 'implementing';
    case 'completed':
      return 'passed';
    case 'failed':
    case 'waiting_fix':
    case 'interrupted':
    case 'suspended':
      return 'failed';
    case 'pending':
    default:
      return 'pending';
  }
}

function inferPhase(nodeId?: string): LifecyclePhase {
  if (!nodeId) return 'created';
  if (nodeId === 'mrd-render') return 'fanout';
  if (nodeId === 'implementation-plan' || nodeId === 'spec-generate') return 'planning';
  if (nodeId === 'java-impl' || nodeId === 'testcode-generate') return 'implementation';
  if (isPipelineTestingNode(nodeId)) return 'testing';
  if (nodeId === 'archive') return 'archive';
  return 'created';
}

function gateTypeForNode(nodeId: string): ApprovalGateType | undefined {
  if (nodeId === 'mrd-render') return 'requirement_clarification';
  if (nodeId === 'implementation-plan') return 'technical_design';
  if (nodeId === 'testcode-generate' || nodeId === 'execute-integration-tests') return 'pre_test_environment_code_review';
  return undefined;
}

function sourceTypeForNode(nodeId: string): 'agent' | 'workflow' | 'runtime' | 'testing' {
  if (isPipelineTestingNode(nodeId)) return 'testing';
  if (nodeId === 'archive' || nodeId === 'upload-init') return 'workflow';
  return 'agent';
}

function isPipelineTestingNode(nodeId?: string): boolean {
  return Boolean(nodeId && [
    'integration-test-cases',
    'test-data-plan',
    'integration-test-code',
    'deploy-related-apps',
    'execute-integration-tests',
    'cross-app-test',
  ].includes(nodeId));
}

function artifactTypeForPath(artifactPath: string): string {
  const file = path.basename(artifactPath).toLowerCase();
  if (file.includes('fanout')) return 'fanout-decision';
  if (file.includes('tech-design')) return 'technical-design';
  if (file.includes('review')) return 'code-review';
  if (file.includes('test')) return 'test-artifact';
  if (file.includes('archive')) return 'archive-artifact';
  if (file.includes('manifest')) return 'manifest';
  return 'pipeline-artifact';
}

function appIdForArtifactPath(artifactPath: string): string | undefined {
  const parts = artifactPath.split('/');
  if (parts[0] !== 'artifacts' || parts.length < 3) return undefined;
  const first = parts[1];
  if (['fanout', 'deployment', 'testing', 'archive', 'cross-app', 'downloads', 'knowledge'].includes(first)) return undefined;
  return first;
}

function normalizeArtifactPath(artifactPath: string): string {
  const normalized = artifactPath.replace(/\\/g, '/');
  return normalized.startsWith('artifacts/') ? normalized : `artifacts/${normalized}`;
}

function deterministicArtifactId(runId: string, artifactPath: string): string {
  return `artifact_${safeSegment(runId)}_${safeSegment(artifactPath).slice(0, 120)}`;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

function readText(file: string): string | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return undefined;
  }
}

function readJson<T>(file: string): T | undefined {
  try {
    if (!fs.existsSync(file)) return undefined;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return undefined;
  }
}

function readCrossAppStatus(paths: RunPaths): 'approved' | 'blocked' {
  const parsed = readJson<{ status?: string }>(path.join(paths.artifactsDir, 'cross-app/test-results.json'));
  return parsed?.status === 'blocked' ? 'blocked' : 'approved';
}

function renderIntegrationReport(testRunId: string, status: 'approved' | 'blocked'): string {
  return [
    '# Integration Test Report',
    '',
    `Test Run: ${testRunId}`,
    `Status: ${status === 'blocked' ? 'failed' : 'passed'}`,
    '',
    status === 'blocked'
      ? 'Cross-application validation reported blocked delivery metadata.'
      : 'Cross-application validation completed with approved delivery metadata.',
  ].join('\n');
}
