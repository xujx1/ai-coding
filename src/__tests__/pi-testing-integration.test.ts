import * as assert from 'assert/strict';
import test from 'node:test';
import {
  createSessionExecutionPlan,
} from '../workflows/sessionPlan.js';
import { listPlanNodeContracts } from '../workflows/planNodeRegistry.js';
import { PIPELINE_NODES, normalizeStageId } from '../workflows/definitions/pipelineDefinition.js';

test('PI planning routes E2E responsibility into cross-app testing instead of branch e2e nodes', () => {
  const plan = createSessionExecutionPlan({
    runId: 'pi-testing-plan',
    generatedAt: '2026-07-12T00:00:00.000Z',
    sourceArtifacts: ['artifacts/mrd-clarified.md'],
    decision: {
      schemaVersion: 1,
      candidates: [{ name: 'marketing-web', root: 'marketing-web' }],
      includedProjects: [{ name: 'marketing-web', root: 'marketing-web', reason: 'owned by MRD' }],
      excludedProjects: [],
      unresolvedProjects: [],
      confidence: 'high',
      evidence: [],
      generatedAt: '2026-07-12T00:00:00.000Z',
    },
    manifest: {
      projects: [{
        name: 'marketing-web',
        root: 'marketing-web',
        capabilities: {
          projectRoot: 'marketing-web',
          frontend: {
            kind: 'frontend',
            command: 'npm run dev',
            workingDirectory: 'marketing-web',
            evidence: ['package.json script dev'],
            confidence: 'high',
            frameworkSignals: ['react'],
            scriptSignals: ['dev'],
          },
          readinessEndpoints: ['/'],
          apiBaseUrlConventions: [],
          trustedStartup: true,
          confidence: 'high',
          fallbackReasons: [],
          generatedAt: '2026-07-12T00:00:00.000Z',
        },
      }],
      requirements: [],
    },
  });

  const branch = plan.branches.find(item => item.projectName === 'marketing-web');
  assert.ok(branch);
  assert.deepEqual(branch.tracks.map(track => track.kind), ['frontend']);
  assert.equal(branch.nodes.some(node => node.id === 'spec-generate'), false);
  assert.equal(branch.tracks[0].dependsOn.includes('implementation-plan'), true);
  assert.equal(branch.tracks[0].dependsOn.includes('spec-generate'), false);
  assert.equal(branch.nodes.some(node => node.id === 'e2e-verify'), false);
  const implementationNode = branch.nodes.find(node => node.id === 'implementation-plan');
  assert.ok(implementationNode?.artifactHints.some(artifact => artifact.endsWith('openspec-task.md')));
  assert.ok(implementationNode?.artifactHints.some(artifact => artifact.endsWith('openspec-test-task.md')));
  assert.equal(plan.nodeContracts.some(contract => contract.nodeType === 'cross-app-test'), false);
  assert.equal(plan.nodeContracts.some(contract => contract.nodeType === 'e2e-verify'), false);
  assert.equal(plan.nodeContracts.some(contract => contract.nodeType === 'spec-generate'), false);
  assert.equal(plan.nodeContracts.some(contract => contract.nodeType === 'integration-test-cases'), true);
  assert.equal(plan.nodeContracts.some(contract => contract.nodeType === 'test-data-plan'), true);
  assert.equal(plan.nodeContracts.some(contract => contract.nodeType === 'integration-test-code'), true);
  assert.equal(plan.nodeContracts.some(contract => contract.nodeType === 'deploy-related-apps'), true);
  assert.equal(plan.nodeContracts.some(contract => contract.nodeType === 'execute-integration-tests'), true);
  assert.equal(PIPELINE_NODES.some(node => node.id === 'spec-generate'), false);
  assert.equal(PIPELINE_NODES.some(node => node.id === 'cross-app-test'), false);
  assert.equal(PIPELINE_NODES.some(node => node.id === 'integration-test-cases'), true);
  assert.equal(PIPELINE_NODES.some(node => node.id === 'execute-integration-tests'), true);
  assert.equal(normalizeStageId('spec-generate'), 'implementation-plan');
  assert.equal(normalizeStageId('cross-app-test'), 'execute-integration-tests');
  const executeContract = plan.nodeContracts.find(contract => contract.nodeType === 'execute-integration-tests');
  assert.ok(executeContract?.producedArtifacts.some(artifact => artifact.includes('e2e-summary.json')));
  assert.ok(executeContract?.producedArtifacts.some(artifact => artifact.includes('testing/*/workflow-state.json')));
  assert.equal(executeContract?.resources.browserSlots, 1);
  assert.equal(listPlanNodeContracts().some(contract => contract.nodeType === 'e2e-verify'), false);
});
