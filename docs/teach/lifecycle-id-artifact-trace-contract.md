# 生命周期 ID、产物契约与 Agent Trace 方案

## 1. 结论

在 `ai-coding` 作为唯一主控项目的前提下，第二个核心问题是统一 ID、统一产物契约和统一 trace。

多个 workflow 可以分别推进 PRD、技术方案、代码生成、CI/CD、测试、诊断和归档，但它们必须围绕同一个 `requirementId` 写入同一套生命周期状态。否则后续会出现产物无法追溯、测试报告无法对应部署产物、诊断结果无法回流修复的问题。

第一版建议：

- `requirementId` 作为需求生命周期主 ID。
- `runId` 继续使用 `ai-coding` 当前 session/run ID。
- 生命周期状态单独落盘到 `artifacts/lifecycle-state.json`。
- `execution-state.json` 只保存对生命周期状态的引用，降低对现有运行态结构的侵入。
- 引入 LangSmith 记录 Agent trace，用于跨 workflow 追踪模型调用、工具调用、节点执行和失败复盘。

状态机落地采用 `LifecycleState + WorkflowRun + NodeRun + ArtifactRef + EventLog`。`ai-coding` 是唯一状态写入者，其他能力域只返回结构化结果。详细策略见 `docs/teach/lifecycle-workflow-state-machine.md`。

## 2. 为什么需要统一 ID

需求全生命周期会产生很多对象：

```text
MRD
PRD
技术方案
代码分支
部署产物
Harness / internal pipeline run
测试环境
测试用例
测试报告
失败诊断
修复建议
归档报告
```

如果没有统一 ID，系统无法回答这些问题：

- 这个 PRD 属于哪个 MRD？
- 这个技术方案对应哪个应用？
- 这次代码生成改了哪个分支？
- Harness 或 internal pipeline 哪次执行对应这次需求？
- 测试报告对应哪组部署产物？
- AI-Ops 诊断的是哪次测试失败？
- 修复后重跑的是哪一次？

## 3. 最小 ID 体系

第一版先保留必要 ID，不做过度抽象。

```text
requirementId     需求生命周期主 ID
runId             ai-coding 一次执行会话 ID
appId             应用 ID
repoId            代码仓库 ID 或仓库引用
branchName        本次需求分支
deploymentSetId   本次需求在集成环境的部署产物集合
buildId           构建产物 ID
imageTag          容器镜像 tag
imageDigest       容器镜像 digest
sourceSnapshot    可选来源快照，可以是 commitSha、workspace patch hash 或 generated code snapshot id
pipelineRunId     Harness 或 internal pipeline 执行 ID
environmentId     测试环境 ID
testRunId         测试执行 ID
diagnosisId       诊断报告 ID
artifactId        产物 ID
traceId           Agent / workflow trace ID
```

核心原则：

- `requirementId` 贯穿所有 workflow。
- `runId` 表达一次 `ai-coding` session。
- `appId` 表达多应用 fanout 后的应用分支。
- `deploymentSetId`、`pipelineRunId`、`testRunId`、`diagnosisId` 负责把代码、CI、测试和诊断串起来。
- `commitSha` 不是 MVP 主索引，只作为可选 `sourceSnapshot`。详细策略见 `docs/teach/feature-deployment-artifact-policy.md`。

## 4. requirementId 生成

首次上传 MRD 或创建任务时生成 `requirementId`。

建议格式：

```text
req_<yyyyMMdd>_<slug>
```

示例：

```text
req_20260710_activity_hit_preview
```

生成规则：

- 日期取创建任务当天。
- `slug` 优先来自用户填写的需求标识。
- 如果用户没有填写，基于 MRD 标题生成短 slug。
- 如果冲突，追加短随机串。
- UI 上允许用户编辑展示名，但不建议修改已经生成的稳定 `requirementId`。

## 5. 生命周期状态文件

第一版建议新增：

```text
artifacts/lifecycle-state.json
```

`execution-state.json` 中只保存引用：

```json
{
  "lifecycle": {
    "requirementId": "req_20260710_activity_hit_preview",
    "statePath": "artifacts/lifecycle-state.json"
  }
}
```

这样可以避免把现有 `execution-state.json` 改得过重，也方便后续独立演进生命周期模型。

## 6. LifecycleState 最小结构

```ts
type LifecycleState = {
  requirementId: string;
  runId: string;
  displayName?: string;
  currentPhase: LifecyclePhase;
  createdAt: string;
  updatedAt: string;

  apps: AppDeliveryState[];
  artifacts: ArtifactRef[];
  ciRuns: PipelineRunRef[];
  environments: EnvironmentRef[];
  testRuns: TestRunRef[];
  diagnoses: DiagnosisRef[];
  traces: TraceRef[];
  approvals: ApprovalGateRef[];
  archive?: ArchiveRef;
};
```

建议阶段枚举：

```ts
type LifecyclePhase =
  | 'mrd_uploaded'
  | 'prd_generating'
  | 'prd_reviewing'
  | 'tech_design_generating'
  | 'tech_design_reviewing'
  | 'code_generating'
  | 'code_reviewing'
  | 'ci_running'
  | 'test_env_deploying'
  | 'testing'
  | 'diagnosing'
  | 'fixing'
  | 'archiving'
  | 'completed'
  | 'failed';
```

## 7. 应用交付状态

```ts
type AppDeliveryState = {
  appId: string;
  appName: string;
  repoId?: string;
  repoRef?: string;
  projectRoot?: string;
  branchName?: string;
  deploymentSetId?: string;
  sourceSnapshot?: string;
  buildId?: string;
  imageTag?: string;
  imageDigest?: string;
  status: AppDeliveryStatus;
  changedFiles: string[];
  artifactIds: string[];
  ciRunIds: string[];
  environmentIds: string[];
  testRunIds: string[];
  diagnosisIds: string[];
  traceIds: string[];
};

type AppDeliveryStatus =
  | 'pending'
  | 'designing'
  | 'coding'
  | 'ci_running'
  | 'deployed'
  | 'testing'
  | 'diagnosing'
  | 'fixing'
  | 'completed'
  | 'failed';
```

## 8. 产物契约

所有正式产物都通过 `ArtifactRef` 索引。

```ts
type ArtifactRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  sourceType: ArtifactSourceType;
  path: string;
  summary?: string;
  deploymentSetId?: string;
  sourceSnapshot?: string;
  relatedIds?: string[];
  traceId?: string;
  createdAt: string;
};

type ArtifactSourceType =
  | 'mrd'
  | 'prd'
  | 'tech-design'
  | 'implementation-plan'
  | 'code-change'
  | 'code-review'
  | 'ci-log'
  | 'deploy-result'
  | 'test-strategy'
  | 'test-case'
  | 'data-plan'
  | 'test-script'
  | 'test-report'
  | 'failure-classification'
  | 'diagnosis-report'
  | 'fix-plan'
  | 'archive-report';
```

示例：PRD 产物。

```json
{
  "id": "art_prd_001",
  "requirementId": "req_20260710_activity_hit_preview",
  "runId": "PDRbY_AI59",
  "sourceType": "prd",
  "path": "artifacts/prd.md",
  "createdAt": "2026-07-10T20:00:00+08:00"
}
```

示例：应用技术方案。

```json
{
  "id": "art_tech_001",
  "requirementId": "req_20260710_activity_hit_preview",
  "runId": "PDRbY_AI59",
  "appId": "marketing-admin",
  "sourceType": "tech-design",
  "path": "artifacts/marketing-admin/tech-design.md",
  "createdAt": "2026-07-10T20:05:00+08:00"
}
```

示例：测试报告。

```json
{
  "id": "art_test_report_001",
  "requirementId": "req_20260710_activity_hit_preview",
  "runId": "PDRbY_AI59",
  "appId": "marketing-admin",
  "deploymentSetId": "deployset-42",
  "relatedIds": ["test-run-42", "harness-exec-42", "env-marketing-admin-42"],
  "sourceType": "test-report",
  "path": "artifacts/marketing-admin/test-report.md",
  "createdAt": "2026-07-10T20:30:00+08:00"
}
```

## 9. CI/CD 引用结构

即使 `harness-main` 代码拷贝进 `ai-coding` 仓库统一管理，生命周期状态也不要直接依赖 Harness 原始内部结构。统一使用 `PipelineRunRef` 表达 CI/CD 执行。

第一版可以有两种实现：

- `provider: 'harness'`：调用或复用 Harness Open Source 能力。
- `provider: 'internal'`：在 `ai-coding` 内重写最小 CI/CD 执行能力。

对生命周期状态来说，两者都只是 pipeline run。

```ts
type PipelineRunRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId: string;
  provider: 'harness' | 'internal';
  pipelineId?: string;
  executionId: string;
  branchName?: string;
  deploymentSetId?: string;
  sourceSnapshot?: string;
  buildId?: string;
  imageTag?: string;
  imageDigest?: string;
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled';
  logArtifactIds: string[];
  startedAt?: string;
  finishedAt?: string;
};
```

## 10. 测试环境引用结构

```ts
type EnvironmentRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId: string;
  name: string;
  type: 'test' | 'integration' | 'preview';
  baseUrl?: string;
  containers?: string[];
  pipelineRunId?: string;
  status: 'creating' | 'ready' | 'failed' | 'destroyed';
  createdAt: string;
};
```

## 11. 测试执行引用结构

```ts
type TestRunRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId: string;
  environmentId?: string;
  deploymentSetId?: string;
  strategyArtifactId?: string;
  caseArtifactIds: string[];
  reportArtifactId?: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'cancelled';
  failureClassificationId?: string;
  startedAt?: string;
  finishedAt?: string;
};
```

## 12. 诊断引用结构

```ts
type DiagnosisRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  source:
    | 'ci-failure'
    | 'test-failure'
    | 'deploy-failure'
    | 'docker-failure'
    | 'runtime-alert';
  relatedIds: string[];
  reportArtifactId: string;
  status: 'running' | 'completed' | 'failed';
  rootCauseCategory?: string;
  confidence?: number;
  traceId?: string;
  createdAt: string;
};
```

## 13. LangSmith Trace 引入

可以引入 LangSmith 作为 Agent trace 观测系统，用于追踪：

- 每个 workflow 节点。
- 每次 Agent run。
- 每次 LLM 调用。
- 每次工具调用。
- 每次人工确认等待和恢复。
- 每次失败诊断和修复重跑。

LangSmith 不替代本地事件日志。它是外部观测和调试系统；本地 `events.ndjson`、`execution-state.json` 和 `lifecycle-state.json` 仍然是主事实源。

建议关系：

```text
ai-coding 本地状态 = source of truth
LangSmith trace = 调试、观测、评估、复盘辅助
```

## 14. TraceRef 契约

```ts
type TraceRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  provider: 'langsmith' | 'local';
  traceId: string;
  parentTraceId?: string;
  workflowId?: string;
  nodeId?: string;
  agentId?: string;
  relatedArtifactIds: string[];
  relatedIds: string[];
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'failed';
};
```

## 15. LangSmith Metadata 规范

所有 Agent run 和 tool run 都应写入统一 metadata，便于按需求、应用、节点检索。

建议 metadata：

```json
{
  "requirementId": "req_20260710_activity_hit_preview",
  "runId": "PDRbY_AI59",
  "appId": "marketing-admin",
  "workflowId": "full-lifecycle",
  "nodeId": "testing-execute",
  "phase": "testing",
  "deploymentSetId": "deployset-42",
  "imageTag": "marketing-admin:req_20260710_activity_hit_preview-PDRbY_AI59",
  "pipelineRunId": "pipeline-run-42",
  "testRunId": "test-run-42"
}
```

建议 tags：

```text
ai-coding
full-lifecycle
testing
marketing-admin
req_20260710_activity_hit_preview
```

## 16. Trace 分层

建议 trace 层级：

```text
Lifecycle Trace
  -> Workflow Trace
      -> Node Trace
          -> Agent Trace
              -> LLM Call
              -> Tool Call
```

示例：

```text
req_20260710_activity_hit_preview
  -> full-lifecycle
      -> testing-execute
          -> testing-agent
              -> model call
              -> read_file
              -> run_pytest
              -> write_report
```

## 17. 与本地事件的关系

每次创建 LangSmith trace 后，本地事件也要记录 `traceId`。

示例：

```json
{
  "type": "agent_start",
  "runId": "PDRbY_AI59",
  "requirementId": "req_20260710_activity_hit_preview",
  "appId": "marketing-admin",
  "nodeId": "testing-execute",
  "traceId": "ls_trace_xxx",
  "timestamp": "2026-07-10T20:30:00+08:00"
}
```

这样即使 LangSmith 不可用，本地仍能复盘；如果 LangSmith 可用，就可以跳转查看完整 trace。

## 18. LangSmith 配置

建议环境变量：

```text
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=...
LANGSMITH_PROJECT=ai-coding-lifecycle
```

建议在 `ai-coding` 设置页或本地配置中增加：

```json
{
  "tracing": {
    "provider": "langsmith",
    "enabled": true,
    "project": "ai-coding-lifecycle"
  }
}
```

## 19. 降级策略

LangSmith 失败不能影响主流程。

规则：

- LangSmith 初始化失败：降级为本地 trace。
- 写 trace 失败：记录本地 warning event。
- 网络失败：不阻塞 workflow。
- 本地事件、状态和 artifact 必须完整写入。

## 20. MVP 实施顺序

1. 新增 `lifecycle-state.json` 读写。
2. 新增 `requirementId` 生成逻辑。
3. 新增 `ArtifactRef` 注册函数。
4. 新增 `PipelineRunRef`、`EnvironmentRef`、`TestRunRef`、`DiagnosisRef` 写入函数。
5. 在现有节点执行事件中补充 `requirementId`、`appId`、`artifactId`。
6. 增加可选 LangSmith tracer wrapper。
7. 把 AgentEngine、toolExecution、workflow node runner 接入 tracer wrapper。
8. 在 UI 中展示本地 traceId 和外部 trace 链接。

## 21. 第一版验收标准

给定一个 MRD run：

1. 系统生成稳定 `requirementId`。
2. `artifacts/lifecycle-state.json` 存在且可恢复。
3. PRD、技术方案、测试报告、诊断报告都注册为 `ArtifactRef`。
4. Harness 或 internal pipeline run 能关联到 app、branch 和部署产物。
5. 测试报告能关联到 `testRunId`、`pipelineRunId` 和 `environmentId`。
6. 诊断报告能关联到失败的测试或 CI。
7. Agent 执行可以在本地事件中看到 traceId。
8. 开启 LangSmith 后，可以按 `requirementId` 查到完整 trace。
9. 关闭或失败 LangSmith 时，本地流程仍能完整运行。
