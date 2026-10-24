import * as assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyLifecycleState } from '../lifecycle/index.js';
import { InMemoryApplicationCatalog } from '../platform-sources/applicationCatalog.js';
import { InMemoryRequirementSource } from '../platform-sources/requirementSource.js';
import { getManagementOverview } from '../server/controllers/applicationController.js';
import { getDefaultWorkflow, listWorkflows, updateDefaultWorkflowConfig } from '../server/controllers/requirementPiController.js';
import { listTestingArtifacts } from '../server/controllers/testingController.js';
import type { LifecycleStatePersistence } from '../storage/lifecycleStatePersistence.js';
import type { Page, PageRequest, StorageContext } from '../storage/contracts/common.js';
import type { WorkflowRecord, WorkflowRepository } from '../storage/contracts/workflowRepository.js';
import type { WorkflowDefinition } from '../workflows/types.js';

test('workflow controllers await the injected repository and preserve response envelopes', async () => {
  const workflows = new MemoryWorkflowRepository();
  const dependencies = { workflows, context: { tenantId: 'controller-test' } };

  const initial = await getDefaultWorkflow(fakeContext(), dependencies);
  assert.equal(initial.body.workflow.id, 'default-mrd-to-code');

  const updated = await updateDefaultWorkflowConfig(fakeContext({
    body: { globalConfig: { maxConcurrentAgents: 3 } },
  }), dependencies);
  assert.equal(updated.body.workflow.globalConfig.maxConcurrentAgents, 3);

  const listed = await listWorkflows(fakeContext(), dependencies);
  assert.equal(listed.body.workflows.length, 1);
  assert.equal(workflows.calls.list > 0, true);
  assert.equal(workflows.calls.find > 0, true);
  assert.equal(workflows.calls.save, 1);
});

test('testing query controller loads lifecycle state through async persistence', async () => {
  const runId = 'controller-persistence-testing-run';
  let loads = 0;
  const lifecycle = createEmptyLifecycleState({ requirementId: 'req-controller', runId });
  const persistence: LifecycleStatePersistence = {
    async load(requestedRunId) {
      loads += 1;
      return requestedRunId === runId ? lifecycle : null;
    },
    async save(_state) {},
  };

  const response = await listTestingArtifacts(
    fakeContext({ params: { runId } }),
    undefined,
    persistence,
  );
  assert.deepEqual(response.body, { artifacts: [] });
  assert.equal(loads, 1);
});

test('management controller awaits an injected durable run source', async () => {
  let reads = 0;
  const response = await getManagementOverview(
    fakeContext(),
    new InMemoryApplicationCatalog(),
    new InMemoryRequirementSource(),
    undefined,
    {
      async list() {
        reads += 1;
        return [{
          session: {
            runId: 'managed-run', name: 'Managed run', status: 'completed', progress: 1,
            startedAt: 1, updatedAt: 2, completedAt: 2,
          },
          execution: null,
          lifecycle: null,
        }];
      },
    },
  );
  assert.equal(reads, 1);
  assert.equal(response.body.pipelines[0].runId, 'managed-run');
  assert.equal(typeof response.body.generatedAt, 'string');
});

class MemoryWorkflowRepository implements WorkflowRepository {
  private record?: WorkflowRecord;
  readonly calls = { find: 0, list: 0, save: 0 };

  async findById(_ctx: StorageContext, workflowId: string): Promise<WorkflowRecord | null> {
    this.calls.find += 1;
    return this.record?.value.id === workflowId ? structuredClone(this.record) : null;
  }

  async list(_ctx: StorageContext, _page?: PageRequest): Promise<Page<WorkflowRecord>> {
    this.calls.list += 1;
    return { items: this.record ? [structuredClone(this.record)] : [] };
  }

  async save(ctx: StorageContext, workflow: WorkflowDefinition, expectedVersion?: number): Promise<WorkflowRecord> {
    this.calls.save += 1;
    assert.equal(expectedVersion, this.record?.version);
    this.record = {
      tenantId: ctx.tenantId,
      value: structuredClone(workflow),
      version: (this.record?.version ?? 0) + 1,
    };
    return structuredClone(this.record);
  }
}

function fakeContext(args: {
  params?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
} = {}) {
  return {
    req: {
      param: (name: string) => args.params?.[name] ?? '',
      query: (name: string) => args.query?.[name] ?? '',
      json: async () => args.body ?? {},
    },
    json: (body: any, status = 200) => ({ body, status }),
  };
}
