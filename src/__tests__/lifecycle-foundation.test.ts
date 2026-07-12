import * as assert from 'assert/strict';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import test from 'node:test';
import {
  appendLifecycleEvent,
  CONDITIONAL_APPROVAL_GATES,
  attachLifecycleReferenceToExecutionState,
  createConditionalApprovalGate,
  createEmptyLifecycleState,
  createFixedApprovalGate,
  deriveLifecycleStateFromExecutionState,
  buildPendingConfirmationReadModel,
  buildLifecycleReadModel,
  FIXED_APPROVAL_GATES,
  getLifecycleStatePath,
  applyFanoutAdjustments,
  recallFanoutCandidates,
  getNodeRunPath,
  getWorkflowRunPath,
  loadNodeRun,
  loadLifecycleState,
  loadWorkflowRun,
  createKnowledgeDelta,
  evaluateKnowledgeFreshness,
  initializeApplicationKnowledgeArtifacts,
  createFeatureBranchName,
  ensureReferenceImportLayout,
  persistNodeRun,
  persistWorkflowRun,
  registerArtifact,
  resolveApprovalGate,
  saveLifecycleState,
  writeFanoutLifecycleArtifacts,
  writeKnowledgeDeltaArtifact,
  HarnessReferenceRepositoryManager,
  LocalRepositoryManager,
  LocalScriptPipelineRuntime,
  createEnvironmentPlan,
  createRequirementDeploymentSet,
  registerDeploymentArtifacts,
  assembleIntegrationTestingInput,
  createDataPlan,
  createTestingKnowledgeDeltaCandidates,
  generateIntegrationTestCases,
  generateIntegrationTestScripts,
  recordIntegrationTestRun,
  writeIntegrationTestingArtifacts,
  appendRerunFacts,
  canAutoRepairCode,
  collectFailureEvidence,
  completeFixCycle,
  createFailureClassification,
  createFixCycle,
  recordDiagnosis,
  applyKnowledgeDeltas,
  checkArchiveReadiness,
  generateArchiveReport,
  recordArchive,
  classifyWithAiOpsReference,
  createHarnessRepositoryRefs,
  enhanceDataPlanWithTestingReference,
  inspectExternalCapabilityImports,
  validateReferenceImportsAreIsolated,
} from '../lifecycle/index.js';
import {
  buildLocalGitNexusGraph,
  buildLocalVectorIndex,
  graphEdgesForFanout,
  queryLocalVectorIndex,
} from '../tools/knowledge/knowledgeGraph.js';
import { ensureRunDirectories } from '../runtime/paths.js';
import {
  ensurePipelineLifecycleForExecution,
  recordPipelineLifecycleNodeCompleted,
  recordPipelineLifecycleNodeStarted,
} from '../workflows/runtime/pipelineLifecycleBridge.js';
import { analyzeGitNexusRepository } from '../integrations/gitnexus.js';
import type { ExecutionState } from '../persistence/executionTypes.js';

test('lifecycle state persists under artifacts/lifecycle-state.json', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-lifecycle',
    runId: 'lifecycle-foundation-persist',
    now: 1000,
  });

  saveLifecycleState(state);

  const file = getLifecycleStatePath(state.runId);
  assert.equal(file.endsWith('artifacts/lifecycle-state.json'), true);
  assert.equal(fs.existsSync(file), true);
  const loaded = loadLifecycleState(state.runId);
  assert.equal(loaded?.requirementId, 'req-lifecycle');
  assert.equal(loaded?.schemaVersion, 1);
});

test('artifact and lifecycle event helpers attach traceable metadata', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-artifacts',
    runId: 'lifecycle-foundation-artifacts',
    apps: [{
      appId: 'marketing',
      role: 'primary',
      status: 'pending',
      artifactIds: [],
      ciRunIds: [],
      testRunIds: [],
    }],
    now: 1000,
  });

  const artifact = registerArtifact(state, {
    type: 'technical-design',
    path: 'artifacts/marketing/tech-design.md',
    appId: 'marketing',
    producerWorkflowRunId: 'wf-1',
    producerNodeRunId: 'node-1',
    sourceType: 'agent',
    sourceId: 'agent-1',
    summary: 'Marketing technical design',
    metadata: { artifactId: 'artifact-tech-design' },
    now: 1001,
  });
  const event = appendLifecycleEvent(state, {
    type: 'artifact_registered',
    workflowRunId: 'wf-1',
    nodeRunId: 'node-1',
    artifactId: artifact.artifactId,
    now: 1002,
  });

  assert.equal(artifact.artifactId, 'artifact-tech-design');
  assert.equal(state.artifacts.length, 1);
  assert.deepEqual(state.apps[0].artifactIds, ['artifact-tech-design']);
  assert.equal(event.type, 'artifact_registered');
  assert.equal(state.events[0].artifactId, 'artifact-tech-design');
});

test('execution state can be migrated to lifecycle snapshot and reference', () => {
  const execution: ExecutionState = {
    runId: 'legacy-run',
    name: 'Legacy Run',
    status: 'waiting_confirmation',
    currentNodeIndex: 1,
    currentNodeId: 'implementation-plan-confirmation',
    nodes: [
      { id: 'upload-init', name: 'Upload', status: 'completed', failureCount: 0 },
      { id: 'implementation-plan-confirmation', name: 'Confirm', status: 'waiting_confirmation', failureCount: 0 },
    ],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: 1000,
    updatedAt: 1000,
    projects: [{
      name: 'marketing',
      root: '/tmp/marketing',
      status: 'running',
      retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 },
    }],
    metadata: { requirementId: 'req-legacy', workflowId: 'mrd-to-code' },
  };

  const lifecycle = deriveLifecycleStateFromExecutionState(execution, { now: 2000 });
  const referenced = attachLifecycleReferenceToExecutionState(execution);

  assert.equal(lifecycle.requirementId, 'req-legacy');
  assert.equal(lifecycle.status, 'waiting_approval');
  assert.equal(lifecycle.workflowRuns[0].workflowId, 'mrd-to-code');
  assert.equal(lifecycle.nodeRuns[1].status, 'waiting_approval');
  assert.equal(lifecycle.apps[0].appId, 'marketing');
  assert.equal(lifecycle.events[0].type, 'state_migrated');
  assert.deepEqual(referenced.metadata?.lifecycle, {
    statePath: 'artifacts/lifecycle-state.json',
    schemaVersion: 1,
  });
});

test('workflow and node run records persist separately and update lifecycle refs', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-run-records',
    runId: 'lifecycle-foundation-run-records',
    now: 1000,
  });

  persistWorkflowRun(state, {
    workflowRunId: 'workflow-1',
    requirementId: state.requirementId,
    runId: state.runId,
    workflowId: 'full-lifecycle',
    status: 'running',
    nodeRunIds: ['node-1'],
    inputArtifactIds: ['artifact-input'],
    outputArtifactIds: [],
    traceId: 'trace-1',
    startedAt: 1001,
  });
  persistNodeRun(state, {
    nodeRunId: 'node-1',
    requirementId: state.requirementId,
    runId: state.runId,
    workflowRunId: 'workflow-1',
    nodeId: 'technical-design-confirmation',
    status: 'failed',
    inputArtifactIds: ['artifact-input'],
    outputArtifactIds: ['artifact-output'],
    startedAt: 1002,
    completedAt: 1003,
    error: {
      message: 'approval timed out',
      code: 'APPROVAL_TIMEOUT',
      recoverable: true,
    },
    rerunOfNodeRunId: 'node-0',
  });

  assert.equal(fs.existsSync(getWorkflowRunPath(state.runId, 'workflow-1')), true);
  assert.equal(fs.existsSync(getNodeRunPath(state.runId, 'node-1')), true);
  assert.equal(loadWorkflowRun(state.runId, 'workflow-1')?.traceId, 'trace-1');
  assert.equal(loadNodeRun(state.runId, 'node-1')?.error?.recoverable, true);
  assert.equal(state.activeWorkflowRunId, 'workflow-1');
  assert.equal(state.workflowRuns[0].status, 'running');
  assert.equal(state.nodeRuns[0].status, 'failed');
});

test('approval gates update lifecycle state and append audit events', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-approval',
    runId: 'lifecycle-foundation-approval',
    workflowRuns: [{
      workflowRunId: 'workflow-1',
      workflowId: 'full-lifecycle',
      status: 'running',
    }],
    nodeRuns: [{
      nodeRunId: 'node-1',
      workflowRunId: 'workflow-1',
      nodeId: 'technical-design-confirmation',
      status: 'running',
    }],
    now: 1000,
  });

  assert.ok(FIXED_APPROVAL_GATES.includes('technical_design'));
  assert.ok(CONDITIONAL_APPROVAL_GATES.includes('shared_environment_deployment'));

  const fixedGate = createFixedApprovalGate(state, {
    workflowRunId: 'workflow-1',
    nodeRunId: 'node-1',
    gateType: 'technical_design',
    artifactIds: ['artifact-design'],
    now: 1001,
  });
  const conditionalGate = createConditionalApprovalGate(state, {
    workflowRunId: 'workflow-1',
    nodeRunId: 'node-1',
    gateType: 'shared_environment_deployment',
    riskIds: ['risk-shared-db'],
    now: 1002,
  });

  assert.equal(state.status, 'waiting_approval');
  assert.equal(state.nodeRuns[0].status, 'waiting_approval');
  assert.equal(state.approvals.length, 2);
  assert.equal(state.events.filter(event => event.type === 'approval_waiting').length, 2);

  const resolved = resolveApprovalGate(state, {
    approvalGateId: fixedGate.approvalGateId,
    decision: 'approved',
    resolvedBy: 'xu',
    decisionReason: 'design accepted',
    feedback: 'continue',
    now: 1003,
  });
  resolveApprovalGate(state, {
    approvalGateId: conditionalGate.approvalGateId,
    decision: 'needs_changes',
    resolvedBy: 'xu',
    decisionReason: 'use isolated namespace',
    now: 1004,
  });

  assert.equal(resolved.status, 'resolved');
  assert.equal(resolved.decision, 'approved');
  assert.equal(state.status, 'active');
  assert.equal(state.events.filter(event => event.type === 'approval_resolved').length, 2);
});

test('lifecycle read model exposes pending confirmation with artifact refs', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-read-model',
    runId: 'lifecycle-foundation-read-model',
    nodeRuns: [{
      nodeRunId: 'node-run-1',
      workflowRunId: 'workflow-1',
      nodeId: 'implementation-plan-confirmation',
      status: 'running',
    }],
    now: 1000,
  });
  const artifact = registerArtifact(state, {
    type: 'technical-design',
    path: 'artifacts/project/tech-design.md',
    sourceType: 'agent',
    metadata: { artifactId: 'artifact-design' },
    now: 1001,
  });
  createFixedApprovalGate(state, {
    nodeRunId: 'node-run-1',
    workflowRunId: 'workflow-1',
    gateType: 'technical_design',
    artifactIds: [artifact.artifactId],
    now: 1002,
  });
  saveLifecycleState(state);

  const pending = buildPendingConfirmationReadModel(state);
  const readModel = buildLifecycleReadModel(state.runId);

  assert.equal(pending?.nodeId, 'implementation-plan-confirmation');
  assert.equal(pending?.title, '技术方案确认');
  assert.equal(pending?.artifactPath, 'artifacts/project/tech-design.md');
  assert.equal(pending?.structuredPayload.source, 'lifecycle');
  assert.equal(readModel?.pendingConfirmation?.approvalGateId, pending?.approvalGateId);
});

test('fanout recall combines knowledge vector structured and graph signals', () => {
  const recall = recallFanoutCandidates({
    requirementId: 'req-fanout',
    runId: 'lifecycle-foundation-fanout',
    query: 'activity hit preview campaign admin',
    generatedAt: '2026-07-10T00:00:00.000Z',
    applications: [
      {
        appId: 'marketing',
        name: 'marketing',
        keywords: ['campaign', 'activity'],
        capabilities: ['activity hit preview'],
        apiRoutes: ['/api/campaign-hit-preview'],
      },
      {
        appId: 'marketing-admin',
        name: 'marketing admin',
        keywords: ['admin', 'campaign management'],
        dependencies: ['marketing'],
      },
      {
        appId: 'settlement',
        name: 'settlement',
        keywords: ['billing'],
      },
    ],
    vectorHits: [{ appId: 'marketing-admin', score: 0.72, evidence: 'semantic match to admin preview page' }],
    structuredHits: [{ appId: 'marketing', weight: 2, reason: 'API index matched campaign-hit-preview' }],
    graphEdges: [{ fromAppId: 'marketing', toAppId: 'marketing-admin', weight: 1.2, reason: 'admin calls marketing preview API' }],
  });
  const decision = applyFanoutAdjustments(recall, [
    { appId: 'marketing-admin', role: 'secondary', reason: 'admin only coordinates UI validation' },
  ]);

  assert.deepEqual(new Set(recall.candidates.map(candidate => candidate.appId)), new Set(['marketing', 'marketing-admin']));
  assert.ok(recall.candidates.find(candidate => candidate.appId === 'marketing')?.sources.includes('structured-index'));
  assert.ok(recall.candidates.find(candidate => candidate.appId === 'marketing-admin')?.sources.includes('vector'));
  assert.deepEqual(decision.primaryApps, ['marketing']);
  assert.deepEqual(decision.secondaryApps, ['marketing-admin']);
});

test('fanout artifacts are written and registered in lifecycle state', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-fanout-artifacts',
    runId: 'lifecycle-foundation-fanout-artifacts',
    now: 1000,
  });
  const recall = recallFanoutCandidates({
    requirementId: state.requirementId,
    runId: state.runId,
    query: 'campaign',
    applications: [{ appId: 'marketing', name: 'Marketing', keywords: ['campaign'] }],
    generatedAt: '2026-07-10T00:00:00.000Z',
  });
  const decision = applyFanoutAdjustments(recall);
  const refs = writeFanoutLifecycleArtifacts({
    paths: ensureRunDirectories(state.runId),
    state,
    recall,
    decision,
  });

  assert.equal(fs.existsSync('runtime-projects/runs/lifecycle-foundation-fanout-artifacts/artifacts/fanout/fanout-recall.json'), true);
  assert.equal(refs.recallRef.type, 'fanout-recall');
  assert.equal(refs.decisionRef.path, 'artifacts/fanout/fanout-decision.json');
  assert.equal(refs.evidenceRef.path, 'artifacts/fanout/fanout-evidence.md');
  assert.equal(state.artifacts.length, 3);
});

test('application knowledge initialization freshness and delta artifacts are traceable', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-knowledge',
    runId: 'lifecycle-foundation-knowledge',
    apps: [{
      appId: 'marketing',
      role: 'primary',
      status: 'pending',
      artifactIds: [],
      ciRunIds: [],
      testRunIds: [],
    }],
    now: 1000,
  });
  const paths = ensureRunDirectories(state.runId);
  const [init] = initializeApplicationKnowledgeArtifacts({
    paths,
    state,
    apps: [{
      appId: 'marketing',
      name: 'Marketing',
      root: 'apps/marketing',
      summary: 'Marketing campaign service',
      apiRoutes: ['/api/campaign-hit-preview'],
      dbTables: ['campaign'],
      architectureNotes: ['Node service'],
      gitNexusNodes: [{ id: 'MarketingService', kind: 'class', label: 'MarketingService' }],
    }],
  });
  const fresh = evaluateKnowledgeFreshness({
    appId: 'marketing',
    lastUpdatedAt: 1000,
    now: 1500,
    staleAfterMs: 1000,
  });
  const stale = evaluateKnowledgeFreshness({
    appId: 'marketing',
    lastUpdatedAt: 1000,
    now: 2501,
    staleAfterMs: 1000,
  });
  const delta = createKnowledgeDelta({
    state,
    appId: 'marketing',
    changeTypes: ['api'],
    evidenceArtifactIds: [init.artifactRefs[1].artifactId],
    summary: 'Added campaign hit preview API knowledge.',
    rollbackRef: 'patch-rollback',
    now: 2000,
  });
  const deltaRef = writeKnowledgeDeltaArtifact({ paths, state, delta });

  assert.equal(init.artifactRefs.length, 5);
  assert.equal(fresh.status, 'fresh');
  assert.equal(stale.status, 'stale');
  assert.equal(stale.lazyRefreshRecommended, true);
  assert.equal(delta.risk, 'high');
  assert.equal(deltaRef.type, 'knowledge-delta');
  assert.ok(state.apps[0].artifactIds.includes(init.artifactRefs[0].artifactId));
});

test('repository and local runtime contracts preserve lifecycle refs', async () => {
  const root = fs.mkdtempSync('runtime-projects/lifecycle-repository-');
  const created = ensureReferenceImportLayout(root);
  const isolation = validateReferenceImportsAreIsolated(root);
  const repoRoot = `${root}/apps/marketing`;
  fs.mkdirSync(repoRoot, { recursive: true });
  initializeGitRepository(repoRoot);
  const repoManager = new LocalRepositoryManager([{
    repoId: 'repo-marketing',
    name: 'marketing',
    root: repoRoot,
    provider: 'local',
    appId: 'marketing',
  }]);
  const repo = await repoManager.findRepositoryByApp('marketing');
  const branch = await repoManager.ensureBranch({
    repoId: 'repo-marketing',
    requirementId: 'REQ 2026 Activity',
    appId: 'marketing',
    baseBranch: 'main',
  });
  const checkout = await repoManager.checkout({
    repoId: 'repo-marketing',
    branchName: branch.branchName,
    localPath: `${root}/workspace/marketing`,
  });
  const update = await repoManager.updateFiles({
    repoId: 'repo-marketing',
    branchName: branch.branchName,
    files: [{ path: 'README.md', content: '# Marketing' }],
  });
  const harnessRepoManager = new HarnessReferenceRepositoryManager({
    referenceRoot: 'src/integrations/harness.ts',
    repositories: [{ appId: 'marketing', name: 'marketing', root: repoRoot }],
  });
  const harnessRepo = await harnessRepoManager.findRepositoryByApp('marketing');
  const harnessBranch = await harnessRepoManager.ensureBranch({
    repoId: harnessRepo!.repoId,
    requirementId: 'REQ 2026 Activity',
    appId: 'marketing',
  });
  const harnessCheckout = await harnessRepoManager.checkout({
    repoId: harnessRepo!.repoId,
    branchName: harnessBranch.branchName,
    localPath: `${root}/workspace/harness-marketing`,
  });
  const state = createEmptyLifecycleState({
    requirementId: 'req-runtime',
    runId: 'lifecycle-foundation-runtime',
    now: 1000,
  });
  const runtime = new LocalScriptPipelineRuntime();
  const pipelineRun = await runtime.startPipeline({
    requirementId: state.requirementId,
    runId: state.runId,
    appId: 'marketing',
    repoRef: repo!,
    branchRef: branch,
  });
  const logs = await runtime.collectLogs(pipelineRun.pipelineRunId, state);
  const environment = await runtime.resolveEnvironment(pipelineRun.pipelineRunId);
  const rerun = await runtime.rerunPipeline(pipelineRun.pipelineRunId);

  assert.deepEqual(created, [
    'src/tools/testing/dataPlan.ts',
    'src/tools/testing/opsFailureClassifier.ts',
    'src/integrations/harness.ts',
  ]);
  assert.equal(isolation.valid, true);
  assert.equal(createFeatureBranchName('REQ 2026 Activity', 'marketing'), 'feature/req-2026-activity/marketing');
  assert.equal(branch.branchName, 'feature/req-2026-activity/marketing');
  assert.equal(harnessRepo?.provider, 'local-git');
  assert.match(harnessRepo?.accessRef ?? '', /src\/integrations\/harness.ts#LocalGitProvider/);
  assert.equal(harnessBranch.branchName, 'feature/req-2026-activity/marketing');
  assert.equal(fs.existsSync(harnessCheckout.localPath), true);
  assert.equal(fs.existsSync(checkout.localPath), true);
  assert.deepEqual(update.changedPaths, ['README.md']);
  assert.equal(pipelineRun.provider, 'local-script');
  assert.equal(environment?.mode, 'local-simulated');
  assert.equal(logs[0].type, 'ci-log');
  assert.ok(rerun.pipelineRunId.includes('-rerun-'));
});

test('environment planning and deployment sets are versioned artifacts', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-deploy',
    runId: 'lifecycle-foundation-deploy',
    now: 1000,
  });
  const paths = ensureRunDirectories(state.runId);
  const plan = createEnvironmentPlan({
    state,
    primaryApps: ['marketing'],
    secondaryApps: ['marketing-admin'],
    testOnlyApps: ['settlement'],
    buildRefs: [
      {
        appId: 'marketing',
        branchName: 'feature/req-deploy/marketing',
        pipelineRunId: 'pipe-1',
        imageTag: 'marketing:req-deploy',
      },
    ],
    sharedEnvironmentHealthy: true,
    now: 1001,
  });
  const firstSet = createRequirementDeploymentSet({
    state,
    environmentId: 'env-1',
    apps: [{ appId: 'marketing', branchName: 'feature/req-deploy/marketing', pipelineRunId: 'pipe-1' }],
    now: 1002,
  });
  const secondSet = createRequirementDeploymentSet({
    state,
    environmentId: 'env-1',
    apps: [{ appId: 'marketing', branchName: 'feature/req-deploy/marketing', pipelineRunId: 'pipe-2' }],
    now: 1003,
  });
  const refs = registerDeploymentArtifacts({
    paths,
    state,
    environmentPlan: plan,
    deploymentSet: secondSet,
    environmentRefs: [{
      environmentId: 'env-1',
      requirementId: state.requirementId,
      runId: state.runId,
      mode: plan.mode,
      pipelineRunId: 'pipe-2',
    }],
  });

  assert.equal(plan.mode, 'shared-overlay');
  assert.equal(plan.primaryApps[0].deployStrategy, 'feature-version');
  assert.equal(plan.secondaryApps[0].deployStrategy, 'stable-version');
  assert.equal(firstSet.version, 1);
  assert.equal(secondSet.version, 2);
  assert.equal(state.deploymentSets.length, 2);
  assert.equal(state.environments[0].environmentId, 'env-1');
  assert.equal(refs.environmentPlanRef.type, 'environment-plan');
  assert.equal(refs.deploymentSetRef.path, 'artifacts/deployment/deployment-set-v2.json');
});

test('harness local Git manager reports real branch, head, and dirty files', async () => {
  fs.mkdirSync('runtime-projects', { recursive: true });
  const root = fs.mkdtempSync('runtime-projects/lifecycle-git-provider-');
  const repoRoot = `${root}/apps/marketing`;
  fs.mkdirSync(repoRoot, { recursive: true });
  initializeGitRepository(repoRoot);

  const repoManager = new HarnessReferenceRepositoryManager({
    referenceRoot: 'src/integrations/harness.ts',
    repositories: [{ appId: 'marketing', name: 'marketing', root: repoRoot, defaultBranch: 'main' }],
  });
  const repo = await repoManager.findRepositoryByApp('marketing');
  const initialStatus = await repoManager.getGitStatus!(repo!.repoId);
  const branch = await repoManager.ensureBranch({
    repoId: repo!.repoId,
    requirementId: 'REQ 2026 Activity',
    appId: 'marketing',
    baseBranch: 'main',
  });
  const update = await repoManager.updateFiles({
    repoId: repo!.repoId,
    branchName: branch.branchName,
    files: [{ path: 'src/feature.txt', content: 'feature enabled\n' }],
  });
  const status = await repoManager.getGitStatus!(repo!.repoId);

  assert.equal(repo?.provider, 'local-git');
  assert.equal(initialStatus.isGitRepo, true);
  assert.equal(initialStatus.currentBranch, 'main');
  assert.equal(branch.branchName, 'feature/req-2026-activity/marketing');
  assert.equal(status.currentBranch, 'feature/req-2026-activity/marketing');
  assert.equal(status.dirty, true);
  assert.ok(status.shortHeadSha);
  assert.deepEqual(update.changedPaths, ['src/feature.txt']);
  assert.deepEqual(status.changedFiles, ['src/feature.txt']);
});

test('integration testing inputs data plan test run and knowledge candidates are registered', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-testing',
    runId: 'lifecycle-foundation-testing',
    now: 1000,
  });
  registerArtifact(state, {
    type: 'app-knowledge-api-index',
    path: 'artifacts/knowledge/apps/marketing/api-index.md',
    appId: 'marketing',
    sourceType: 'workflow',
    metadata: { artifactId: 'artifact-api' },
  });
  registerArtifact(state, {
    type: 'app-knowledge-db-schema',
    path: 'artifacts/knowledge/apps/marketing/db-schema.md',
    appId: 'marketing',
    sourceType: 'workflow',
    metadata: { artifactId: 'artifact-db' },
  });
  const fanoutDecision = {
    schemaVersion: 1 as const,
    requirementId: state.requirementId,
    runId: state.runId,
    primaryApps: ['marketing'],
    secondaryApps: ['marketing-admin'],
    testOnlyApps: ['settlement'],
    excludedApps: [],
    evidence: ['marketing: API matched'],
    generatedAt: '2026-07-10T00:00:00.000Z',
  };
  const environmentPlan = createEnvironmentPlan({
    state,
    primaryApps: ['marketing'],
    secondaryApps: ['marketing-admin'],
    testOnlyApps: ['settlement'],
    buildRefs: [{ appId: 'marketing', branchName: 'feature/req-testing/marketing', pipelineRunId: 'pipe-1' }],
  });
  const deploymentSet = createRequirementDeploymentSet({
    state,
    environmentId: 'env-testing',
    apps: [{ appId: 'marketing', branchName: 'feature/req-testing/marketing', pipelineRunId: 'pipe-1' }],
  });
  const input = assembleIntegrationTestingInput({
    state,
    fanoutDecision,
    environmentPlan,
    deploymentSet,
  });
  const dataPlan = createDataPlan({ input, environmentId: 'env-testing', testRunId: 'test-run-1' });
  const testCases = generateIntegrationTestCases(input);
  const scripts = generateIntegrationTestScripts(testCases);
  const refs = writeIntegrationTestingArtifacts({
    paths: ensureRunDirectories(state.runId),
    state,
    dataPlan,
    testCases,
    scripts,
    report: '# Test Report\n\nPassed.',
  });
  const testRun = recordIntegrationTestRun({
    state,
    testRunId: 'test-run-1',
    deploymentSetId: deploymentSet.deploymentSetId,
    environmentId: 'env-testing',
    status: 'passed',
    artifactIds: [refs.reportRef.artifactId],
    evidenceArtifactIds: [refs.dataPlanRef.artifactId],
  });
  const deltas = createTestingKnowledgeDeltaCandidates({
    state,
    appIds: ['marketing'],
    evidenceArtifactIds: [refs.reportRef.artifactId],
    summary: 'Captured integration testing flow.',
  });

  assert.deepEqual(input.apiIndexArtifactIds, ['artifact-api']);
  assert.equal(dataPlan.steps[0].cleanup.includes('isolation key'), true);
  assert.equal(testCases[0].priority, 'p0');
  assert.equal(scripts[0].path, 'artifacts/testing/scripts/integration-primary-flow.spec.ts');
  assert.equal(testRun.status, 'passed');
  assert.equal(state.testRuns.length, 1);
  assert.equal(deltas[0].changeTypes[0], 'test');
});

test('failure diagnosis fix cycle and rerun facts preserve failed history', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-failure',
    runId: 'lifecycle-foundation-failure',
    now: 1000,
  });
  const report = registerArtifact(state, {
    type: 'integration-test-report',
    path: 'artifacts/testing/test-report.md',
    sourceType: 'testing',
    metadata: { artifactId: 'artifact-report' },
  });
  const log = registerArtifact(state, {
    type: 'ci-log',
    path: 'artifacts/runtime/pipe-1/ci-log.txt',
    sourceType: 'runtime',
    sourceId: 'pipe-1',
    metadata: { artifactId: 'artifact-log' },
  });
  state.testRuns.push({
    testRunId: 'test-run-1',
    requirementId: state.requirementId,
    runId: state.runId,
    deploymentSetId: 'deployment-set-v1',
    environmentId: 'env-1',
    status: 'failed',
    artifactIds: [report.artifactId],
    evidenceArtifactIds: [log.artifactId],
  });
  state.deploymentSets.push({
    deploymentSetId: 'deployment-set-v1',
    requirementId: state.requirementId,
    runId: state.runId,
    version: 1,
    environmentId: 'env-1',
    appIds: ['marketing'],
    pipelineRunIds: ['pipe-1'],
    artifactIds: [],
    createdAt: 1001,
  });

  const evidence = collectFailureEvidence({ state, testRunId: 'test-run-1', pipelineRunId: 'pipe-1' });
  const classification = createFailureClassification({
    state,
    category: 'CODE_BUG',
    confidence: 0.92,
    rootCauseCandidates: ['Null handling in preview mapper'],
    evidenceArtifactIds: evidence.map(item => item.artifactId),
  });
  const diagnosis = recordDiagnosis({
    state,
    classification,
    testRunId: 'test-run-1',
    pipelineRunId: 'pipe-1',
  });
  const fixCycle = createFixCycle({
    state,
    failureClassificationId: classification.failureClassificationId,
    failedDeploymentSetId: 'deployment-set-v1',
    failedTestRunId: 'test-run-1',
    owner: 'ai-coding',
    fixType: 'code-repair',
  });
  const nextDeploymentSet = {
    deploymentSetId: 'deployment-set-v2',
    requirementId: state.requirementId,
    runId: state.runId,
    version: 2,
    environmentId: 'env-1',
    appIds: ['marketing'],
    pipelineRunIds: ['pipe-2'],
    artifactIds: [],
    createdAt: 1002,
  };
  const nextTestRun = {
    testRunId: 'test-run-2',
    requirementId: state.requirementId,
    runId: state.runId,
    deploymentSetId: 'deployment-set-v2',
    environmentId: 'env-1',
    status: 'passed' as const,
    artifactIds: [],
    evidenceArtifactIds: [],
  };
  const rerun = appendRerunFacts({
    state,
    previousDeploymentSetId: 'deployment-set-v1',
    previousTestRunId: 'test-run-1',
    nextDeploymentSet,
    nextTestRun,
  });
  const completed = completeFixCycle({
    state,
    fixCycleId: fixCycle.fixCycleId,
    status: 'succeeded',
    nextDeploymentSetId: nextDeploymentSet.deploymentSetId,
    nextTestRunId: nextTestRun.testRunId,
  });

  assert.deepEqual(evidence.map(item => item.artifactId).sort(), ['artifact-log', 'artifact-report']);
  assert.equal(diagnosis.category, 'CODE_BUG');
  assert.equal(canAutoRepairCode(classification, { minimumCodeBugConfidence: 0.8, allowedCategories: ['CODE_BUG'] }), true);
  assert.equal(rerun.previousDeploymentSetId, 'deployment-set-v1');
  assert.equal(state.deploymentSets.some(item => item.deploymentSetId === 'deployment-set-v1'), true);
  assert.equal(state.deploymentSets.some(item => item.deploymentSetId === 'deployment-set-v2'), true);
  assert.equal(completed.status, 'succeeded');
});

test('archive readiness report and knowledge delta application distinguish risk', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-archive',
    runId: 'lifecycle-foundation-archive',
    now: 1000,
  });
  const lowRiskDelta = createKnowledgeDelta({
    state,
    appId: 'marketing',
    changeTypes: ['test'],
    evidenceArtifactIds: [],
    summary: 'Add test note.',
    now: 1001,
  });
  const highRiskDelta = createKnowledgeDelta({
    state,
    appId: 'marketing',
    changeTypes: ['api'],
    evidenceArtifactIds: [],
    summary: 'Add API note.',
    now: 1002,
  });
  const deltaRef = writeKnowledgeDeltaArtifact({
    paths: ensureRunDirectories(state.runId),
    state,
    delta: lowRiskDelta,
  });
  state.deploymentSets.push({
    deploymentSetId: 'deployment-set-v1',
    requirementId: state.requirementId,
    runId: state.runId,
    version: 1,
    environmentId: 'env-1',
    appIds: ['marketing'],
    pipelineRunIds: ['pipe-1'],
    artifactIds: [],
    createdAt: 1003,
  });
  state.testRuns.push({
    testRunId: 'test-run-1',
    requirementId: state.requirementId,
    runId: state.runId,
    deploymentSetId: 'deployment-set-v1',
    environmentId: 'env-1',
    status: 'passed',
    artifactIds: [],
    evidenceArtifactIds: [],
  });
  const readiness = checkArchiveReadiness(state);
  const report = generateArchiveReport(state, readiness);
  const deltaResult = applyKnowledgeDeltas([lowRiskDelta, highRiskDelta]);
  const archive = recordArchive({
    paths: ensureRunDirectories(state.runId),
    state,
    report,
    knowledgeDeltaRefs: [deltaRef],
    archivedAt: 1004,
  });

  assert.equal(readiness.ready, true);
  assert.equal(deltaResult.applied.length, 1);
  assert.equal(deltaResult.reviewRequired.length, 1);
  assert.equal(report.includes('deployment-set-v1'), true);
  assert.equal(archive.reportArtifactId.length > 0, true);
  assert.equal(state.status, 'completed');
});

test('lifecycle MVP chain covers fanout deploy data failure fix rerun archive and knowledge refresh', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-e2e',
    runId: 'lifecycle-foundation-e2e',
    now: 1000,
  });
  const paths = ensureRunDirectories(state.runId);
  const recall = recallFanoutCandidates({
    requirementId: state.requirementId,
    runId: state.runId,
    query: 'campaign admin preview',
    applications: [
      { appId: 'marketing', name: 'marketing', keywords: ['campaign preview'] },
      { appId: 'marketing-admin', name: 'marketing admin', keywords: ['admin preview'] },
      { appId: 'settlement', name: 'settlement', keywords: ['campaign settlement'] },
    ],
    generatedAt: '2026-07-10T00:00:00.000Z',
  });
  const fanoutDecision = applyFanoutAdjustments(recall, [
    { appId: 'marketing', role: 'primary', reason: 'backend API changes' },
    { appId: 'marketing-admin', role: 'secondary', reason: 'frontend validation' },
    { appId: 'settlement', role: 'test-only', reason: 'regression only' },
  ]);
  writeFanoutLifecycleArtifacts({ paths, state, recall, decision: fanoutDecision });
  const environmentPlan = createEnvironmentPlan({
    state,
    primaryApps: fanoutDecision.primaryApps,
    secondaryApps: fanoutDecision.secondaryApps,
    testOnlyApps: fanoutDecision.testOnlyApps,
    buildRefs: [{ appId: 'marketing', branchName: 'feature/req-e2e/marketing', pipelineRunId: 'pipe-v1' }],
  });
  const deploymentV1 = createRequirementDeploymentSet({
    state,
    environmentId: 'env-e2e',
    apps: [{ appId: 'marketing', branchName: 'feature/req-e2e/marketing', pipelineRunId: 'pipe-v1' }],
  });
  const testingInput = assembleIntegrationTestingInput({
    state,
    fanoutDecision,
    environmentPlan,
    deploymentSet: deploymentV1,
  });
  const dataPlan = createDataPlan({ input: testingInput, environmentId: 'env-e2e', testRunId: 'test-v1' });
  const cases = generateIntegrationTestCases(testingInput);
  const scripts = generateIntegrationTestScripts(cases);
  const testingRefs = writeIntegrationTestingArtifacts({
    paths,
    state,
    dataPlan,
    testCases: cases,
    scripts,
    report: '# Test Report\n\nFailed once.',
  });
  recordIntegrationTestRun({
    state,
    testRunId: 'test-v1',
    deploymentSetId: deploymentV1.deploymentSetId,
    environmentId: 'env-e2e',
    status: 'failed',
    artifactIds: [testingRefs.reportRef.artifactId],
    evidenceArtifactIds: [testingRefs.dataPlanRef.artifactId],
  });
  const classification = createFailureClassification({
    state,
    category: 'CODE_BUG',
    confidence: 0.9,
    rootCauseCandidates: ['preview mapper null handling'],
    evidenceArtifactIds: [testingRefs.reportRef.artifactId],
  });
  recordDiagnosis({ state, classification, testRunId: 'test-v1', pipelineRunId: 'pipe-v1' });
  const fixCycle = createFixCycle({
    state,
    failureClassificationId: classification.failureClassificationId,
    failedDeploymentSetId: deploymentV1.deploymentSetId,
    failedTestRunId: 'test-v1',
    owner: 'ai-coding',
    fixType: 'code-repair',
  });
  const deploymentV2 = createRequirementDeploymentSet({
    state,
    environmentId: 'env-e2e',
    apps: [{ appId: 'marketing', branchName: 'feature/req-e2e/marketing', pipelineRunId: 'pipe-v2' }],
  });
  const passedRun = recordIntegrationTestRun({
    state,
    testRunId: 'test-v2',
    deploymentSetId: deploymentV2.deploymentSetId,
    environmentId: 'env-e2e',
    status: 'passed',
  });
  completeFixCycle({
    state,
    fixCycleId: fixCycle.fixCycleId,
    status: 'succeeded',
    nextDeploymentSetId: deploymentV2.deploymentSetId,
    nextTestRunId: passedRun.testRunId,
  });
  const [testDelta] = createTestingKnowledgeDeltaCandidates({
    state,
    appIds: ['marketing'],
    evidenceArtifactIds: [testingRefs.reportRef.artifactId],
    summary: 'Integration test revealed preview mapper edge case.',
  });
  const deltaRef = writeKnowledgeDeltaArtifact({ paths, state, delta: testDelta });
  const readiness = checkArchiveReadiness(state);
  const archive = recordArchive({
    paths,
    state,
    report: generateArchiveReport(state, readiness),
    knowledgeDeltaRefs: [deltaRef],
  });

  assert.equal(state.deploymentSets.length, 2);
  assert.equal(state.testRuns.some(run => run.status === 'failed'), true);
  assert.equal(state.testRuns.some(run => run.status === 'passed'), true);
  assert.equal(state.diagnoses.length, 1);
  assert.equal(state.fixCycles[0].status, 'succeeded');
  assert.equal(readiness.ready, true);
  assert.equal(archive.knowledgeDeltaArtifactIds.length, 1);
  assert.equal(state.status, 'completed');
});

test('external reference imports are available through lifecycle adapters', () => {
  const capabilities = inspectExternalCapabilityImports(process.cwd());

  assert.equal(capabilities.testing.available, true);
  assert.equal(capabilities.aiOps.available, true);
  assert.equal(capabilities.harness.available, true);
  assert.ok(capabilities.testing.sourceFiles.some(file => file.includes('src/tools/testing/dataPlan.ts')));
  assert.ok(capabilities.aiOps.sourceFiles.some(file => file.includes('src/tools/testing/opsFailureClassifier.ts')));
  assert.ok(capabilities.harness.sourceFiles.some(file => file.includes('src/integrations/harness.ts')));

  const state = createEmptyLifecycleState({
    requirementId: 'req-reference-adapters',
    runId: 'lifecycle-reference-adapters',
    apps: [{
      appId: 'marketing',
      role: 'primary',
      status: 'pending',
      repoRef: '/tmp/marketing',
      artifactIds: [],
      ciRunIds: [],
      testRunIds: [],
    }],
  });
  const paths = ensureRunDirectories(state.runId);
  const repositories = createHarnessRepositoryRefs({ paths, state, capabilities });
  assert.equal(repositories[0].provider, 'local-git');
  assert.match(repositories[0].accessRef ?? '', /src\/integrations\/harness.ts/);

  const enhanced = enhanceDataPlanWithTestingReference({
    dataPlan: {
      schemaVersion: 1,
      requirementId: state.requirementId,
      runId: state.runId,
      environmentId: 'env-reference',
      testRunId: 'test-reference',
      isolationKey: 'iso-reference',
      steps: [],
    },
    testCases: [{
      testCaseId: 'case-reference',
      appIds: ['marketing'],
      title: 'Marketing integration',
      priority: 'p0',
      steps: ['Run'],
      expectedResult: 'Pass',
    }],
    state,
    capabilities,
  });
  assert.equal(enhanced.steps.length, 1);
  assert.match(enhanced.steps[0].inputRef ?? '', /testing:data-plan-step/);

  const classified = classifyWithAiOpsReference('readiness health check failed after deploy');
  assert.equal(classified.category, 'ENVIRONMENT');
  assert.match(classified.source, /src\/tools\/testing\/opsFailureClassifier.ts/);
});

test('local GitNexus graph and vector index provide fanout recall evidence', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-graph-vector',
    runId: `lifecycle-graph-vector-${Date.now()}`,
    apps: [
      {
        appId: 'marketing',
        role: 'primary',
        status: 'pending',
        repoRef: 'marketing',
        artifactIds: [],
        ciRunIds: [],
        testRunIds: [],
      },
      {
        appId: 'coupon',
        role: 'secondary',
        status: 'pending',
        repoRef: 'coupon',
        artifactIds: [],
        ciRunIds: [],
        testRunIds: [],
      },
    ],
  });
  const paths = ensureRunDirectories(state.runId);
  fs.mkdirSync(`${paths.projectDir}/marketing/src`, { recursive: true });
  fs.mkdirSync(`${paths.projectDir}/coupon/src`, { recursive: true });
  fs.writeFileSync(
    `${paths.projectDir}/marketing/src/CampaignController.ts`,
    [
      "import { CouponClient } from '../../coupon/src/CouponClient';",
      'export class CampaignController {',
      "  path = '/api/campaign/preview';",
      '  previewCoupon(coupon: CouponClient) { return coupon.preview(); }',
      '}',
    ].join('\n'),
    'utf-8',
  );
  fs.writeFileSync(
    `${paths.projectDir}/coupon/src/CouponClient.ts`,
    'export class CouponClient { preview() { return true; } }',
    'utf-8',
  );
  initializeApplicationKnowledgeArtifacts({
    paths,
    state,
    apps: [
      { appId: 'marketing', name: 'marketing', root: 'marketing', summary: 'campaign preview coupon capability' },
      { appId: 'coupon', name: 'coupon', root: 'coupon', summary: 'coupon preview service' },
    ],
  });

  const graph = buildLocalGitNexusGraph({ paths, state });
  const vector = buildLocalVectorIndex({ paths, state });
  const hits = queryLocalVectorIndex(vector.index, 'coupon preview campaign');
  const fanoutEdges = graphEdgesForFanout(graph.graph);

  assert.equal(fs.existsSync(`${paths.artifactsDir}/knowledge/gitnexus/global-graph.json`), true);
  assert.equal(fs.existsSync(`${paths.artifactsDir}/knowledge/vector-index/index.json`), true);
  assert.ok(graph.graph.nodes.some(node => node.kind === 'api' || node.kind === 'entity'));
  assert.ok(hits.some(hit => hit.appId === 'marketing' || hit.appId === 'coupon'));
  assert.ok(fanoutEdges.some(edge => edge.fromAppId === 'marketing' && edge.toAppId === 'coupon'));
});

test('GitNexus runner indexes a repository through project dependency CLI', () => {
  const runId = `gitnexus-runner-${Date.now()}`;
  const paths = ensureRunDirectories(runId);
  const repoRoot = `${paths.projectDir}/sample-app`;
  const gitNexusHome = `${paths.artifactsDir}/gitnexus-home`;
  const gitNexusIndexRoot = `${paths.artifactsDir}/knowledge/gitnexus-indexes`;
  const binPath = `${paths.projectDir}/fake-gitnexus.cjs`;
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(`${repoRoot}/index.ts`, 'export function previewCampaign() { return true; }\n', 'utf-8');
  fs.writeFileSync(binPath, [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const path = require('path');",
    "const repoRoot = process.argv[process.argv.length - 1];",
    "const indexDir = path.join(repoRoot, '.gitnexus');",
    "fs.mkdirSync(indexDir, { recursive: true });",
    "fs.mkdirSync(process.env.GITNEXUS_HOME, { recursive: true });",
    "fs.writeFileSync(path.join(indexDir, 'gitnexus.json'), JSON.stringify({ indexedAt: '2026-07-11T00:00:00.000Z', stats: { files: 1, nodes: 2, edges: 3, processes: 4 } }, null, 2));",
    "fs.writeFileSync(path.join(process.env.GITNEXUS_HOME, 'registry.json'), JSON.stringify([{ name: 'sample-app', path: repoRoot }], null, 2));",
  ].join('\n'), 'utf-8');
  fs.chmodSync(binPath, 0o755);

  const result = analyzeGitNexusRepository({
    repoRoot,
    repoName: 'sample-app',
    gitNexusHome,
    indexOutputRoot: gitNexusIndexRoot,
    binPath,
  });

  assert.equal(result.status, 'indexed');
  assert.equal(result.stats?.nodes, 2);
  assert.equal(result.registryPath, `${gitNexusHome}/registry.json`);
  assert.equal(result.indexPath, `${gitNexusIndexRoot}/sample-app`);
  assert.equal(fs.existsSync(`${repoRoot}/.gitnexus/gitnexus.json`), false);
  assert.equal(fs.existsSync(`${gitNexusIndexRoot}/sample-app/gitnexus.json`), true);
});

test('knowledge graph records GitNexus index metadata when analyzer is enabled', () => {
  const state = createEmptyLifecycleState({
    requirementId: 'req-gitnexus-index',
    runId: `gitnexus-graph-${Date.now()}`,
    apps: [{
      appId: 'sample-app',
      role: 'primary',
      status: 'pending',
      repoRef: 'sample-app',
      artifactIds: [],
      ciRunIds: [],
      testRunIds: [],
    }],
  });
  const paths = ensureRunDirectories(state.runId);
  const repoRoot = `${paths.projectDir}/sample-app`;
  const binPath = `${paths.projectDir}/fake-gitnexus.cjs`;
  fs.mkdirSync(repoRoot, { recursive: true });
  fs.writeFileSync(`${repoRoot}/index.ts`, "export const route = '/api/campaign/preview';\n", 'utf-8');
  fs.writeFileSync(binPath, [
    '#!/usr/bin/env node',
    "const fs = require('fs');",
    "const path = require('path');",
    "const repoRoot = process.argv[process.argv.length - 1];",
    "const indexDir = path.join(repoRoot, '.gitnexus');",
    "fs.mkdirSync(indexDir, { recursive: true });",
    "fs.mkdirSync(process.env.GITNEXUS_HOME, { recursive: true });",
    "fs.writeFileSync(path.join(indexDir, 'gitnexus.json'), JSON.stringify({ indexedAt: '2026-07-11T00:00:00.000Z', stats: { files: 1, nodes: 10, edges: 20, processes: 2 } }, null, 2));",
  ].join('\n'), 'utf-8');
  fs.chmodSync(binPath, 0o755);

  const graph = buildLocalGitNexusGraph({
    paths,
    state,
    gitNexus: { binPath, homeDir: `${paths.artifactsDir}/gitnexus-home` },
  });

  assert.equal(graph.graph.indexes.length, 1);
  assert.equal(graph.graph.indexes[0].status, 'indexed');
  assert.equal(graph.graph.indexes[0].stats?.nodes, 10);
  assert.equal(graph.graph.indexes[0].indexPath, `${paths.artifactsDir}/knowledge/gitnexus-indexes/sample-app`);
  assert.match(fs.readFileSync(`${paths.artifactsDir}/knowledge/gitnexus/graph-summary.md`, 'utf-8'), /sample-app: indexed/);
});

test('pipeline bridge writes lifecycle deployment and integration facts from pipeline stages', () => {
  const runId = `lifecycle-pipeline-bridge-${Date.now()}`;
  const paths = ensureRunDirectories(runId);
  const execution: ExecutionState = {
    runId,
    name: 'Lifecycle Pipeline Bridge',
    status: 'running',
    currentNodeIndex: 0,
    currentNodeId: 'upload-init',
    nodes: [
      { id: 'upload-init', name: 'Upload / Init', status: 'pending', failureCount: 0 },
      { id: 'cross-app-test', name: '跨应用测试', status: 'pending', failureCount: 0 },
    ],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: 1000,
    updatedAt: 1000,
    projects: [{
      name: 'marketing',
      root: '/tmp/marketing',
      status: 'pending',
      retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 },
    }],
    metadata: { requirementId: 'req-pipeline-bridge' },
  };

  ensurePipelineLifecycleForExecution(execution);
  const uploadNode = {
    id: 'upload-init',
    name: 'Upload / Init',
    description: '',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 1,
    planModeRequired: false,
  };
  const uploadState = execution.nodes[0];
  uploadState.status = 'running';
  recordPipelineLifecycleNodeStarted({ execution, node: uploadNode, nodeState: uploadState, now: 1001 });
  uploadState.status = 'completed';
  uploadState.outputArtifacts = ['artifacts/project-manifest.json'];
  recordPipelineLifecycleNodeCompleted({
    execution,
    node: uploadNode,
    nodeState: uploadState,
    outputArtifacts: uploadState.outputArtifacts,
    paths,
    now: 1002,
  });

  fs.mkdirSync(`${paths.artifactsDir}/cross-app`, { recursive: true });
  fs.writeFileSync(`${paths.artifactsDir}/cross-app/test-results.json`, JSON.stringify({ status: 'approved' }), 'utf-8');
  fs.writeFileSync(`${paths.artifactsDir}/cross-app/delivery-metadata.json`, JSON.stringify({ deliveryStatus: 'ready' }), 'utf-8');
  const crossNode = {
    id: 'cross-app-test',
    name: '跨应用测试',
    description: '',
    hasConfirmationGate: false,
    usesReActLoop: false,
    maxTurns: 1,
    planModeRequired: false,
  };
  const crossState = execution.nodes[1];
  crossState.status = 'completed';
  crossState.outputArtifacts = [
    'artifacts/cross-app/test-results.json',
    'artifacts/cross-app/delivery-metadata.json',
  ];
  recordPipelineLifecycleNodeCompleted({
    execution,
    node: crossNode,
    nodeState: crossState,
    outputArtifacts: crossState.outputArtifacts,
    paths,
    now: 1003,
  });

  const lifecycle = loadLifecycleState(runId);
  assert.equal(lifecycle?.metadata?.externalCapabilities !== undefined, true);
  assert.equal(lifecycle?.artifacts.some(ref => ref.type === 'repository-index'), true);
  assert.equal(lifecycle?.artifacts.some(ref => ref.type === 'app-knowledge-gitnexus-graph'), true);
  assert.equal(lifecycle?.artifacts.some(ref => ref.type === 'knowledge-vector-index'), true);
  assert.equal(lifecycle?.deploymentSets.length, 1);
  assert.equal(lifecycle?.testRuns[0].status, 'passed');
  assert.equal(fs.existsSync(`${paths.artifactsDir}/runtime/repositories.json`), true);
  assert.equal(fs.existsSync(`${paths.artifactsDir}/testing/data-plan.json`), true);
  assert.match(fs.readFileSync(`${paths.artifactsDir}/testing/data-plan.json`, 'utf-8'), /testing-cross-app-marketing/);
});

function initializeGitRepository(repoRoot: string): void {
  git(repoRoot, ['init', '-b', 'main']);
  fs.writeFileSync(`${repoRoot}/README.md`, '# Marketing\n', 'utf-8');
  git(repoRoot, ['add', 'README.md']);
  git(repoRoot, [
    '-c', 'user.name=AI Coding Test',
    '-c', 'user.email=ai-coding-test@example.local',
    'commit',
    '-m',
    'Initial commit',
  ]);
}

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
