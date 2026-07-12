import * as assert from 'assert/strict';
import * as fsSync from 'fs';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import test from 'node:test';
import type { LLMContentBlock, LLMProvider, LLMRequest, LLMResponse, LLMStreamEvent } from '../models/providers.js';
import { getRunPaths, RunPaths } from '../runtime/paths.js';
import { getStateStore } from '../persistence/stateStore.js';
import { SessionManager } from '../session/SessionManager.js';
import {
  BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
  createBuiltInMrdToCodeWorkflow,
} from '../workflows/builtinDefinitions.js';
import { validateWorkflowDefinition } from '../workflows/validation.js';
import {
  createEmptyRetryState,
  createInitialGraphState,
  mergeGraphState,
} from '../workflows/runtime/langgraph/state.js';
import { syncExecutionStateFromGraph } from '../workflows/runtime/langgraph/readModelSync.js';
import {
  readLatestFileCheckpoint,
  recoverFileCheckpointFromExecutionState,
  writeFileCheckpoint,
} from '../workflows/runtime/langgraph/checkpointer.js';
import {
  createDefaultFanoutConfig,
  createFanoutBranches,
} from '../workflows/runtime/langgraph/nodes/fanoutNode.js';
import {
  routeAfterTestCode,
  targetNodeForFailure,
} from '../workflows/runtime/langgraph/nodes/rollbackRouter.js';
import { computeJoinState } from '../workflows/runtime/langgraph/nodes/joinNode.js';
import {
  AsyncSemaphore,
  createPlanResourceSemaphores,
} from '../workflows/runtime/langgraph/concurrency.js';
import { createLangGraphEventBridge } from '../workflows/runtime/langgraph/eventBridge.js';
import { resolveConfirmationDecision } from '../workflows/runtime/langgraph/nodes/confirmationNode.js';
import { writeBranchSummaryArtifact } from '../workflows/runtime/langgraph/branchSummary.js';
import {
  createAffectedBranchRollbackPatch,
  createMainWorkflowRollbackPatch,
  runCrossAppCodeReview,
  runCrossAppIntegrationReview,
  writeCrossAppDeliveryMetadata,
} from '../workflows/runtime/langgraph/crossAppReview.js';
import { closeEventLog, getEventLog } from '../events/EventLog.js';
import { WorkflowNode } from '../workflows/types.js';
import {
  createBranchRef,
  applyFanoutDecisionToSessionWorkflowInstance,
  createInitialSessionWorkflowInstance,
  createLegacySessionWorkflowInstance,
  getSessionWorkflowInstanceOrLegacy,
  syncSessionBranchRuntimeFromNodes,
  syncSessionWorkflowJoinFromBranches,
} from '../workflows/sessionInstance.js';
import {
  deriveFanoutDecision,
  FanoutDecision,
  FANOUT_DECISION_ARTIFACT_PATH,
  writeFanoutDecisionArtifact,
} from '../workflows/fanoutDecision.js';
import {
  createSessionExecutionPlan,
  deriveProjectCapabilityShape,
  validateSessionExecutionPlan,
} from '../workflows/sessionPlan.js';
import {
  listPlanNodeContracts,
  PLAN_NODE_REGISTRY,
} from '../workflows/planNodeRegistry.js';
import { validateStructuredPlanDocument } from '../workflows/planValidation.js';
import {
  buildRequirementOwnershipArtifact,
  REQUIREMENT_OWNERSHIP_ARTIFACT_PATH,
} from '../workflows/requirementOwnership.js';
import { requestStructuredSessionPlan } from '../workflows/structuredPlannerAdapter.js';
import {
  applyReplanRevision,
  createReplanRequest,
  evaluateReplanFuse,
} from '../workflows/replan.js';
import {
  cancelBranchTrack,
  createInitialBranchState,
  markBranchTrackNode,
  resetBranchTrackFromNode,
  runPlannedBranch,
} from '../workflows/runtime/langgraph/branchRunner.js';
import { detectProjectRoots } from '../agents/codegen/upload-init.js';
import { buildClarifyQuestionsArtifact } from '../agents/codegen/requirement-decompose.js';
import {
  markProjectOpenSpecTasksCompleted,
  writeProjectOpenSpecChange,
} from '../agents/codegen/openspec-integration.js';

test('built-in workflow mirrors pipeline stages and validates in locked mode', () => {
  const workflow = createBuiltInMrdToCodeWorkflow();
  const nodeIds = workflow.nodes.map((node) => node.id);

  assert.equal(workflow.id, BUILTIN_MRD_TO_CODE_WORKFLOW_ID);
  assert.equal(workflow.locked, true);
  assert.ok(nodeIds.includes('upload-init'));
  assert.ok(nodeIds.includes('mrd-render'));
  assert.ok(nodeIds.includes('mrd-render-confirmation'));
  assert.ok(nodeIds.includes('implementation-plan-confirmation'));
  assert.ok(workflow.edges.some((edge) => edge.source === 'upload-init' && edge.target === 'mrd-render'));

  const validation = validateWorkflowDefinition(workflow);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.issues, []);
});

test('upload project root detection treats multiple uploaded folders as project candidates', () => {
  const root = fsSync.mkdtempSync(path.join(os.tmpdir(), 'ai-coding-project-roots-'));
  fsSync.mkdirSync(path.join(root, 'crowd'), { recursive: true });
  fsSync.mkdirSync(path.join(root, 'abtest'), { recursive: true });
  fsSync.mkdirSync(path.join(root, 'cc'), { recursive: true });
  fsSync.writeFileSync(path.join(root, 'crowd', 'crowd-tech-solution.md'), '# crowd', 'utf-8');
  fsSync.writeFileSync(path.join(root, 'abtest', 'abtest-tech-solution.md'), '# abtest', 'utf-8');
  fsSync.writeFileSync(path.join(root, 'cc', 'cc-tech-solution.md'), '# cc', 'utf-8');

  const projects = detectProjectRoots(root);

  assert.deepEqual(
    projects.map(project => project.name).sort(),
    ['abtest', 'cc', 'crowd'],
  );
});

test('clarify questions always include requirement to application boundary confirmation', () => {
  const clarified = [
    '# MRD Clarification',
    '',
    '## Feature Inventory',
    '- traceKey 生成',
    '',
    '## Project Ownership',
    '- traceKey 生成 -> crowd',
    '- traceKey 透传 -> abtest',
    '- traceKey 日志 -> cc',
    '',
    '## Implementation Boundaries',
    '- crowd 改代码',
    '- abtest 改代码',
    '- cc 改代码',
    '',
    '## Clarification Questions',
    '无需澄清。',
    '',
    '## Clarified Decisions',
    '- 默认继续',
  ].join('\n');

  const questions = buildClarifyQuestionsArtifact(
    clarified,
    {
      requirements: [],
      projects: [
        { name: 'crowd', root: 'project/crowd' },
        { name: 'abtest', root: 'project/abtest' },
        { name: 'cc', root: 'project/cc' },
      ],
    },
    '# MRD Clarify Questions\n\n无需澄清。'
  );

  assert.ok(questions.includes('需求-应用实现边界确认'));
  assert.ok(questions.includes('crowd: project/crowd'));
  assert.ok(questions.includes('abtest: project/abtest'));
  assert.ok(questions.includes('cc: project/cc'));
  assert.ok(questions.includes('哪些应用需要改代码'));
});

test('session workflow instance creates dynamic graph and legacy fallback', () => {
  const workflow = createBuiltInMrdToCodeWorkflow();
  const snapshot = {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    capturedAt: '2026-06-28T00:00:00.000Z',
    definition: workflow,
  };
  const instance = createInitialSessionWorkflowInstance({
    runId: 'session-instance-test',
    templateSnapshot: snapshot,
    createdAt: snapshot.capturedAt,
  });

  assert.equal(instance.layout, 'dynamic-fanout');
  assert.equal(instance.legacyFallback, false);
  assert.equal(instance.template.workflowId, workflow.id);
  assert.deepEqual(
    instance.nodes.map(node => node.id),
    [
      'upload-init',
      'mrd-clarify',
      'mrd-render',
      'project-fanout',
      'app-join',
      'cross-app-code-review',
      'cross-app-integration-review',
      'archive',
    ]
  );
  assert.ok(instance.edges.some(edge => edge.source === 'mrd-render' && edge.target === 'project-fanout' && edge.kind === 'fanout'));

  const branch = createBranchRef({
    branchId: 'session-instance-test-marketing',
    projectName: 'marketing',
    projectRoot: '/tmp/marketing',
  });
  instance.branches.push(branch);

  assert.equal(workflow.nodes.some(node => node.id === 'project-fanout'), false, 'run branch data must not mutate template workflow');
  assert.equal(instance.branches[0].workflowId, 'mrd-to-code-app-branch');

  const legacy = createLegacySessionWorkflowInstance({
    runId: 'legacy-test',
    nodes: [
      { id: 'upload-init', name: 'Upload / Init', status: 'completed', failureCount: 0 },
      { id: 'archive', name: 'Archive', status: 'completed', failureCount: 0 },
    ],
    createdAt: snapshot.capturedAt,
  });
  assert.equal(legacy.layout, 'legacy-fixed');
  assert.equal(legacy.legacyFallback, true);
  assert.deepEqual(legacy.nodes.map(node => node.id), ['upload-init', 'archive']);

  const derived = getSessionWorkflowInstanceOrLegacy({
    runId: 'legacy-test',
    nodes: [
      { id: 'upload-init', name: 'Upload / Init', status: 'completed', failureCount: 0 },
    ],
    createdAt: snapshot.capturedAt,
  });
  assert.equal(derived.layout, 'legacy-fixed');
});

test('session branch runtime aggregates completed branches and stale node updates', () => {
  const marketing = createBranchRef({
    branchId: 'run-marketing',
    projectName: 'marketing',
    projectRoot: '/tmp/marketing',
  });
  marketing.nodes = [
    { id: 'implementation-plan', label: '实施方案', status: 'completed' },
    { id: 'spec-generate', label: 'SPEC生成', status: 'completed' },
    { id: 'java-impl', label: 'Java实现', status: 'completed' },
    { id: 'backend-test', label: '后端测试', status: 'completed' },
  ];
  syncSessionBranchRuntimeFromNodes(marketing);
  assert.equal(marketing.status, 'completed');
  assert.equal(marketing.currentNodeId, 'backend-test');

  const admin = createBranchRef({
    branchId: 'run-marketing-admin',
    projectName: 'marketing-admin',
    projectRoot: '/tmp/marketing-admin',
  });
  admin.nodes = [
    { id: 'implementation-plan', label: '实施方案', status: 'completed' },
    { id: 'spec-generate', label: 'SPEC生成', status: 'completed' },
    { id: 'java-impl', label: 'Java实现', status: 'completed' },
    { id: 'frontend-impl', label: '前端实现', status: 'completed' },
    { id: 'backend-test', label: '后端测试', status: 'running' },
    { id: 'frontend-test', label: '前端测试', status: 'completed' },
    { id: 'e2e-verify', label: '端到端验证', status: 'failed', error: 'startup timeout' },
  ];
  syncSessionBranchRuntimeFromNodes(admin);
  assert.equal(admin.status, 'failed');
  assert.equal(admin.currentNodeId, 'e2e-verify');

  admin.nodes.find(node => node.id === 'backend-test')!.status = 'completed';
  syncSessionBranchRuntimeFromNodes(admin);
  assert.equal(admin.status, 'failed', 'stale backend-test completion must not overwrite downstream e2e failure');
  assert.equal(admin.currentNodeId, 'e2e-verify');

  const workflow = createBuiltInMrdToCodeWorkflow();
  const workflowInstance = createInitialSessionWorkflowInstance({
    runId: 'branch-aggregate-run',
    templateSnapshot: {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      capturedAt: '2026-06-30T00:00:00.000Z',
      definition: workflow,
    },
  });
  workflowInstance.branches = [marketing, admin];
  workflowInstance.joins = [{
    joinId: 'app-join',
    waitingForBranchIds: [marketing.branchId, admin.branchId],
    completedBranchIds: [],
    failedBranchIds: [],
    cancelledBranchIds: [],
    status: 'waiting',
  }];
  syncSessionWorkflowJoinFromBranches(workflowInstance);
  assert.deepEqual(workflowInstance.joins[0].waitingForBranchIds, []);
  assert.deepEqual(workflowInstance.joins[0].completedBranchIds, [marketing.branchId]);
  assert.deepEqual(workflowInstance.joins[0].failedBranchIds, [admin.branchId]);
  assert.equal(workflowInstance.joins[0].status, 'failed');
});

test('state store persists session workflow instance without dropping existing read model fields', async () => {
  const runId = `session-instance-roundtrip-${Date.now()}`;
  const workflow = createBuiltInMrdToCodeWorkflow();
  const workflowInstance = createInitialSessionWorkflowInstance({
    runId,
    templateSnapshot: {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      capturedAt: '2026-06-28T00:00:00.000Z',
      definition: workflow,
    },
    createdAt: '2026-06-28T00:00:00.000Z',
  });
  const store = getStateStore(runId);

  store.saveExecutionState({
    runId,
    name: 'Session Instance Roundtrip',
    status: 'idle',
    currentNodeIndex: -1,
    nodes: [
      { id: 'upload-init', name: 'Upload / Init', status: 'pending', failureCount: 0 },
    ],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: 100,
    updatedAt: 100,
    artifactIndex: {
      'upload-init': ['artifacts/project-manifest.json'],
    },
    projects: [
      {
        name: 'marketing',
        root: '/tmp/marketing',
        status: 'pending',
        retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 },
      },
    ],
    contextManifests: {},
    workflowInstance,
  });

  const loaded = store.loadExecutionState();
  assert.equal(loaded?.workflowInstance?.layout, 'dynamic-fanout');
  assert.equal(loaded?.workflowInstance?.nodes.some(node => node.id === 'project-fanout'), true);
  assert.equal(loaded?.nodes[0].id, 'upload-init');
  assert.equal(loaded?.artifactIndex?.['upload-init'][0], 'artifacts/project-manifest.json');
  assert.equal(loaded?.projects?.[0].name, 'marketing');

  await fs.rm(getRunPaths(runId).runDir, { recursive: true, force: true });
});

test('fanout decision selects MRD-owned project subset and records excluded projects', () => {
  const decision = deriveFanoutDecision({
    generatedAt: '2026-06-28T00:00:00.000Z',
    manifest: {
      requirements: [{ name: 'mrd.md', path: 'input/mrd.md', size: 100 }],
      projects: [
        { name: 'marketing', root: 'marketing' },
        { name: 'order-service', root: 'order-service' },
        { name: 'user-center', root: 'user-center' },
      ],
    },
    clarifiedMrd: [
      '# Clarified MRD',
      '',
      '## Project Ownership',
      '- Project: marketing owns campaign page changes.',
      '- Project: order-service owns checkout state changes.',
      '',
      '## Acceptance',
      '- Only affected apps should run implementation.',
    ].join('\n'),
  });

  assert.equal(decision.confidence, 'high');
  assert.deepEqual(decision.includedProjects.map(project => project.name), ['marketing', 'order-service']);
  assert.deepEqual(decision.excludedProjects.map(project => project.name), ['user-center']);
  assert.deepEqual(decision.unresolvedProjects, []);
  assert.equal(decision.fallbackReason, undefined);
});

test('fanout decision falls back to all projects when ownership is uncertain', () => {
  const decision = deriveFanoutDecision({
    generatedAt: '2026-06-28T00:00:00.000Z',
    manifest: {
      requirements: [],
      projects: [
        { name: 'marketing', root: 'marketing' },
        { name: 'order-service', root: 'order-service' },
      ],
    },
    clarifiedMrd: '# Clarified MRD\n\n## Feature Inventory\n- Improve onboarding.',
  });

  assert.equal(decision.confidence, 'low');
  assert.deepEqual(decision.includedProjects.map(project => project.name), ['marketing', 'order-service']);
  assert.deepEqual(decision.excludedProjects, []);
  assert.match(decision.fallbackReason || '', /did not confidently match/i);
});

test('fanout decision records unresolved MRD-referenced projects', () => {
  const decision = deriveFanoutDecision({
    generatedAt: '2026-06-28T00:00:00.000Z',
    manifest: {
      requirements: [],
      projects: [
        { name: 'marketing', root: 'marketing' },
        { name: 'order-service', root: 'order-service' },
      ],
    },
    clarifiedMrd: [
      '# Clarified MRD',
      '',
      '## Project Ownership',
      '- Project: marketing owns campaign changes.',
      '- Project: missing-app owns notification changes.',
    ].join('\n'),
  });

  assert.equal(decision.confidence, 'medium');
  assert.deepEqual(decision.includedProjects.map(project => project.name), ['marketing']);
  assert.deepEqual(decision.excludedProjects.map(project => project.name), ['order-service']);
  assert.deepEqual(decision.unresolvedProjects.map(project => project.name), ['missing-app']);
});

test('project capability snapshots classify backend frontend fullstack documentation and mixed apps', () => {
  const backend = deriveProjectCapabilityShape({
    name: 'api',
    root: 'api',
    buildTool: 'maven',
    sourceRoots: ['src/main/java'],
    testRoots: ['src/test/java'],
    capabilities: startupCapability({ backend: true, confidence: 'high' }),
  });
  const frontend = deriveProjectCapabilityShape({
    name: 'web',
    root: 'web',
    sourceRoots: ['src'],
    testRoots: ['__tests__'],
    capabilities: startupCapability({ frontend: true, playwrightConfig: 'playwright.config.ts', confidence: 'high' }),
  });
  const fullstack = deriveProjectCapabilityShape({
    name: 'fullstack',
    root: 'fullstack',
    buildTool: 'maven',
    sourceRoots: ['src/main/java', 'src'],
    testRoots: ['src/test/java', '__tests__'],
    capabilities: startupCapability({ backend: true, frontend: true, confidence: 'high' }),
  });
  const docs = deriveProjectCapabilityShape({
    name: 'docs',
    root: 'docs',
    sourceRoots: undefined,
    capabilities: startupCapability({ confidence: 'low', fallbackReasons: ['Only markdown files were detected.'] }),
  });
  const springStatic = deriveProjectCapabilityShape({
    name: 'marketing-admin',
    root: 'marketing-admin',
    buildTool: 'maven',
    sourceRoots: ['src/main/java', 'src/main/resources/static'],
    testRoots: ['src/test/java'],
    capabilities: startupCapability({ backend: true, confidence: 'medium' }),
  });

  assert.equal(backend.backend, true);
  assert.equal(backend.frontend, false);
  assert.equal(backend.testable, true);
  assert.equal(frontend.frontend, true);
  assert.equal(frontend.backend, false);
  assert.equal(fullstack.backend, true);
  assert.equal(fullstack.frontend, true);
  assert.equal(fullstack.contract, true);
  assert.equal(fullstack.mixedModule, true);
  assert.equal(springStatic.backend, true);
  assert.equal(springStatic.frontend, true);
  assert.equal(springStatic.mixedModule, true);
  assert.equal(docs.documentationOnly, true);
  assert.equal(docs.confidence, 'low');
  assert.match(docs.fallbackReasons.join('\n'), /markdown|executable/i);
});

test('session execution planner creates capability-driven branch tracks and validation evidence', () => {
  const decision = deriveFanoutDecision({
    generatedAt: '2026-06-28T00:00:00.000Z',
    manifest: {
      requirements: [],
      projects: [
        { name: 'api', root: 'api' },
        { name: 'web', root: 'web' },
        { name: 'fullstack', root: 'fullstack' },
        { name: 'docs', root: 'docs' },
      ],
    },
    clarifiedMrd: [
      '## Project Ownership',
      '- Project: api owns backend data changes.',
      '- Project: web owns UI behavior.',
      '- Project: fullstack owns UI and API behavior.',
      '- Project: docs owns rollout notes.',
    ].join('\n'),
  });
  const plan = createSessionExecutionPlan({
    runId: 'planner-run',
    decision,
    manifest: {
      requirements: [],
      projects: [
        { name: 'api', root: 'api', buildTool: 'maven', sourceRoots: ['src/main/java'], testRoots: ['src/test/java'], capabilities: startupCapability({ backend: true, confidence: 'high' }) },
        { name: 'web', root: 'web', sourceRoots: ['src'], testRoots: ['__tests__'], capabilities: startupCapability({ frontend: true, playwrightConfig: 'playwright.config.ts', confidence: 'high' }) },
        { name: 'fullstack', root: 'fullstack', buildTool: 'maven', sourceRoots: ['src/main/java', 'src'], testRoots: ['src/test/java', '__tests__'], capabilities: startupCapability({ backend: true, frontend: true, confidence: 'high' }) },
        { name: 'docs', root: 'docs', capabilities: startupCapability({ confidence: 'low', fallbackReasons: ['No package or Maven files.'] }) },
      ],
    },
    generatedAt: '2026-06-28T00:00:01.000Z',
  });

  assert.equal(plan.validation.valid, true);
  assert.equal(plan.plannerVersion, 'plan-and-executor-v1');
  const api = plan.branches.find(branch => branch.projectName === 'api');
  const web = plan.branches.find(branch => branch.projectName === 'web');
  const fullstack = plan.branches.find(branch => branch.projectName === 'fullstack');
  const docs = plan.branches.find(branch => branch.projectName === 'docs');
  assert.deepEqual(api?.tracks.map(track => track.kind), ['backend']);
  assert.deepEqual(web?.tracks.map(track => track.kind), ['frontend', 'e2e']);
  assert.deepEqual(fullstack?.tracks.map(track => track.kind), ['backend', 'frontend', 'e2e', 'contract']);
  assert.deepEqual(docs?.tracks.map(track => track.kind), ['documentation']);
  assert.ok(docs?.tracks[0].fallbackReason?.includes('No package'));
  assert.ok(api?.omittedTracks.some(item => item.trackKind === 'frontend'));
  assert.ok(fullstack?.nodes.some(node => node.id === 'app-track-join'));
});

test('structured plan registry covers generated and orchestration node contracts', () => {
  const contracts = listPlanNodeContracts();
  const expectedNodeTypes = [
    'requirement-ownership-confirmation',
    'implementation-plan',
    'spec-generate',
    'backend-impl',
    'java-impl',
    'frontend-impl',
    'backend-test',
    'frontend-test',
    'api-contract-check',
    'e2e-verify',
    'documentation-impl',
    'documentation-test',
    'app-track-join',
    'app-branch-summary',
    'cross-app-code-review',
    'cross-app-integration-review',
    'archive',
  ];

  assert.deepEqual(contracts.map(contract => contract.nodeType).sort(), expectedNodeTypes.sort());
  for (const contract of contracts) {
    assert.equal(PLAN_NODE_REGISTRY[contract.nodeType], contract);
    assert.equal(contract.runner.length > 0, true);
    assert.equal(contract.inputSchema.type, 'object');
    assert.equal(contract.outputSchema.type, 'object');
    assert.ok(Array.isArray(contract.artifacts.requiredArtifacts));
    assert.ok(Array.isArray(contract.artifacts.producedArtifacts));
    assert.equal(typeof contract.confirmation.required, 'boolean');
    assert.equal(typeof contract.replan.replannable, 'boolean');
    assert.equal(Number.isInteger(contract.replan.maxAttempts), true);
  }
  assert.equal(PLAN_NODE_REGISTRY['requirement-ownership-confirmation'].confirmation.required, true);
  assert.equal(PLAN_NODE_REGISTRY['e2e-verify'].resources.browserSlots, 1);
  assert.equal(PLAN_NODE_REGISTRY.archive.replan.replannable, false);
});

test('structured session plans persist initial revision and migration metadata', () => {
  const plan = createSessionExecutionPlan({
    runId: 'structured-metadata-run',
    decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
    manifest: {
      requirements: [],
      projects: [{
        name: 'fullstack',
        root: 'fullstack',
        buildTool: 'maven',
        sourceRoots: ['src/main/java', 'src'],
        testRoots: ['src/test/java', '__tests__'],
        capabilities: startupCapability({ backend: true, frontend: true }),
      }],
    },
    generatedAt: '2026-06-28T00:00:01.000Z',
  });

  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.currentRevisionId, 'rev-1');
  assert.equal(plan.revisions.length, 1);
  assert.ok(plan.nodeContracts.some(contract => contract.nodeType === 'e2e-verify' && contract.resources.browserSlots === 1));
  assert.equal(plan.revisions[0].revisionId, 'rev-1');
  assert.equal(plan.revisions[0].reason, 'initial');
  assert.equal(plan.revisions[0].validation.valid, true);
  assert.deepEqual(plan.revisions[0].lockedNodeIds, []);
  assert.deepEqual(plan.migration, {
    source: 'structured',
    legacyFallbackUsed: false,
    warnings: [],
  });
});

test('structured plan validation rejects invalid node contracts before execution', () => {
  const plan = createSessionExecutionPlan({
    runId: 'structured-invalid-run',
    decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
    manifest: {
      requirements: [],
      projects: [{
        name: 'fullstack',
        root: 'fullstack',
        buildTool: 'maven',
        sourceRoots: ['src/main/java', 'src'],
        testRoots: ['src/test/java', '__tests__'],
        capabilities: startupCapability({ backend: true, frontend: true }),
      }],
    },
  });
  const invalid = JSON.parse(JSON.stringify(plan)) as typeof plan;
  invalid.branches[0].nodes[0].type = 'unknown-node' as never;
  invalid.branches[0].nodes[1].runner = 'wrong-runner';
  const nodeWithoutDependencies = invalid.branches[0].nodes[2] as unknown as { dependsOn?: string[] };
  delete nodeWithoutDependencies.dependsOn;
  invalid.branches[0].nodes[3].dependsOn = ['missing-node'];

  const issues = validateStructuredPlanDocument(invalid);
  const codes = issues.map(issue => issue.code);

  assert.ok(codes.includes('unknown-node-type'));
  assert.ok(codes.includes('runner-contract-mismatch'));
  assert.ok(codes.includes('missing-node-dependencies'));
  assert.ok(codes.includes('missing-dependency'));
  assert.ok(issues.every(issue => issue.severity === 'error'));
});

test('structured planner adapter uses tool schema and strict JSON fallback validation', async () => {
  const plan = createSessionExecutionPlan({
    runId: 'structured-adapter-run',
    decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
    manifest: {
      requirements: [],
      projects: [{
        name: 'fullstack',
        root: 'fullstack',
        buildTool: 'maven',
        sourceRoots: ['src/main/java', 'src'],
        testRoots: ['src/test/java', '__tests__'],
        capabilities: startupCapability({ backend: true, frontend: true }),
      }],
    },
  });
  const toolProvider = new StaticLLMProvider([{
    type: 'tool_use',
    id: 'tool-1',
    name: 'emit_session_execution_plan',
    input: plan as unknown as Record<string, unknown>,
  }]);

  const toolResult = await requestStructuredSessionPlan({
    provider: toolProvider,
    modelId: 'planner-model',
    systemPrompt: 'You are a structured planner.',
    userPrompt: 'Plan the session.',
  });
  assert.equal(toolResult.ok, true);
  assert.equal(toolResult.mode, 'tool');
  assert.equal(toolProvider.lastRequest?.toolChoice, 'required');
  assert.equal(toolProvider.lastRequest?.tools?.[0].name, 'emit_session_execution_plan');

  const jsonResult = await requestStructuredSessionPlan({
    provider: new StaticLLMProvider([{ type: 'text', text: JSON.stringify(plan) }]),
    modelId: 'planner-model',
    systemPrompt: 'You are a structured planner.',
    userPrompt: 'Plan the session.',
  });
  assert.equal(jsonResult.ok, true);
  assert.equal(jsonResult.mode, 'json');

  const nonJsonResult = await requestStructuredSessionPlan({
    provider: new StaticLLMProvider([{ type: 'text', text: '```json\n{}\n```' }]),
    modelId: 'planner-model',
    systemPrompt: 'You are a structured planner.',
    userPrompt: 'Plan the session.',
  });
  assert.equal(nonJsonResult.ok, false);
  assert.ok(nonJsonResult.issues.some(issue => issue.code === 'planner-non-json-response'));

  const invalidPlan = { ...plan, branches: undefined };
  const invalidResult = await requestStructuredSessionPlan({
    provider: new StaticLLMProvider([{
      type: 'tool_use',
      id: 'tool-1',
      name: 'emit_session_execution_plan',
      input: invalidPlan as unknown as Record<string, unknown>,
    }]),
    modelId: 'planner-model',
    systemPrompt: 'You are a structured planner.',
    userPrompt: 'Plan the session.',
  });
  assert.equal(invalidResult.ok, false);
  assert.ok(invalidResult.issues.some(issue => issue.code === 'missing-branches'));
});

test('session execution planner uses AI-owned implementation surfaces before keyword fallback', () => {
  const plan = createSessionExecutionPlan({
    runId: 'surface-plan-run',
    decision: fanoutDecisionFixture([
      { name: 'marketing-admin', root: 'marketing-admin' },
      { name: 'marketing', root: 'marketing' },
    ]),
    manifest: {
      requirements: [],
      projects: [
        { name: 'marketing-admin', root: 'marketing-admin', buildTool: 'maven', sourceRoots: ['src/main/java'], capabilities: startupCapability({ backend: true }) },
        { name: 'marketing', root: 'marketing', buildTool: 'maven', sourceRoots: ['src/main/java'], capabilities: startupCapability({ backend: true }) },
      ],
    },
    clarifiedMrd: [
      '# MRD Clarification',
      '',
      '## Implementation Surfaces',
      '| 功能项 | 项目 | frontend | backend | contract | e2e | 判断依据 |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| 活动命中预览入口 | marketing-admin | yes | yes | yes | yes | 设置端页面和预览提交入口 |',
      '| 用户运行侧命中结果查询 | marketing | no | yes | yes | no | 用户侧运行态判断接口 |',
    ].join('\n'),
  });

  const admin = plan.branches.find(branch => branch.projectName === 'marketing-admin');
  const marketing = plan.branches.find(branch => branch.projectName === 'marketing');
  assert.deepEqual(admin?.tracks.map(track => track.kind), ['backend', 'frontend', 'e2e', 'contract']);
  assert.deepEqual(marketing?.tracks.map(track => track.kind), ['backend', 'contract']);
});

test('structured requirement ownership drives fanout and track planning before legacy text fallback', () => {
  const manifest = {
    requirements: [],
    projects: [
      { name: 'marketing-admin', root: 'marketing-admin', buildTool: 'maven', sourceRoots: ['src/main/java'], capabilities: startupCapability({ backend: true }) },
      { name: 'marketing', root: 'marketing', buildTool: 'maven', sourceRoots: ['src/main/java'], capabilities: startupCapability({ backend: true }) },
      { name: 'docs', root: 'docs' },
    ],
  };
  const clarified = [
    '# MRD Clarification',
    '',
    '## Feature Inventory',
    '- 活动命中预览：设置端发起预览并展示命中结果。',
    '- 用户运行侧命中查询：运行态接口返回命中结果。',
    '',
    '## Project Ownership',
    '- 活动命中预览 -> marketing-admin',
    '- 用户运行侧命中查询 -> marketing',
    '',
    '## Implementation Surfaces',
    '| 功能项 | 项目 | frontend | backend | contract | e2e | 判断依据 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    '| 活动命中预览 | marketing-admin | yes | yes | yes | yes | 设置端页面、预览提交入口和结果展示 |',
    '| 用户运行侧命中查询 | marketing | no | yes | yes | no | 用户侧运行态判断接口 |',
    '',
    '## Implementation Boundaries',
    '- docs 不参与代码实现。',
    '',
    '## Clarification Questions',
    '无需澄清。',
    '',
    '## Clarified Decisions',
    '- 用户确认按推荐默认决策继续。',
  ].join('\n');
  const requirementOwnership = buildRequirementOwnershipArtifact({
    clarified,
    manifest,
    confirmation: {
      status: 'confirmed',
      feedback: '确认归属正确。',
      confirmedAt: '2026-06-28T00:00:01.000Z',
    },
  });
  const fanoutDecision = deriveFanoutDecision({
    manifest,
    clarifiedMrd: '# legacy text intentionally lacks project names',
    requirementOwnership,
    generatedAt: '2026-06-28T00:00:02.000Z',
  });
  const plan = createSessionExecutionPlan({
    runId: 'structured-ownership-run',
    decision: fanoutDecision,
    manifest,
    clarifiedMrd: '# legacy text intentionally lacks implementation surfaces',
    requirementOwnership,
    generatedAt: '2026-06-28T00:00:03.000Z',
  });

  assert.equal(requirementOwnership.confirmation.status, 'confirmed');
  assert.equal(requirementOwnership.migration.legacyFallbackUsed, false);
  assert.ok(requirementOwnership.implementationSurfaces.some(surface => surface.projectName === 'marketing-admin' && surface.frontend && surface.e2e));
  assert.deepEqual(fanoutDecision.includedProjects.map(project => project.name), ['marketing-admin', 'marketing']);
  assert.deepEqual(fanoutDecision.excludedProjects.map(project => project.name), ['docs']);
  assert.ok(plan.sourceArtifacts.includes(REQUIREMENT_OWNERSHIP_ARTIFACT_PATH));
  assert.deepEqual(plan.branches.find(branch => branch.projectName === 'marketing-admin')?.tracks.map(track => track.kind), ['backend', 'frontend', 'e2e', 'contract']);
  assert.deepEqual(plan.branches.find(branch => branch.projectName === 'marketing')?.tracks.map(track => track.kind), ['backend', 'contract']);
});

test('session execution plan validation rejects unsupported catalog entries cycles and missing artifact metadata', () => {
  const plan = createSessionExecutionPlan({
    runId: 'invalid-plan-run',
    decision: fanoutDecisionFixture([{ name: 'app', root: 'app' }]),
    manifest: {
      requirements: [],
      projects: [{ name: 'app', root: 'app', buildTool: 'maven', sourceRoots: ['src/main/java'], capabilities: startupCapability({ backend: true }) }],
    },
  });
  const branch = plan.branches[0];
  branch.tracks[0].kind = 'unsupported' as never;
  branch.nodes[0].type = 'unsupported-node' as never;
  branch.nodes[0].requiredArtifacts = [];
  branch.nodes[1].dependsOn = [branch.nodes[0].id, 'missing-node'];
  branch.nodes[0].dependsOn = [branch.nodes[1].id];

  const validation = validateSessionExecutionPlan(plan, '2026-06-28T00:00:02.000Z');

  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some(issue => issue.code === 'unsupported-track-kind'));
  assert.ok(validation.issues.some(issue => issue.code === 'unsupported-node-type'));
  assert.ok(validation.issues.some(issue => issue.code === 'missing-required-artifacts'));
  assert.ok(validation.issues.some(issue => issue.code === 'missing-dependency'));
  assert.ok(validation.issues.some(issue => issue.code === 'dependency-cycle'));
});

test('fanout decision artifact writes and session workflow instance indexes branch refs', async () => {
  const paths = createTempRunPaths('fanout-decision-artifact');
  const workflow = createBuiltInMrdToCodeWorkflow();
  const instance = createInitialSessionWorkflowInstance({
    runId: 'fanout-decision-run',
    templateSnapshot: {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      capturedAt: '2026-06-28T00:00:00.000Z',
      definition: workflow,
    },
    createdAt: '2026-06-28T00:00:00.000Z',
  });
  const decision = deriveFanoutDecision({
    generatedAt: '2026-06-28T00:00:00.000Z',
    manifest: {
      requirements: [],
      projects: [
        { name: 'marketing', root: 'marketing' },
        { name: 'order-service', root: 'order-service' },
      ],
    },
    clarifiedMrd: '## Project Ownership\n- Project: marketing owns the change.',
  });

  const artifact = writeFanoutDecisionArtifact({ paths, decision });
  applyFanoutDecisionToSessionWorkflowInstance({
    instance,
    runId: 'fanout-decision-run',
    decision,
    manifest: {
      requirements: [],
      projects: [
        { name: 'marketing', root: 'marketing', buildTool: 'maven', sourceRoots: ['src/main/java'], capabilities: startupCapability({ backend: true }) },
        { name: 'order-service', root: 'order-service' },
      ],
    },
    artifactPath: FANOUT_DECISION_ARTIFACT_PATH,
    updatedAt: '2026-06-28T00:00:01.000Z',
  });

  assert.equal(artifact.relativePath, 'fanout-decision.json');
  assert.equal(fsSync.existsSync(path.join(paths.artifactsDir, artifact.relativePath)), true);
  const parsed = readJson(path.join(paths.artifactsDir, artifact.relativePath)) as { includedProjects?: Array<{ name: string }> };
  assert.deepEqual(parsed.includedProjects?.map(project => project.name), ['marketing']);
  assert.equal(instance.fanoutDecisionArtifact, FANOUT_DECISION_ARTIFACT_PATH);
  assert.deepEqual(instance.fanoutDecision?.excludedProjects.map(project => project.name), ['order-service']);
  assert.deepEqual(instance.nodes.find(node => node.id === 'project-fanout')?.branchIds, ['fanout-decision-run-marketing']);
  assert.deepEqual(instance.joins[0].waitingForBranchIds, ['fanout-decision-run-marketing']);
  assert.equal(instance.executionPlan?.validation.valid, true);
  assert.deepEqual(instance.branches[0].tracks?.map(track => track.kind), ['backend']);
  assert.ok(instance.branches[0].nodes?.some(node => node.id === 'java-impl' && node.trackId === 'backend'));

  const unresolvedDecision = deriveFanoutDecision({
    generatedAt: '2026-06-28T00:00:02.000Z',
    manifest: {
      requirements: [],
      projects: [{ name: 'marketing', root: 'marketing' }],
    },
    clarifiedMrd: '## Project Ownership\n- Project: marketing owns campaign changes.\n- Project: missing-app owns notification changes.',
  });
  applyFanoutDecisionToSessionWorkflowInstance({
    instance,
    runId: 'fanout-decision-run',
    decision: unresolvedDecision,
    manifest: {
      requirements: [],
      projects: [{ name: 'marketing', root: 'marketing', buildTool: 'maven', sourceRoots: ['src/main/java'], capabilities: startupCapability({ backend: true }) }],
    },
    artifactPath: FANOUT_DECISION_ARTIFACT_PATH,
    updatedAt: '2026-06-28T00:00:02.000Z',
  });
  const fanoutNode = instance.nodes.find(node => node.id === 'project-fanout');
  assert.equal(fanoutNode?.status, 'waiting_confirmation');
  assert.match(fanoutNode?.error || '', /missing-app/);

  await fs.rm(paths.runDir, { recursive: true, force: true });
});

test('branch controls cancel and rerun only the selected session branch', async () => {
  const runId = `branch-control-${Date.now()}`;
  const workflow = createBuiltInMrdToCodeWorkflow();
  const workflowInstance = createInitialSessionWorkflowInstance({
    runId,
    templateSnapshot: {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      capturedAt: '2026-06-28T00:00:00.000Z',
      definition: workflow,
    },
    createdAt: '2026-06-28T00:00:00.000Z',
  });
  const appA = createBranchRef({
    branchId: `${runId}-app-a`,
    projectName: 'app-a',
    projectRoot: 'app-a',
    status: 'running',
    currentNodeId: 'java-impl',
  });
  const appB = createBranchRef({
    branchId: `${runId}-app-b`,
    projectName: 'app-b',
    projectRoot: 'app-b',
    status: 'failed',
    currentNodeId: 'testcode-generate',
  });
  workflowInstance.branches = [appA, appB];
  workflowInstance.joins = [{
    joinId: 'app-join',
    waitingForBranchIds: [appA.branchId, appB.branchId],
    completedBranchIds: [],
    failedBranchIds: [],
    cancelledBranchIds: [],
    status: 'waiting',
  }];
  const store = getStateStore(runId);
  store.saveExecutionState({
    runId,
    name: 'Branch Controls',
    status: 'running',
    currentNodeIndex: 3,
    nodes: [
      { id: 'upload-init', name: 'Upload / Init', status: 'completed', failureCount: 0 },
      { id: 'mrd-render', name: '需求拆解', status: 'completed', failureCount: 0 },
      { id: 'java-impl', name: 'Java Impl', status: 'running', failureCount: 0 },
    ],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: 100,
    updatedAt: 100,
    projects: [
      { name: 'app-a', root: 'app-a', status: 'running', currentNodeId: 'java-impl', retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 } },
      { name: 'app-b', root: 'app-b', status: 'failed', currentNodeId: 'testcode-generate', retry: { reviewBlockCount: 0, testRetryCount: 1, coverageRetryCount: 0 } },
    ],
    workflowInstance,
  });

  const manager = new SessionManager();
  const cancelled = manager.cancelBranch(runId, appA.branchId);
  assert.equal(cancelled?.workflowInstance?.branches.find(branch => branch.branchId === appA.branchId)?.status, 'cancelled');
  assert.equal(cancelled?.workflowInstance?.branches.find(branch => branch.branchId === appB.branchId)?.status, 'failed');
  assert.ok(cancelled?.workflowInstance?.joins[0].cancelledBranchIds.includes(appA.branchId));

  const rerun = manager.rerunBranch(runId, appB.branchId, 'java-impl');
  const rerunBranch = rerun?.workflowInstance?.branches.find(branch => branch.branchId === appB.branchId);
  assert.equal(rerunBranch?.status, 'pending');
  assert.equal(rerunBranch?.currentNodeId, 'java-impl');
  assert.ok(rerun?.workflowInstance?.joins[0].waitingForBranchIds.includes(appB.branchId));
  const eventTypes = getEventLog(runId).getAllEvents().map(event => event.type);
  assert.ok(eventTypes.includes('branch_cancelled'));
  assert.ok(eventTypes.includes('branch_rerun_scheduled'));
  assert.ok(eventTypes.includes('join_state_updated'));

  await fs.rm(getRunPaths(runId).runDir, { recursive: true, force: true });
});

test('branch rerun targets dynamic plan revision nodes and preserves sibling artifacts', async () => {
  const runId = `dynamic-branch-rerun-${Date.now()}`;
  const workflow = createBuiltInMrdToCodeWorkflow();
  const executionPlan = createSessionExecutionPlan({
    runId,
    decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
    manifest: {
      requirements: [],
      projects: [{
        name: 'fullstack',
        root: 'fullstack',
        buildTool: 'maven',
        sourceRoots: ['src/main/java', 'src'],
        testRoots: ['src/test/java', '__tests__'],
        capabilities: startupCapability({ backend: true, frontend: true }),
      }],
    },
  });
  const workflowInstance = createInitialSessionWorkflowInstance({
    runId,
    templateSnapshot: {
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      capturedAt: '2026-06-28T00:00:00.000Z',
      definition: workflow,
    },
    createdAt: '2026-06-28T00:00:00.000Z',
  });
  const branch = createBranchRef({
    branchId: executionPlan.branches[0].branchId,
    projectName: 'fullstack',
    projectRoot: 'fullstack',
    plan: executionPlan.branches[0],
    status: 'failed',
    currentNodeId: 'frontend-test',
  });
  branch.artifactIndex = { 'backend-test': ['artifacts/fullstack/test-report.md'] };
  for (const node of branch.nodes ?? []) {
    if (['implementation-plan', 'spec-generate', 'java-impl', 'backend-test', 'frontend-impl'].includes(node.id)) {
      node.status = 'completed';
    }
    if (node.id === 'frontend-test') node.status = 'failed';
  }
  workflowInstance.branches = [branch];
  workflowInstance.executionPlan = executionPlan;
  workflowInstance.joins = [{
    joinId: 'app-join',
    waitingForBranchIds: [],
    completedBranchIds: [],
    failedBranchIds: [branch.branchId],
    cancelledBranchIds: [],
    status: 'failed',
  }];
  getStateStore(runId).saveExecutionState({
    runId,
    name: 'Dynamic Branch Rerun',
    status: 'running',
    currentNodeIndex: 3,
    nodes: [{ id: 'project-fanout', name: 'Fanout', status: 'completed', failureCount: 0 }],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: 100,
    updatedAt: 100,
    projects: [{ name: 'fullstack', root: 'fullstack', branchId: branch.branchId, status: 'failed', currentNodeId: 'frontend-test', retry: createEmptyRetryState() }],
    workflowInstance,
  });

  const rerun = new SessionManager().rerunBranch(runId, branch.branchId, 'frontend-test');
  const rerunBranch = rerun?.workflowInstance?.branches[0];

  assert.equal(rerunBranch?.nodes?.find(node => node.id === 'backend-test')?.status, 'completed');
  assert.equal(rerunBranch?.nodes?.find(node => node.id === 'frontend-test')?.status, 'pending');
  assert.equal(rerunBranch?.nodes?.find(node => node.id === 'e2e-verify')?.status, 'pending');
  assert.deepEqual(rerunBranch?.artifactIndex?.['backend-test'], ['artifacts/fullstack/test-report.md']);
  const rerunEvent = getEventLog(runId).getAllEvents().find(event => event.type === 'branch_rerun_scheduled');
  assert.equal((rerunEvent?.data as Record<string, unknown>)?.planRevisionId, 'rev-1');

  await fs.rm(getRunPaths(runId).runDir, { recursive: true, force: true });
});

test('session details backfill dynamic workflow instance for historical project runs', async () => {
  const runId = `historical-dynamic-backfill-${Date.now()}`;
  const store = getStateStore(runId);
  store.saveExecutionState({
    runId,
    name: 'Historical Project Run',
    status: 'completed',
    currentNodeIndex: 6,
    currentNodeId: 'archive',
    nodes: [
      { id: 'upload-init', name: 'Upload / Init', status: 'completed', failureCount: 0, outputArtifacts: ['artifacts/project-manifest.json'] },
      { id: 'mrd-render', name: '需求拆解', status: 'completed', failureCount: 0, outputArtifacts: ['artifacts/mrd-clarified.md'] },
      { id: 'implementation-plan', name: '实施方案', status: 'completed', failureCount: 0, outputArtifacts: ['artifacts/prd.md', 'artifacts/marketing/tech-design.md'] },
      { id: 'spec-generate', name: 'SPEC生成', status: 'completed', failureCount: 0, outputArtifacts: ['artifacts/marketing/openspec-task.md'] },
      { id: 'java-impl', name: 'Java Impl', status: 'completed', failureCount: 0, outputArtifacts: ['artifacts/marketing/review-findings.json'] },
      { id: 'testcode-generate', name: 'Test Code Generate', status: 'completed', failureCount: 0, outputArtifacts: ['artifacts/marketing/test-report.md'] },
      { id: 'archive', name: 'Archive', status: 'completed', failureCount: 0, outputArtifacts: ['artifacts/marketing/archive-report.md'] },
    ],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: 100,
    updatedAt: 200,
    completedAt: 200,
    projects: [
      {
        name: 'marketing',
        root: 'project/marketing',
        status: 'completed',
        currentNodeId: 'archive',
        retry: { reviewBlockCount: 0, testRetryCount: 0, coverageRetryCount: 0 },
      },
    ],
    artifactIndex: {
      'implementation-plan': ['artifacts/prd.md', 'artifacts/marketing/tech-design.md'],
      'java-impl': ['artifacts/marketing/review-findings.json'],
      archive: ['artifacts/marketing/archive-report.md'],
    },
  });

  const session = new SessionManager().getSession(runId);
  const instance = session.state?.workflowInstance;
  assert.equal(instance?.layout, 'dynamic-fanout');
  assert.equal(instance?.legacyFallback, false);
  assert.deepEqual(instance?.nodes.map(node => node.id), [
    'upload-init',
    'mrd-clarify',
    'mrd-render',
    'project-fanout',
    'app-join',
    'cross-app-code-review',
    'cross-app-integration-review',
    'archive',
  ]);
  assert.equal(instance?.branches[0].projectName, 'marketing');
  assert.equal(instance?.branches[0].status, 'completed');
  assert.equal(instance?.branches[0].nodes?.find(node => node.id === 'java-impl')?.status, 'completed');
  assert.equal(instance?.joins[0].status, 'completed');
  assert.equal(getStateStore(runId).loadExecutionState()?.workflowInstance?.layout, 'dynamic-fanout');

  await fs.rm(getRunPaths(runId).runDir, { recursive: true, force: true });
});

test('workflow validation rejects removed locked stage and unbounded cycle', () => {
  const workflow = createBuiltInMrdToCodeWorkflow();
  workflow.nodes = workflow.nodes.filter((node) => node.id !== 'java-impl');
  workflow.edges.push({
    id: 'mrd-render->upload-init',
    source: 'mrd-render',
    target: 'upload-init',
    kind: 'retry',
  });

  const validation = validateWorkflowDefinition(workflow);
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === 'missing-required-stage'));
  assert.ok(validation.issues.some((issue) => issue.code === 'unbounded-cycle'));
});

test('graph state reducer merges nodes, branches, joins, artifacts, and retry counters', () => {
  const state = createInitialGraphState({
    runId: 'graph-test',
    workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    workflowVersion: 1,
    nodeIds: ['upload-init', 'archive'],
    permissionMode: 'default',
    startedAt: 100,
  });

  const merged = mergeGraphState(state, {
    currentNodeId: 'upload-init',
    nodes: {
      'upload-init': {
        status: 'completed',
        outputArtifacts: ['artifacts/input-summary.md'],
      },
    },
    branches: {
      app_a: {
        branchId: 'app_a',
        workflowId: 'branch',
        projectName: 'app-a',
        projectRoot: '/tmp/app-a',
        status: 'completed',
        nodes: {},
        artifactIndex: { summary: ['artifacts/app-a/branch-summary.json'] },
        contextManifests: {},
        childAgentIds: [],
        retry: createEmptyRetryState(),
      },
    },
    joins: {
      'app-join': {
        joinNodeId: 'app-join',
        waitingForBranchIds: ['app_a'],
        completedBranchIds: ['app_a'],
        failedBranchIds: [],
        status: 'completed',
      },
    },
    artifactIndex: {
      'upload-init': ['artifacts/input-summary.md'],
    },
    retry: {
      testRetryCount: 1,
    },
    updatedAt: 200,
  });

  assert.equal(merged.currentNodeId, 'upload-init');
  assert.equal(merged.nodes['upload-init'].status, 'completed');
  assert.equal(merged.branches.app_a.projectName, 'app-a');
  assert.equal(merged.joins['app-join'].status, 'completed');
  assert.equal(merged.retry.testRetryCount, 1);
});

test('branch runtime state tracks nested track nodes without overwriting sibling artifacts', () => {
  const plan = createSessionExecutionPlan({
    runId: 'branch-track-run',
    decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
    manifest: {
      requirements: [],
      projects: [{
        name: 'fullstack',
        root: 'fullstack',
        buildTool: 'maven',
        sourceRoots: ['src/main/java', 'src'],
        testRoots: ['src/test/java', '__tests__'],
        capabilities: startupCapability({ backend: true, frontend: true }),
      }],
    },
  });
  const branch = createInitialBranchState({
    branchId: plan.branches[0].branchId,
    workflowId: 'mrd-to-code-app-branch',
    projectName: 'fullstack',
    projectRoot: 'fullstack',
    plan: plan.branches[0],
  });

  const backendImplDone = markBranchTrackNode({
    ...branch,
    artifactIndex: { 'backend-test': ['artifacts/fullstack/test-report.md'] },
    tracks: {
      ...branch.tracks,
      backend: {
        ...branch.tracks?.backend,
        trackId: 'backend',
        kind: 'backend',
        nodeIds: ['java-impl', 'backend-test'],
        status: 'running',
        artifactIndex: { 'backend-test': ['artifacts/fullstack/test-report.md'] },
      },
    },
  }, 'backend', 'java-impl', {
    status: 'completed',
    outputArtifacts: ['artifacts/fullstack/changed-files.json'],
  });
  const backendDone = markBranchTrackNode(backendImplDone, 'backend', 'backend-test', {
    status: 'completed',
    outputArtifacts: ['artifacts/fullstack/test-report.md'],
  });
  const frontendFailed = markBranchTrackNode(backendDone, 'frontend', 'frontend-test', {
    status: 'failed',
    error: 'component test failed',
  });

  assert.equal(frontendFailed.tracks?.backend.status, 'completed');
  assert.equal(frontendFailed.tracks?.frontend.status, 'failed');
  assert.deepEqual(frontendFailed.tracks?.backend.artifactIndex['backend-test'], ['artifacts/fullstack/test-report.md']);
  assert.equal(frontendFailed.nodes['backend-test'].status, 'completed');
  assert.equal(frontendFailed.nodes['frontend-test'].status, 'failed');
});

test('planned branch executor dispatches runners, joins tracks, reruns and cancels track scope', async () => {
  const plan = createSessionExecutionPlan({
    runId: 'planned-executor-run',
    decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
    manifest: {
      requirements: [],
      projects: [{
        name: 'fullstack',
        root: 'fullstack',
        buildTool: 'maven',
        sourceRoots: ['src/main/java', 'src'],
        testRoots: ['src/test/java', '__tests__'],
        capabilities: startupCapability({ backend: true, frontend: true }),
      }],
    },
  });
  const branchPlan = plan.branches[0];
  const graphState = createInitialGraphState({
    runId: 'planned-executor-run',
    workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    workflowVersion: 1,
    nodeIds: ['project-fanout'],
    permissionMode: 'default',
  });
  const branch = createInitialBranchState({
    branchId: branchPlan.branchId,
    workflowId: 'mrd-to-code-app-branch',
    projectName: 'fullstack',
    projectRoot: 'fullstack',
    plan: branchPlan,
  });
  const calls: string[] = [];
  const completed = await runPlannedBranch({
    graphState,
    branch,
    plan: branchPlan,
    concurrencyLimit: 3,
    handlers: {
      'java-impl': async (_ctx, node) => {
        calls.push(node.runner);
        return { outputArtifacts: ['artifacts/fullstack/changed-files.json'], childAgentIds: ['agent-java'] };
      },
      'frontend-impl': (_ctx, node) => {
        calls.push(node.runner);
        return { outputArtifacts: ['artifacts/fullstack/frontend-implementation-summary.json'] };
      },
      'api-contract-check': (_ctx, node) => {
        calls.push(node.runner);
        return { outputArtifacts: ['artifacts/fullstack/e2e/api-contract-results.json'] };
      },
      'frontend-test': (_ctx, node) => {
        calls.push(node.runner);
        return { outputArtifacts: ['artifacts/fullstack/frontend-test-report.md'] };
      },
      'backend-test': (_ctx, node) => {
        calls.push(node.runner);
        return { outputArtifacts: ['artifacts/fullstack/test-report.md'] };
      },
      'e2e-verify': (_ctx, node) => {
        calls.push(node.runner);
        return { outputArtifacts: ['artifacts/fullstack/e2e/e2e-summary.json'] };
      },
    },
  });

  assert.equal(completed.status, 'completed');
  assert.equal(completed.tracks?.backend.status, 'completed');
  assert.equal(completed.tracks?.frontend.status, 'completed');
  assert.equal(completed.tracks?.e2e.status, 'completed');
  assert.equal(completed.nodes['app-track-join'].status, 'completed');
  assert.equal(completed.nodes['java-impl'].childAgentIds?.[0], 'agent-java');
  assert.deepEqual(completed.tracks?.backend.artifactIndex['backend-test'], ['artifacts/fullstack/test-report.md']);
  assert.ok(calls.includes('java-impl'));
  assert.ok(calls.includes('frontend-test'));
  assert.ok(calls.includes('api-contract-check'));

  const failing = await runPlannedBranch({
    graphState,
    branch: createInitialBranchState({
      branchId: branchPlan.branchId,
      workflowId: 'mrd-to-code-app-branch',
      projectName: 'fullstack',
      projectRoot: 'fullstack',
      plan: branchPlan,
    }),
    plan: branchPlan,
    handlers: {
      'backend-test': () => ({ outputArtifacts: ['artifacts/fullstack/test-report.md'] }),
      'frontend-test': () => {
        throw new Error('component test failed');
      },
    },
  });

  assert.equal(failing.status, 'waiting_fix');
  assert.equal(failing.tracks?.backend.status, 'completed');
  assert.equal(failing.tracks?.frontend.status, 'failed');
  assert.deepEqual(failing.tracks?.backend.artifactIndex['backend-test'], ['artifacts/fullstack/test-report.md']);
  assert.equal(failing.nodes['app-track-join'].status, 'waiting_fix');

  const rerun = resetBranchTrackFromNode(failing, 'frontend', 'frontend-test');
  assert.equal(rerun.tracks?.frontend.status, 'pending');
  assert.equal(rerun.nodes['frontend-test'].status, 'pending');
  assert.deepEqual(rerun.tracks?.backend.artifactIndex['backend-test'], ['artifacts/fullstack/test-report.md']);

  const cancelled = cancelBranchTrack(rerun, 'frontend');
  assert.equal(cancelled.tracks?.frontend.status, 'cancelled');
  assert.equal(cancelled.nodes['frontend-test'].status, 'interrupted');
});

test('planned branch executor enforces node resource semaphores from registry contracts', async () => {
  const plan = createSessionExecutionPlan({
    runId: 'planned-resource-run',
    decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
    manifest: {
      requirements: [],
      projects: [{
        name: 'fullstack',
        root: 'fullstack',
        buildTool: 'maven',
        sourceRoots: ['src/main/java', 'src'],
        testRoots: ['src/test/java', '__tests__'],
        capabilities: startupCapability({ backend: true, frontend: true }),
      }],
    },
  });
  const branchPlan = JSON.parse(JSON.stringify(plan.branches[0])) as typeof plan.branches[0];
  const e2eClone = {
    ...branchPlan.nodes.find(node => node.id === 'e2e-verify')!,
    id: 'e2e-verify-second',
  };
  branchPlan.nodes.push(e2eClone);
  branchPlan.tracks.find(track => track.trackId === 'e2e')?.nodes.push(e2eClone);
  const branch = createInitialBranchState({
    branchId: branchPlan.branchId,
    workflowId: 'mrd-to-code-app-branch',
    projectName: 'fullstack',
    projectRoot: 'fullstack',
    plan: branchPlan,
  });
  let activeBrowser = 0;
  let maxActiveBrowser = 0;
  const completed = await runPlannedBranch({
    graphState: createInitialGraphState({
      runId: 'planned-resource-run',
      workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
      workflowVersion: 1,
      nodeIds: ['project-fanout'],
      permissionMode: 'default',
    }),
    branch,
    plan: branchPlan,
    concurrencyLimit: 8,
    resourceSemaphores: createPlanResourceSemaphores({
      branchConcurrency: 8,
      modelConcurrency: 8,
      commandConcurrency: 8,
      browserConcurrency: 1,
    }),
    handlers: {
      'e2e-verify': async () => {
        activeBrowser += 1;
        maxActiveBrowser = Math.max(maxActiveBrowser, activeBrowser);
        await new Promise(resolve => setTimeout(resolve, 10));
        activeBrowser -= 1;
        return { outputArtifacts: ['artifacts/fullstack/e2e/e2e-summary.json'] };
      },
    },
  });

  assert.equal(completed.status, 'completed');
  assert.equal(maxActiveBrowser, 1);
  assert.equal(completed.nodes['e2e-verify'].status, 'completed');
  assert.equal(completed.nodes['e2e-verify-second'].status, 'completed');
});

test('replan requests lock completed siblings replace remaining nodes and enforce fuse limits', () => {
  const plan = createSessionExecutionPlan({
    runId: 'replan-run',
    decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
    manifest: {
      requirements: [],
      projects: [{
        name: 'fullstack',
        root: 'fullstack',
        buildTool: 'maven',
        sourceRoots: ['src/main/java', 'src'],
        testRoots: ['src/test/java', '__tests__'],
        capabilities: startupCapability({ backend: true, frontend: true }),
      }],
    },
    generatedAt: '2026-06-28T00:00:01.000Z',
  });
  const branch = plan.branches[0];
  const request = createReplanRequest({
    plan,
    branchId: branch.branchId,
    failedNodeIds: ['frontend-test'],
    reason: 'node-failure',
    createdAt: '2026-06-28T00:00:02.000Z',
  });
  const replacement = JSON.parse(JSON.stringify(branch)) as typeof branch;
  replacement.nodes.find(node => node.id === 'java-impl')!.label = 'Malicious backend rewrite';
  replacement.nodes.find(node => node.id === 'frontend-test')!.label = 'Frontend Test Replanned';
  replacement.tracks.find(track => track.trackId === 'frontend')!.nodes.find(node => node.id === 'frontend-test')!.label = 'Frontend Test Replanned';

  const result = applyReplanRevision({
    plan,
    request,
    replacementBranches: [replacement],
    createdAt: '2026-06-28T00:00:03.000Z',
  });

  assert.equal(result.ok, true);
  assert.ok(request.lockedNodeIds.includes('java-impl'));
  if (result.ok) {
    const nextBranch = result.plan.branches[0];
    assert.equal(result.plan.currentRevisionId, 'rev-2');
    assert.equal(result.plan.revisions[1].parentRevisionId, 'rev-1');
    assert.equal(nextBranch.nodes.find(node => node.id === 'java-impl')?.label, 'Backend Implementation');
    assert.equal(nextBranch.nodes.find(node => node.id === 'frontend-test')?.label, 'Frontend Test Replanned');
  }

  const exhausted = evaluateReplanFuse({
    ...plan,
    revisions: [
      ...plan.revisions,
      { ...plan.revisions[0], revisionId: 'rev-2', parentRevisionId: 'rev-1', reason: 'replan', changedNodeIds: ['frontend-test'] },
      { ...plan.revisions[0], revisionId: 'rev-3', parentRevisionId: 'rev-2', reason: 'replan', changedNodeIds: ['frontend-test'] },
    ],
  }, {
    maxSessionReplans: 2,
    maxBranchReplans: 2,
  }, branch.branchId);
  assert.equal(exhausted.allowed, false);
});

test('read-model sync maps graph state to ExecutionState', () => {
  const workflow = createBuiltInMrdToCodeWorkflow();
  const graphState = mergeGraphState(createInitialGraphState({
    runId: 'read-model-test',
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    nodeIds: workflow.nodes.filter((node) => node.type !== 'end').map((node) => node.id),
    permissionMode: 'default',
    startedAt: 100,
  }), {
    status: 'completed',
    currentNodeId: 'archive',
    nodes: {
      archive: {
        status: 'completed',
        completedAt: 200,
      },
    },
    artifactIndex: {
      archive: ['artifacts/archive-manifest.json'],
    },
    completedAt: 200,
    updatedAt: 200,
  });

  const readModel = syncExecutionStateFromGraph(graphState, {
    reason: 'unit-test',
    workflow,
  });

  assert.equal(readModel.runId, 'read-model-test');
  assert.equal(readModel.status, 'completed');
  assert.equal(readModel.currentNodeId, 'archive');
  assert.equal(readModel.artifactIndex?.archive[0], 'artifacts/archive-manifest.json');
  assert.equal(readModel.metadata?.lastGraphSyncReason, 'unit-test');
});

test('read-model sync exposes branch tracks and artifacts for UI snapshots', () => {
  const workflow = createBuiltInMrdToCodeWorkflow();
  const branch = createInitialBranchState({
    branchId: 'read-model-track-run-fullstack',
    workflowId: 'mrd-to-code-app-branch',
    projectName: 'fullstack',
    projectRoot: 'fullstack',
    plan: createSessionExecutionPlan({
      runId: 'read-model-track-run',
      decision: fanoutDecisionFixture([{ name: 'fullstack', root: 'fullstack' }]),
      manifest: {
        requirements: [],
        projects: [{
          name: 'fullstack',
          root: 'fullstack',
          buildTool: 'maven',
          sourceRoots: ['src/main/java', 'src'],
          capabilities: startupCapability({ backend: true, frontend: true }),
        }],
      },
    }).branches[0],
  });
  const graphState = mergeGraphState(createInitialGraphState({
    runId: 'read-model-track-run',
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    nodeIds: workflow.nodes.filter((node) => node.type !== 'end').map((node) => node.id),
    permissionMode: 'default',
    startedAt: 100,
  }), {
    branches: {
      [branch.branchId]: {
        ...branch,
        artifactIndex: { 'backend-test': ['artifacts/fullstack/test-report.md'] },
      },
    },
    updatedAt: 200,
  });
  graphState.branchOrder = [branch.branchId];

  const readModel = syncExecutionStateFromGraph(graphState, {
    reason: 'unit-test',
    workflow,
  });

  const project = readModel.projects?.find(item => item.branchId === branch.branchId);
  assert.equal(project?.tracks?.backend.kind, 'backend');
  assert.equal(project?.tracks?.frontend.kind, 'frontend');
  assert.deepEqual(project?.artifactIndex?.['backend-test'], ['artifacts/fullstack/test-report.md']);
  assert.ok(project?.nodes?.['java-impl']);
});

test('workflow UI exposes nested tracks, planner evidence, and track-scoped artifact filtering hooks', () => {
  const appJs = fsSync.readFileSync(path.resolve('web/app.js'), 'utf-8');
  const appCss = fsSync.readFileSync(path.resolve('web/app.css'), 'utf-8');

  assert.ok(appJs.includes('function getBranchTracks('), 'UI should normalize branch tracks');
  assert.ok(appJs.includes('function renderFanoutTrackLane('), 'UI should render nested fanout track lanes');
  assert.ok(appJs.includes('function renderPlannerSnapshotDetails('), 'UI should surface planner details');
  assert.ok(appJs.includes('function renderSelectedBranchNodeDetails('), 'UI should show selected branch node contract details');
  assert.ok(appJs.includes('findPlanNodeContractSummary'), 'UI should resolve plan node contract summaries');
  assert.ok(appJs.includes('plan?.currentRevisionId'), 'UI should display plan revision provenance');
  assert.ok(appJs.includes('structuredPayload: data.structuredPayload'), 'UI should restore structured confirmation payloads after refresh');
  assert.ok(appJs.includes('state.lifecycle?.pendingConfirmation'), 'UI should restore lifecycle-backed pending confirmations after refresh');
  assert.ok(appJs.includes('isLifecyclePendingConfirmationActive'), 'UI should validate lifecycle pending confirmation state');
  assert.ok(appJs.includes('selection.trackId'), 'artifact filtering should account for selected track');
  assert.ok(appJs.includes('track?.artifactIndex?.[stageId]'), 'artifact filtering should read track artifact index');
  assert.ok(appCss.includes('.fanout-track-stack'), 'CSS should style nested fanout tracks');
  assert.ok(appCss.includes('.planner-evidence-card'), 'CSS should style planner evidence');
  assert.ok(appCss.includes('.branch-node-contract-panel'), 'CSS should style selected branch node contract details');
  assert.ok(appCss.includes('.branch-track-node'), 'CSS should style branch track nodes');
});

test('prompt context labels legacy PRD as optional compatibility context', () => {
  const promptContext = fsSync.readFileSync(path.resolve('src/agents/codegen/prompt-context.ts'), 'utf-8');

  assert.ok(promptContext.includes('optional legacy compatibility context'));
  assert.ok(promptContext.includes('Legacy PRD Compatibility Context'));
  assert.ok(promptContext.includes("proposal: readArtifactForPrompt(paths, 'mrd-clarified.md'"));
  assert.ok(promptContext.includes("requirement_ownership: readArtifactForPrompt(paths, 'requirement-ownership.json'"));
});

test('OpenSpec dynamic task sections remain section-scoped when marking completion', async () => {
  const paths = createTempRunPaths('openspec-track-sections');
  const change = writeProjectOpenSpecChange({
    paths,
    runId: 'openspec-track-run',
    projectName: 'fullstack',
    projectRoot: 'fullstack',
    developmentTasks: '- [ ] Implement backend behavior\n- [ ] Keep legacy dev task readable',
    testTasks: '- [ ] Add regression tests',
    proposalSummary: 'Proposal summary',
    requirementOwnershipSummary: 'marketing-admin owns preview UI; marketing owns runtime API',
    techDesignSummary: 'Tech design summary',
    nodeContractSummary: '- java-impl requires OpenSpec tasks and produces changed-files.json',
  });
  const tasksPath = path.join(paths.artifactsDir, change.tasksPath);
  let tasks = fsSync.readFileSync(tasksPath, 'utf-8');
  tasks = tasks.replace(
    'No backend-specific tasks were identified for this app.',
    '- [ ] Implement backend endpoint\n- [ ] Update backend service'
  ).replace(
    'No frontend-specific tasks were identified for this app.',
    '- [ ] Render trace key in UI'
  );
  fsSync.writeFileSync(tasksPath, tasks, 'utf-8');

  const backendResult = markProjectOpenSpecTasksCompleted({
    paths,
    runId: 'openspec-track-run',
    projectName: 'fullstack',
    section: 'backend',
  });
  const next = fsSync.readFileSync(tasksPath, 'utf-8');

  assert.equal(backendResult?.updated, true);
  assert.ok(next.includes('## Backend\n- [x] Implement backend endpoint\n- [x] Update backend service'));
  assert.ok(next.includes('## Frontend\n- [ ] Render trace key in UI'));
  assert.ok(next.includes('## Development\n- [ ] Implement backend behavior'));
  assert.ok(next.includes('## Test\n- [ ] Add regression tests'));

  await fs.rm(paths.runDir, { recursive: true, force: true });
});

test('OpenSpec SDD artifacts map MRD proposal design spec and generated tasks without requiring PRD', async () => {
  const paths = createTempRunPaths('openspec-sdd-mapping');
  const change = writeProjectOpenSpecChange({
    paths,
    runId: 'openspec-sdd-run',
    projectName: 'marketing-admin',
    projectRoot: 'marketing-admin',
    developmentTasks: [
      '## Backend',
      '- [ ] Add preview submission endpoint',
      '',
      '## Frontend',
      '- [ ] Render preview form',
      '',
      '## Contract',
      '- [ ] Document preview payload',
    ].join('\n'),
    testTasks: [
      '## E2E',
      '- [ ] Verify preview flow in browser',
      '',
      '## Test',
      '- [ ] Add service unit test',
    ].join('\n'),
    proposalSummary: 'MRD requires activity hit preview in setting side.',
    requirementOwnershipSummary: 'marketing-admin owns frontend/backend/contract/e2e surfaces.',
    techDesignSummary: 'Use controller/service split and static admin page update.',
    nodeContractSummary: '- frontend-impl produces changed-files.json; e2e-verify produces e2e-summary.json',
  });
  const proposal = fsSync.readFileSync(path.join(paths.artifactsDir, change.proposalPath), 'utf-8');
  const design = fsSync.readFileSync(path.join(paths.artifactsDir, change.designPath), 'utf-8');
  const spec = fsSync.readFileSync(path.join(paths.artifactsDir, change.specPath), 'utf-8');
  const tasks = fsSync.readFileSync(path.join(paths.artifactsDir, change.tasksPath), 'utf-8');

  assert.ok(proposal.includes('Primary proposal source: `artifacts/mrd-clarified.md`'));
  assert.ok(proposal.includes('Requirement ownership source: `artifacts/requirement-ownership.json`'));
  assert.ok(proposal.includes('Legacy `artifacts/prd.md`: optional compatibility context only when present.'));
  assert.ok(design.includes('## Node Contracts'));
  assert.ok(design.includes('e2e-verify produces e2e-summary.json'));
  assert.ok(spec.includes('ownership=artifacts/requirement-ownership.json'));
  assert.ok(tasks.includes('## Backend\n- [ ] Add preview submission endpoint'));
  assert.ok(tasks.includes('## Frontend\n- [ ] Render preview form'));
  assert.ok(tasks.includes('## Contract\n- [ ] Document preview payload'));
  assert.ok(tasks.includes('## E2E\n- [ ] Verify preview flow in browser'));

  await fs.rm(paths.runDir, { recursive: true, force: true });
});

test('file checkpointer writes latest graph checkpoint envelope', async () => {
  const runId = `checkpoint-test-${Date.now()}`;
  const graphState = createInitialGraphState({
    runId,
    workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    workflowVersion: 1,
    nodeIds: ['upload-init'],
    permissionMode: 'default',
  });

  const envelope = writeFileCheckpoint(runId, graphState, 'unit-test');
  const latest = readLatestFileCheckpoint(runId);

  assert.equal(envelope.threadId, runId);
  assert.equal(latest?.id, envelope.id);
  assert.equal(latest?.state.runId, runId);

  await fs.rm(getRunPaths(runId).runDir, { recursive: true, force: true });
});

test('demo fixtures remain readable and execution-state recovery creates LangGraph checkpoint', async () => {
  const legacyFixture = path.join(process.cwd(), 'fixtures/full-flow-demo/run');
  const legacyState = JSON.parse(fsSync.readFileSync(path.join(legacyFixture, 'execution-state.json'), 'utf-8'));
  assert.equal(legacyState.status, 'completed');
  assert.ok(Array.isArray(legacyState.nodes));
  assert.ok(legacyState.nodes.some((node: { id?: string }) => node.id === 'java-impl'));
  assert.equal(fsSync.existsSync(path.join(legacyFixture, 'artifacts/project/review-findings.json')), true);
  assert.equal(fsSync.existsSync(path.join(legacyFixture, 'logs/events.ndjson')), true);

  const langGraphFixture = path.join(process.cwd(), 'fixtures/langgraph-demo/run');
  const langGraphState = JSON.parse(fsSync.readFileSync(path.join(langGraphFixture, 'execution-state.json'), 'utf-8'));
  const latestCheckpoint = JSON.parse(fsSync.readFileSync(path.join(langGraphFixture, 'langgraph/latest.json'), 'utf-8'));
  assert.equal(langGraphState.metadata.runtime, 'langgraph');
  assert.equal(latestCheckpoint.threadId, 'langgraph-demo-run');
  assert.equal(fsSync.existsSync(path.join(langGraphFixture, 'langgraph/checkpoints/latest.json')), true);
  assert.equal(fsSync.existsSync(path.join(langGraphFixture, 'logs/events.ndjson')), true);
  assert.equal(fsSync.existsSync(path.join(langGraphFixture, 'artifacts/project/branch-summary.json')), true);

  const dynamicFixture = path.join(process.cwd(), 'fixtures/dynamic-multi-project-demo/run');
  const dynamicState = JSON.parse(fsSync.readFileSync(path.join(dynamicFixture, 'execution-state.json'), 'utf-8'));
  assert.equal(dynamicState.workflowInstance.layout, 'dynamic-fanout');
  assert.deepEqual(
    dynamicState.workflowInstance.branches.map((branch: { projectName: string }) => branch.projectName),
    ['marketing']
  );
  assert.deepEqual(
    dynamicState.workflowInstance.fanoutDecision.excludedProjects.map((project: { name: string }) => project.name),
    ['order']
  );
  assert.deepEqual(
    dynamicState.workflowInstance.fanoutDecision.unresolvedProjects.map((project: { name: string }) => project.name),
    ['missing-app']
  );

  const runId = `execution-recovery-${Date.now()}`;
  const paths = getRunPaths(runId);
  fsSync.mkdirSync(path.dirname(paths.executionState), { recursive: true });
  fsSync.writeFileSync(paths.executionState, JSON.stringify({
    runId,
    name: 'Recovered run',
    status: 'completed',
    currentNodeIndex: 0,
    currentNodeId: 'archive',
    nodes: [
      { id: 'archive', name: 'Archive', status: 'completed', failureCount: 0 },
    ],
    permissionMode: 'default',
    modelOverrides: {},
    startedAt: 100,
    updatedAt: 200,
    completedAt: 200,
    metadata: {
      workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
      workflowVersion: 1,
    },
    artifactIndex: {
      archive: ['artifacts/archive-manifest.json'],
    },
  }, null, 2), 'utf-8');

  const recovered = recoverFileCheckpointFromExecutionState(runId);
  assert.ok(recovered, 'recovery should create checkpoint envelope');
  assert.equal(recovered?.threadId, runId);
  assert.equal(recovered?.state.currentNodeId, 'archive');
  assert.equal(readLatestFileCheckpoint(runId)?.id, recovered?.id);

  await fs.rm(paths.runDir, { recursive: true, force: true });
});

test('dual-runtime golden fixtures preserve final read contracts', () => {
  const legacyRun = path.join(process.cwd(), 'fixtures/full-flow-demo/run');
  const langGraphRun = path.join(process.cwd(), 'fixtures/langgraph-demo/run');
  const legacyState = readJson(path.join(legacyRun, 'execution-state.json')) as {
    status: string;
    nodes: Array<{ id: string; status: string; childAgentIds?: string[] }>;
    artifactIndex?: Record<string, string[]>;
    contextManifests?: Record<string, unknown>;
  };
  const langGraphState = readJson(path.join(langGraphRun, 'execution-state.json')) as {
    status: string;
    nodes: Array<{ id: string; status: string }>;
    artifactIndex?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
  };
  const langGraphCheckpoint = readJson(path.join(langGraphRun, 'langgraph/checkpoints/latest.json')) as {
    threadId: string;
    state: { status: string; currentNodeId?: string; contextManifests: Record<string, unknown> };
  };

  assert.equal(legacyState.status, 'completed');
  assert.equal(langGraphState.status, 'completed');
  assert.equal(langGraphState.metadata?.runtime, 'langgraph');
  assert.equal(langGraphCheckpoint.threadId, 'langgraph-demo-run');
  assert.equal(langGraphCheckpoint.state.status, 'completed');

  const legacyNodeIds = legacyState.nodes.map(node => node.id);
  const langGraphNodeIds = langGraphState.nodes.map(node => node.id);
  assert.deepEqual(
    legacyNodeIds.filter(nodeId => ['upload-init', 'archive'].includes(nodeId)),
    ['upload-init', 'archive'],
    'legacy fixture should keep stable public node order'
  );
  assert.deepEqual(
    langGraphNodeIds.filter(nodeId => ['upload-init', 'archive'].includes(nodeId)),
    ['upload-init', 'archive'],
    'LangGraph fixture should keep stable public node order'
  );
  assert.ok(legacyState.nodes.every(node => node.status === 'completed'), 'legacy nodes should be terminal');
  assert.ok(langGraphState.nodes.every(node => node.status === 'completed'), 'LangGraph nodes should be terminal');

  const legacyArtifacts = listRelativeFiles(path.join(legacyRun, 'artifacts'));
  const langGraphArtifacts = listRelativeFiles(path.join(langGraphRun, 'artifacts'));
  assert.ok(legacyArtifacts.includes('project-manifest.json'), 'legacy artifacts should include project manifest');
  assert.ok(legacyArtifacts.includes('archive-manifest.json'), 'legacy artifacts should include archive manifest');
  assert.ok(langGraphArtifacts.includes('project/branch-summary.json'), 'LangGraph artifacts should include branch summary');
  assert.ok(langGraphArtifacts.includes('cross-app/delivery-metadata.json'), 'LangGraph artifacts should include cross-app delivery metadata');
  assert.ok(legacyState.artifactIndex?.archive?.some(item => item.includes('archive-report.md')));
  assert.ok(langGraphState.artifactIndex?.archive?.some(item => item.includes('delivery-metadata.json')));

  const legacyEvents = readNdjson(path.join(legacyRun, 'logs/events.ndjson'));
  const langGraphEvents = readNdjson(path.join(langGraphRun, 'logs/events.ndjson'));
  assert.ok(legacyEvents.some(event => event.type === 'pipeline_completed'));
  assert.ok(langGraphEvents.some(event => event.type === 'pipeline_completed'));
  assert.ok(legacyEvents.some(event => event.type === 'artifact_written'));
  assert.ok(Object.keys(legacyState.contextManifests ?? {}).length >= 3, 'legacy fixture should expose context manifests');
  assert.equal(typeof langGraphCheckpoint.state.contextManifests, 'object');

  const legacyAgents = listRelativeFiles(path.join(legacyRun, 'agents'));
  assert.ok(legacyAgents.length > 0, 'legacy fixture should persist agent state');
  const javaAgent = legacyAgents
    .map(agentFile => readJson(path.join(legacyRun, 'agents', agentFile)) as { nodeId?: string; transcriptPath?: string })
    .find(agent => agent.nodeId === 'java-impl');
  assert.equal(javaAgent?.transcriptPath, 'logs/events.ndjson');
});

test('rollback router maps failure categories to target nodes and retry updates', () => {
  const state = createInitialGraphState({
    runId: 'router-test',
    workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    workflowVersion: 1,
    nodeIds: ['java-impl', 'testcode-generate'],
    permissionMode: 'default',
  });

  const decision = routeAfterTestCode(state, 'coverage_failure', 'archive');

  assert.equal(targetNodeForFailure('review_block'), 'java-impl');
  assert.equal(decision.targetNodeId, 'testcode-generate');
  assert.equal(decision.retry?.coverageRetryCount, 1);
  assert.equal(decision.rollback?.sourceNodeId, 'testcode-generate');
});

test('fanout creates stable branch state and join waits for branches', () => {
  const state = createInitialGraphState({
    runId: 'fanout-test',
    workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    workflowVersion: 1,
    nodeIds: ['app-fanout'],
    permissionMode: 'default',
  });

  const patch = createFanoutBranches(state, [
    { name: 'App A', root: '/tmp/app-a' },
    { name: 'App B', root: '/tmp/app-b' },
  ], createDefaultFanoutConfig());

  assert.deepEqual(patch.branchOrder, ['fanout-test-app-a', 'fanout-test-app-b']);
  assert.equal(patch.branches?.['fanout-test-app-a']?.projectName, 'App A');
  assert.equal(patch.joins?.['app-join']?.status, 'waiting');
});

test('join state applies branch failure policies', () => {
  const join = {
    joinNodeId: 'app-join',
    waitingForBranchIds: ['a', 'b'],
    completedBranchIds: [],
    failedBranchIds: [],
    status: 'waiting' as const,
  };

  assert.equal(computeJoinState(join, ['a'], ['b'], 'continue_and_collect').status, 'completed');
  assert.equal(computeJoinState(join, ['a'], ['b'], 'fail_fast').status, 'failed');
  assert.equal(computeJoinState(join, ['a'], ['b'], 'threshold', 0).status, 'failed');
});

test('async semaphore limits concurrent work', async () => {
  const semaphore = new AsyncSemaphore(1);
  let active = 0;
  let maxActive = 0;

  await Promise.all([
    semaphore.run(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise(resolve => setTimeout(resolve, 10));
      active -= 1;
    }),
    semaphore.run(async () => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      active -= 1;
    }),
  ]);

  assert.equal(maxActive, 1);
});

test('confirmation decisions update graph state and confirmation events are idempotent', async () => {
  const confirmationNode: WorkflowNode = {
    id: 'mrd-render-confirmation',
    type: 'confirmation',
    data: {
      label: 'MRD Confirmation',
      sourceStageId: 'mrd-render',
    },
  };
  const graph = createInitialGraphState({
    runId: 'confirmation-test',
    workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    workflowVersion: 1,
    nodeIds: ['mrd-render-confirmation'],
    permissionMode: 'default',
    startedAt: 100,
  });
  const confirmation = {
    nodeId: confirmationNode.id,
    sourceStageId: 'mrd-render',
    title: 'MRD Confirmation',
  };

  const approved = resolveConfirmationDecision(graph, confirmationNode, confirmation, { approved: true });
  assert.equal(approved.status, 'running');
  assert.equal(approved.confirmation?.approved, true);
  assert.equal(approved.nodes?.['mrd-render-confirmation']?.status, 'completed');

  const rejectedWithFeedback = resolveConfirmationDecision(graph, confirmationNode, confirmation, {
    approved: false,
    feedback: '补充边界条件',
  });
  assert.equal(rejectedWithFeedback.status, 'running');
  assert.equal(rejectedWithFeedback.confirmation?.feedback, '补充边界条件');
  assert.equal(rejectedWithFeedback.nodes?.['mrd-render-confirmation']?.status, 'waiting_fix');

  const rejectedWithoutFeedback = resolveConfirmationDecision(graph, confirmationNode, confirmation, { approved: false });
  assert.equal(rejectedWithoutFeedback.status, 'cancelled');
  assert.equal(rejectedWithoutFeedback.nodes?.['mrd-render-confirmation']?.status, 'interrupted');

  const runId = `confirmation-idempotent-${Date.now()}`;
  const bridge = createLangGraphEventBridge(runId);
  const waitingState = mergeGraphState(createInitialGraphState({
    runId,
    workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    workflowVersion: 1,
    nodeIds: ['confirm'],
    permissionMode: 'default',
  }), {
    currentNodeId: 'confirm',
  });
  const first = bridge.emitPipelineEventOnce(
    waitingState,
    'confirmation:confirm',
    'confirmation_waiting',
    { nodeId: 'confirm', title: 'Confirm', content: 'Review artifact' },
    'confirm'
  );
  const second = bridge.emitPipelineEventOnce(
    first.state,
    'confirmation:confirm',
    'confirmation_waiting',
    { nodeId: 'confirm', title: 'Confirm', content: 'Review artifact' },
    'confirm'
  );

  assert.ok(first.event, 'first confirmation event should be written');
  assert.equal(second.event, undefined);
  assert.equal(
    getEventLog(runId).getAllEvents().filter(event => event.type === 'confirmation_waiting').length,
    1
  );
  closeEventLog(runId);
  await fs.rm(getRunPaths(runId).runDir, { recursive: true, force: true });
});

test('cross-app review writes findings, rollback patches, and delivery metadata', async () => {
  const paths = createTempRunPaths('cross-app-test');
  const state = mergeGraphState(createInitialGraphState({
    runId: 'cross-app-test',
    workflowId: BUILTIN_MRD_TO_CODE_WORKFLOW_ID,
    workflowVersion: 1,
    nodeIds: ['cross-app-code-review', 'cross-app-integration-review', 'implementation-plan'],
    permissionMode: 'default',
    startedAt: 100,
  }), {
    branchOrder: ['branch-a', 'branch-b', 'branch-c', 'branch-d'],
    branches: {
      'branch-a': {
        branchId: 'branch-a',
        workflowId: 'branch',
        projectName: 'App A',
        projectRoot: '/tmp/app-a',
        status: 'completed',
        nodes: {
          'app-code-impl': { id: 'app-code-impl', status: 'completed', failureCount: 0 },
        },
        artifactIndex: {
          summary: ['artifacts/App A/branch-summary.json'],
        },
        contextManifests: {},
        childAgentIds: [],
        retry: createEmptyRetryState(),
      },
      'branch-b': {
        branchId: 'branch-b',
        workflowId: 'branch',
        projectName: 'App B',
        projectRoot: '/tmp/app-b',
        status: 'completed',
        nodes: {
          'app-code-impl': { id: 'app-code-impl', status: 'completed', failureCount: 0 },
        },
        artifactIndex: {
          summary: ['artifacts/App B/branch-summary.json'],
        },
        contextManifests: {},
        childAgentIds: [],
        retry: createEmptyRetryState(),
      },
      'branch-c': {
        branchId: 'branch-c',
        workflowId: 'branch',
        projectName: 'App C',
        projectRoot: '/tmp/app-c',
        status: 'completed',
        nodes: {
          'app-code-impl': { id: 'app-code-impl', status: 'completed', failureCount: 0 },
        },
        artifactIndex: {
          summary: ['artifacts/App C/branch-summary.json'],
        },
        contextManifests: {},
        childAgentIds: [],
        retry: createEmptyRetryState(),
      },
      'branch-d': {
        branchId: 'branch-d',
        workflowId: 'branch',
        projectName: 'App D',
        projectRoot: '/tmp/app-d',
        status: 'completed',
        nodes: {
          'app-code-impl': { id: 'app-code-impl', status: 'completed', failureCount: 0 },
        },
        artifactIndex: {
          summary: ['artifacts/App D/branch-summary.json'],
        },
        contextManifests: {},
        childAgentIds: [],
        retry: createEmptyRetryState(),
      },
    },
    projects: [
      { name: 'App A', root: '/tmp/app-a', branchId: 'branch-a', status: 'completed', retry: createEmptyRetryState() },
      { name: 'App B', root: '/tmp/app-b', branchId: 'branch-b', status: 'completed', retry: createEmptyRetryState() },
      { name: 'App C', root: '/tmp/app-c', branchId: 'branch-c', status: 'completed', retry: createEmptyRetryState() },
      { name: 'App D', root: '/tmp/app-d', branchId: 'branch-d', status: 'completed', retry: createEmptyRetryState() },
    ],
  });

  writeBranchSummaryArtifact(paths, {
    branchId: 'branch-a',
    projectName: 'App A',
    tracks: [{
      trackId: 'backend',
      kind: 'backend',
      status: 'completed',
      nodeIds: ['java-impl', 'backend-test'],
      artifactPaths: ['artifacts/App A/test-report.md'],
    }],
    openSpec: {
      changeId: 'run-cross-app-test-app-a',
      proposalPath: 'artifacts/App A/openspec/changes/run-cross-app-test-app-a/proposal.md',
      designPath: 'artifacts/App A/openspec/changes/run-cross-app-test-app-a/design.md',
      tasksPath: 'artifacts/App A/openspec/changes/run-cross-app-test-app-a/tasks.md',
      specPath: 'artifacts/App A/openspec/changes/run-cross-app-test-app-a/specs/app-a/spec.md',
      taskStatus: { total: 4, completed: 4 },
    },
    changedFiles: ['src/main/java/AppA.java'],
    publicApiChanges: [{ path: '/orders', method: 'GET', description: 'returns order v1' }],
    databaseChanges: [],
    configChanges: [],
    dependencyChanges: [{ name: 'jackson-databind', toVersion: '2.17.0' }],
    testResults: { status: 'passed', total: 4, passed: 4 },
    riskNotes: [],
    requiredCrossAppChecks: [],
  });
  writeBranchSummaryArtifact(paths, {
    branchId: 'branch-b',
    projectName: 'App B',
    changedFiles: ['src/main/java/AppB.java'],
    publicApiChanges: [{ path: '/orders', method: 'GET', description: 'returns order v2' }],
    databaseChanges: [],
    configChanges: [],
    dependencyChanges: [{ name: 'jackson-databind', toVersion: '2.18.0' }],
    testResults: { status: 'passed', total: 3, passed: 3 },
    riskNotes: [],
    requiredCrossAppChecks: [],
  });
  writeBranchSummaryArtifact(paths, {
    branchId: 'branch-c',
    projectName: 'App C',
    changedFiles: ['src/test/java/AppCTest.java'],
    publicApiChanges: [],
    databaseChanges: [],
    configChanges: [],
    dependencyChanges: [],
    testResults: { status: 'failed', total: 2, passed: 1, failed: 1 },
    riskNotes: ['Planning-level requirement decomposition conflict blocks release order.'],
    requiredCrossAppChecks: ['BLOCK integration contract with App A'],
  });
  writeBranchSummaryArtifact(paths, {
    branchId: 'branch-d',
    projectName: 'App D',
    changedFiles: ['src/main/java/AppD.java'],
    publicApiChanges: [],
    databaseChanges: [],
    configChanges: [],
    dependencyChanges: [],
    testResults: { status: 'passed', total: 1, passed: 1 },
    riskNotes: [],
    requiredCrossAppChecks: [],
  });

  const codeReview = runCrossAppCodeReview({ paths, state });
  assert.equal(codeReview.result.status, 'blocked');
  assert.ok(codeReview.result.findings.some(finding => finding.category === 'dependency'));
  assert.equal(fsSync.existsSync(path.join(paths.artifactsDir, 'cross-app/code-review-findings.json')), true);

  const branchRollbackPatch = createAffectedBranchRollbackPatch({
    state,
    review: codeReview.result,
    sourceNodeId: 'cross-app-code-review',
  });
  const branchRollbackState = mergeGraphState(state, branchRollbackPatch);
  assert.equal(branchRollbackState.rollback?.active, true);
  assert.equal(branchRollbackState.branches['branch-a'].status, 'waiting_fix');
  assert.equal(branchRollbackState.branches['branch-b'].status, 'waiting_fix');
  assert.equal(branchRollbackState.branches['branch-d'].status, 'completed');

  const integrationReview = runCrossAppIntegrationReview({ paths, state, codeReview: codeReview.result });
  assert.equal(integrationReview.result.status, 'blocked');
  assert.ok(integrationReview.result.affectedBranches.includes('branch-c'));
  assert.equal(fsSync.existsSync(path.join(paths.artifactsDir, 'cross-app/integration-review-findings.json')), true);

  const mainRollbackPatch = createMainWorkflowRollbackPatch({
    state,
    review: integrationReview.result,
    sourceNodeId: 'cross-app-integration-review',
  });
  assert.ok(mainRollbackPatch, 'planning-level finding should create main workflow rollback');
  const mainRollbackState = mergeGraphState(state, mainRollbackPatch);
  assert.equal(mainRollbackState.currentNodeId, 'implementation-plan');
  assert.equal(mainRollbackState.branches['branch-a'].status, 'pending');

  const delivery = writeCrossAppDeliveryMetadata({
    paths,
    state,
    codeReview: codeReview.result,
    integrationReview: integrationReview.result,
  });
  assert.equal(delivery.metadata.deliveryStatus, 'blocked');
  const appADelivery = delivery.metadata.branches.find(branch => branch.branchId === 'branch-a');
  assert.equal(appADelivery?.tracks?.[0].trackId, 'backend');
  assert.equal(appADelivery?.openSpec?.changeId, 'run-cross-app-test-app-a');
  assert.equal(appADelivery?.openSpec?.taskStatus.completed, 4);
  assert.equal(fsSync.existsSync(path.join(paths.artifactsDir, 'cross-app/delivery-metadata.json')), true);

  await fs.rm(paths.runDir, { recursive: true, force: true });
});

function createTempRunPaths(runId: string): RunPaths {
  const runDir = fsSync.mkdtempSync(path.join(os.tmpdir(), `${runId}-`));
  const paths: RunPaths = {
    runDir,
    inputDir: path.join(runDir, 'input'),
    workspaceDir: path.join(runDir, 'workspace'),
    projectDir: path.join(runDir, 'workspace/project'),
    artifactsDir: path.join(runDir, 'artifacts'),
    logsDir: path.join(runDir, 'logs'),
    agentsDir: path.join(runDir, 'agents'),
    checkpointsDir: path.join(runDir, 'checkpoints'),
    eventsLog: path.join(runDir, 'logs/events.ndjson'),
    permissionLog: path.join(runDir, 'logs/permission-decisions.ndjson'),
    executionState: path.join(runDir, 'execution-state.json'),
    permissionsFile: path.join(runDir, 'permissions.json'),
  };
  for (const dir of [
    paths.inputDir,
    paths.projectDir,
    paths.artifactsDir,
    paths.logsDir,
    paths.agentsDir,
    paths.checkpointsDir,
  ]) {
    fsSync.mkdirSync(dir, { recursive: true });
  }
  return paths;
}

function startupCapability(args: {
  backend?: boolean;
  frontend?: boolean;
  playwrightConfig?: string;
  confidence?: 'high' | 'medium' | 'low' | 'none';
  fallbackReasons?: string[];
} = {}) {
  const generatedAt = '2026-06-28T00:00:00.000Z';
  return {
    projectRoot: 'project',
    frontend: args.frontend ? {
      kind: 'frontend' as const,
      command: 'npm run dev',
      workingDirectory: '.',
      evidence: ['package.json'],
      confidence: args.confidence ?? 'high',
      frameworkSignals: ['vite'],
      scriptSignals: ['dev'],
    } : undefined,
    backend: args.backend ? {
      kind: 'backend' as const,
      command: 'mvn spring-boot:run',
      workingDirectory: '.',
      evidence: ['pom.xml', 'src/main/java'],
      confidence: args.confidence ?? 'high',
      frameworkSignals: ['spring'],
      scriptSignals: ['maven'],
    } : undefined,
    readinessEndpoints: args.backend ? ['/actuator/health'] : [],
    apiBaseUrlConventions: args.backend && args.frontend ? [{ name: 'VITE_API_BASE_URL', source: 'common' as const, confidence: 'high' as const }] : [],
    playwrightConfig: args.playwrightConfig,
    trustedStartup: Boolean(args.backend || args.frontend),
    confidence: args.confidence ?? (args.backend || args.frontend ? 'high' : 'low'),
    fallbackReasons: args.fallbackReasons ?? [],
    generatedAt,
  };
}

function fanoutDecisionFixture(projects: Array<{ name: string; root: string }>): FanoutDecision {
  return {
    schemaVersion: 1,
    candidates: projects,
    includedProjects: projects.map(project => ({
      ...project,
      reason: 'Included by unit test fixture.',
    })),
    excludedProjects: [],
    unresolvedProjects: [],
    confidence: 'high',
    evidence: ['unit test fixture'],
    generatedAt: '2026-06-28T00:00:00.000Z',
  };
}

function readJson(filePath: string): unknown {
  return JSON.parse(fsSync.readFileSync(filePath, 'utf-8'));
}

function readNdjson(filePath: string): Array<{ type?: string; [key: string]: unknown }> {
  return fsSync.readFileSync(filePath, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as { type?: string; [key: string]: unknown });
}

function listRelativeFiles(rootDir: string, currentDir = rootDir): string[] {
  return fsSync.readdirSync(currentDir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) return listRelativeFiles(rootDir, entryPath);
    return [path.relative(rootDir, entryPath).replace(/\\/g, '/')];
  }).sort();
}

class StaticLLMProvider implements LLMProvider {
  lastRequest?: LLMRequest;

  constructor(private readonly content: LLMContentBlock[]) {}

  async createMessage(req: LLMRequest): Promise<LLMResponse> {
    this.lastRequest = req;
    return {
      content: this.content,
      stopReason: 'end_turn',
    };
  }

  async *createMessageStream(_req: LLMRequest): AsyncGenerator<LLMStreamEvent> {
    yield { type: 'message_stop', stopReason: 'end_turn' };
  }
}
