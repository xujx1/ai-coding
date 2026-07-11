# 生命周期 Workflow 状态机落地方案

## 1. 结论

`ai-coding` 是唯一生命周期状态主控和唯一状态写入者。

`ai-testing`、`ai-ops`、`harness-runtime` 不维护独立总状态，也不直接写 `LifecycleState`。它们只返回结构化结果，由 `ai-coding` 统一写入状态机、事件流和产物索引。

MVP 不做复杂 BPMN，先做轻量状态机：

```text
LifecycleState
  需求级当前事实快照，回答这个需求现在走到哪了

WorkflowRun
  某一次 workflow 执行记录，回答这次 run 执行了哪些节点

NodeRun
  单个节点执行记录，回答某个 Agent / 工具节点成功、失败、等待人工、是否可重跑

ArtifactRef
  所有产物引用，回答每一步生成了什么

EventLog
  追加式事件流，回答过程发生过什么
```

核心原则：

```text
LifecycleState 是当前事实快照
EventLog 是历史事实
ArtifactRef 是产物索引
NodeRun 是恢复和重跑依据
```

## 2. 单一写入者原则

只有 `ai-coding` 可以写：

```text
lifecycle-state.json
workflow-runs/*.json
node-runs/*.json
artifacts-index.json
event-log.jsonl
```

其他能力域只能返回结构化结果：

```text
ai-testing
  -> TestPlanResult
  -> DataPlanResult
  -> TestRunResult
  -> TestReportResult

ai-ops
  -> FailureClassification
  -> DiagnosisResult
  -> EvidenceManifest

harness-runtime
  -> PipelineRunRef
  -> EnvironmentRef
  -> DeploymentResult
  -> LogArtifactRef[]
```

`ai-coding` 收到结果后负责：

- 校验结果结构。
- 写入 `ArtifactRef`。
- 更新 `LifecycleState`。
- 追加 `EventLog`。
- 更新对应 `NodeRun` 状态。
- 决定是否进入下一节点、重跑或等待人工确认。

## 3. 状态文件布局

建议落盘：

```text
artifacts/<requirementId>/<runId>/
  lifecycle-state.json
  event-log.jsonl
  artifacts-index.json
  workflow-runs/
    <workflowRunId>.json
  node-runs/
    <nodeRunId>.json
```

`execution-state.json` 只保存引用：

```json
{
  "lifecycle": {
    "requirementId": "req_20260710_activity_hit_preview",
    "runId": "PDRbY_AI59",
    "statePath": "artifacts/req_20260710_activity_hit_preview/PDRbY_AI59/lifecycle-state.json"
  }
}
```

## 4. LifecycleState

`LifecycleState` 是当前事实快照。

```ts
type LifecycleState = {
  requirementId: string;
  runId: string;
  displayName?: string;
  currentPhase: LifecyclePhase;
  status: 'active' | 'waiting_approval' | 'blocked' | 'completed' | 'failed';
  activeWorkflowRunId?: string;
  latestEventId?: string;
  createdAt: string;
  updatedAt: string;

  apps: AppDeliveryState[];
  artifacts: ArtifactRef[];
  approvals: ApprovalGateRef[];
  workflowRuns: WorkflowRunRef[];
  nodeRuns: NodeRunRef[];
  ciRuns: PipelineRunRef[];
  environments: EnvironmentRef[];
  deploymentSets: RequirementDeploymentSetRef[];
  testRuns: TestRunRef[];
  diagnoses: DiagnosisRef[];
  fixCycles: FixCycleRef[];
  traces: TraceRef[];
  archive?: ArchiveRef;
};
```

建议阶段：

```ts
type LifecyclePhase =
  | 'created'
  | 'mrd_clarifying'
  | 'requirement_review_waiting'
  | 'prd_generating'
  | 'tech_design_generating'
  | 'tech_review_waiting'
  | 'code_generating'
  | 'code_review_waiting'
  | 'ci_running'
  | 'environment_planning'
  | 'deploying'
  | 'integration_testing'
  | 'diagnosing'
  | 'fixing'
  | 'archiving'
  | 'completed'
  | 'failed';
```

## 5. WorkflowRun

`WorkflowRun` 表达某一次 workflow 执行。

```ts
type WorkflowRun = {
  id: string;
  requirementId: string;
  runId: string;
  workflowId: string;
  name: string;
  status: WorkflowRunStatus;
  nodeRunIds: string[];
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  startedAt?: string;
  finishedAt?: string;
  traceId?: string;
};

type WorkflowRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled';
```

MVP 可以先内置以下 workflow：

```text
mrd-to-tech-design
code-generation-tdd
ci-deploy-test-env
integration-testing
failure-diagnosis-fix-rerun
archive
```

## 6. NodeRun

`NodeRun` 是恢复和重跑的最小执行单元。

```ts
type NodeRun = {
  id: string;
  requirementId: string;
  runId: string;
  workflowRunId: string;
  nodeId: string;
  nodeType: 'agent' | 'tool' | 'approval' | 'router' | 'system';
  capabilityOwner: 'ai-coding' | 'ai-testing' | 'ai-ops' | 'harness-runtime' | 'human';
  status: NodeRunStatus;
  inputArtifactIds: string[];
  outputArtifactIds: string[];
  relatedIds: string[];
  retryOf?: string;
  attempt: number;
  startedAt?: string;
  finishedAt?: string;
  error?: NodeRunError;
  traceId?: string;
};

type NodeRunStatus =
  | 'pending'
  | 'running'
  | 'waiting_approval'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'blocked';

type NodeRunError = {
  code: string;
  message: string;
  recoverable: boolean;
  diagnosisId?: string;
};
```

## 7. EventLog

`EventLog` 只追加，不覆盖。

```ts
type LifecycleEvent = {
  id: string;
  requirementId: string;
  runId: string;
  workflowRunId?: string;
  nodeRunId?: string;
  type: string;
  phase?: LifecyclePhase;
  actor: 'ai-coding' | 'ai-testing' | 'ai-ops' | 'harness-runtime' | 'human' | 'system';
  relatedIds: string[];
  payload?: Record<string, unknown>;
  createdAt: string;
};
```

事件命名示例：

```text
LIFECYCLE_CREATED
FANOUT_DECISION_WRITTEN
APPROVAL_WAITING
APPROVAL_APPROVED
NODE_STARTED
NODE_SUCCEEDED
NODE_FAILED
ARTIFACT_REGISTERED
PIPELINE_TRIGGERED
DEPLOYMENT_SET_CREATED
TEST_RUN_STARTED
TEST_RUN_FAILED
DIAGNOSIS_COMPLETED
FIX_CYCLE_CREATED
ARCHIVE_COMPLETED
```

## 8. 重跑规则

纯生成节点可重跑：

```text
PRD 生成
技术方案生成
测试策略生成
测试用例生成
造数计划生成
诊断报告生成
归档报告生成
```

有副作用节点谨慎重跑：

```text
CI
部署
造数
测试执行
修复应用
知识库更新
```

人工门不能自动跳过：

```text
requirement-clarification-gate
tech-review-gate
pre-deploy-code-review-gate
exception gates
```

归档节点只能幂等重跑：

```text
archive report
knowledge update
trace summary
```

## 9. 恢复规则

系统恢复时按以下顺序读取：

```text
execution-state.json
  -> lifecycle-state.json
  -> activeWorkflowRun
  -> latest NodeRun
  -> event-log.jsonl tail
  -> artifacts-index.json
```

恢复策略：

```text
latest NodeRun = running 且超时
  -> 标记 failed 或 blocked

latest NodeRun = waiting_approval
  -> 恢复人工确认 UI

latest NodeRun = failed 且 recoverable
  -> 允许用户选择重跑、诊断或人工处理

latest NodeRun = succeeded
  -> 从下一个 pending node 继续
```

## 10. 状态更新事务

每个节点完成后按固定顺序写入：

```text
1. 写产物文件
2. 更新 artifacts-index.json
3. 更新 node-runs/<nodeRunId>.json
4. 更新 workflow-runs/<workflowRunId>.json
5. 更新 lifecycle-state.json
6. 追加 event-log.jsonl
```

如果中间失败，恢复时以 event log 和 artifact index 交叉校验。

MVP 可以先用文件锁或单进程队列保证串行写入，暂不需要数据库事务。

## 11. LangSmith 关系

LangSmith 只用于 Agent trace 观测，不是状态源。

```text
本地状态机 = source of truth
LangSmith trace = observability
```

每个 `WorkflowRun` 和 `NodeRun` 可以带 `traceId`，用于跳转到 LangSmith 查模型调用和工具调用细节。

## 12. 当前决策

- `ai-coding` 是唯一 lifecycle orchestrator 和唯一状态写入者。
- `ai-testing`、`ai-ops`、`harness-runtime` 只返回结构化结果。
- MVP 用轻量文件状态机，不做复杂 BPMN。
- `LifecycleState` 是当前事实快照。
- `EventLog` 是追加式历史事实。
- `NodeRun` 是恢复和重跑依据。
- `ArtifactRef` 是产物索引。
- LangSmith 只做 trace，不替代本地状态。
