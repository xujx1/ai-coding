# Harness / Internal Runtime 接入方案

## 1. 结论

第三个问题的结论是：不把 Harness 视为一个必须远程调用的外部 API 服务，而是把 `harness-main` 代码先拷贝进 `ai-coding` 仓库统一管理，再根据 MVP 需要抽取或重写最小仓库管理和 CI/CD runtime。

生命周期状态不直接绑定 Harness 原始内部结构，而是统一使用：

```text
PipelineRunRef
EnvironmentRef
ArtifactRef
DiagnosisRef
TraceRef
```

这样无论底层来自 Harness Open Source 代码、内部重写 runtime，还是临时本地脚本模拟，对上层 lifecycle workflow 都是同一个接口。

## 2. 背景

前两个决策已经确定：

- `ai-coding` 是唯一主控项目。
- `requirementId` 贯穿整个需求生命周期。
- 所有产物、测试、诊断、trace 都进入统一生命周期状态。
- `ai-testing`、`ai-ops`、`harness-main` 代码先进入 `ai-coding` 仓库统一管理。

因此第三个问题不是“要不要调用 Harness API”，而是：

```text
ai-coding 内部如何沉淀一个最小仓库管理 + CI/CD runtime，
让 requirementId -> feature/branch -> pipelineRun -> build/image -> environment -> testRun -> diagnosis 可以闭环。
```

## 3. 能力目标

MVP 需要两类基础能力。

仓库管理能力：

- 管理应用代码仓库。
- 管理知识库仓库。
- 注册和查询 repo metadata。
- 按 appId / repoId / tag / keyword 搜索仓库。
- 创建或复用需求分支。
- checkout 代码仓库和知识库仓库。
- 支持知识库更新写入。

CI/CD 能力：

- 记录 buildId、imageTag、imageDigest 等部署产物。
- 触发一次 pipeline run。
- 跟踪 pipeline 状态。
- 采集 stage / step logs。
- 生成测试环境引用。
- 返回测试环境 `baseUrl` 或 container 信息。
- 支持失败后重跑。
- 将 pipeline 日志交给 ops diagnosis workflow。

`commitSha` 只作为可选来源快照，不作为集成环境主索引。测试、诊断和归档以 `RequirementDeploymentSet` 记录的实际部署产物为准。详细策略见 `docs/teach/feature-deployment-artifact-policy.md`。

暂不追求完整 Harness Open Source 能力：

- 完整代码托管平台 UI。
- 完整权限体系。
- 完整 PR review 平台。
- 完整 artifact registry。
- 完整 Gitspaces 能力。
- 完整企业级 Pipeline 语法兼容。

仓库管理详细边界见 `docs/teach/harness-repository-management-policy.md`。

## 4. 推荐目录

原始代码放在 reference：

```text
reference/
  harness-main/
    MIGRATION.md
    original/
```

真正运行能力沉淀到：

```text
src/harness-runtime/
  repositories/
  pipeline-model/
  runner/
  docker-runner/
  log-store/
  environment/
  types.ts

src/integrations/
  git/
  docker/
```

## 5. Runtime 边界

`src/harness-runtime` 是 `ai-coding` 内部仓库管理和 CI/CD runtime，不等同于完整 Harness。

它负责：

```text
RepositoryRef -> BranchRef -> CheckoutRef
CodeRef -> PipelineRun -> Logs -> EnvironmentRef
```

不负责：

```text
完整代码托管平台 UI
完整用户权限
完整 UI
完整制品仓库
完整云端环境管理
知识库内容生成
```

## 6. 上层统一接口

建议定义一个内部接口：

```ts
type StartPipelineInput = {
  requirementId: string;
  runId: string;
  appId: string;
  repoRef: string;
  branchName: string;
  sourceSnapshot?: string;
  pipelineConfigPath?: string;
  environmentType?: 'test' | 'integration' | 'preview';
};

type PipelineRuntime = {
  startPipeline(input: StartPipelineInput): Promise<PipelineRunRef>;
  getPipelineRun(id: string): Promise<PipelineRunRef>;
  collectLogs(id: string): Promise<ArtifactRef[]>;
  resolveEnvironment(id: string): Promise<EnvironmentRef | undefined>;
  rerunPipeline(id: string): Promise<PipelineRunRef>;
  cancelPipeline(id: string): Promise<void>;
};
```

上层 workflow 只依赖 `PipelineRuntime`，不关心底层是 Harness API、Harness 代码复用，还是 internal runner。

## 7. PipelineRunRef

```ts
type PipelineRunRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId: string;
  provider: 'harness' | 'internal' | 'local-script';
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
  environmentId?: string;
  traceId?: string;
  startedAt?: string;
  finishedAt?: string;
};
```

## 8. EnvironmentRef

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

`baseUrl` 是后续 `testing` workflow 的关键输入。

## 9. Docker 只读诊断能力

Docker 能力用于采集证据，不直接开放高危操作。

建议接口：

```ts
type DockerReadOnlyRuntime = {
  listContainers(filter: ContainerFilter): Promise<ContainerRef[]>;
  getContainerLogs(input: ContainerLogInput): Promise<ArtifactRef>;
  inspectContainer(input: InspectContainerInput): Promise<ContainerInspectResult>;
  getDockerEvents(input: DockerEventsInput): Promise<DockerEvent[]>;
};
```

安全约束：

- 只读。
- 限定容器 label、name 前缀或 `requirementId`。
- 限定时间窗口。
- 日志脱敏。
- 禁止 `docker exec`。
- 禁止删除、停止容器。
- 禁止修改网络、volume、镜像。

## 10. 三种实现路径

### 10.1 Harness provider

适合后续真实接入完整 Harness 服务。

```text
ai-coding workflow
  -> PipelineRuntime
  -> Harness provider
  -> Harness Open Source API / internal client
```

优点：

- 能复用完整 Harness 执行能力。
- 未来更接近真实 DevOps 平台。

缺点：

- 本地启动、认证、API、Docker 依赖较多。
- MVP 复杂度高。

### 10.2 Internal provider

适合 MVP。

```text
ai-coding workflow
  -> PipelineRuntime
  -> internal provider
  -> local git / docker / script runner
```

优点：

- 更容易打通 `requirementId`。
- 不依赖完整 Harness 服务启动。
- 便于按生命周期最小需求裁剪。

缺点：

- 初期不是完整 Harness。
- 需要重写最小 pipeline model 和 log store。

### 10.3 Local-script provider

适合最早期 spike。

```text
ai-coding workflow
  -> PipelineRuntime
  -> local-script provider
  -> npm test / mvn test / docker run / shell script
```

优点：

- 最快跑通闭环。
- 接口稳定后可替换成 internal 或 Harness provider。

缺点：

- 不是标准 CI/CD runtime。
- 需要严格控制脚本权限。

## 11. 推荐 MVP 路径

建议顺序：

1. 先定义 `PipelineRuntime` 接口。
2. 先实现 `local-script provider`，快速跑通 lifecycle。
3. 同步拷贝 `harness-main` 到 `reference/harness-main/original/`。
4. 阅读 Harness pipeline、runner、scheduler、log 相关代码。
5. 抽象或重写 `internal provider`。
6. 后续如需要，再实现真正 `Harness provider`。

不要一开始就阻塞在完整 Harness 服务启动和 API 对接上。

## 12. Workflow 接入点

新增 workflow 节点：

```text
harness-prepare-code
harness-start-pipeline
harness-watch-pipeline
harness-collect-logs
harness-resolve-environment
```

在 full lifecycle 中的位置：

```text
code-review-gate
  -> harness-prepare-code
  -> harness-start-pipeline
  -> harness-watch-pipeline
  -> harness-resolve-environment
  -> testing-generate
  -> testing-execute
```

## 13. 失败处理

Pipeline 失败后，不直接进入代码修复。

先做失败分类：

```text
CI_INFRA_FAILURE
DOCKER_RESOURCE_FAILURE
CONFIG_ERROR
BUILD_FAILURE
UNIT_TEST_FAILURE
DEPLOY_FAILURE
ENVIRONMENT_NOT_READY
UNKNOWN
```

处理策略：

- `BUILD_FAILURE`、`UNIT_TEST_FAILURE`：可回流代码修复。
- `CONFIG_ERROR`：只影响本需求私有配置时可自动修复，否则进入异常确认门。
- `DEPLOY_FAILURE`、`ENVIRONMENT_NOT_READY`：进入 ops diagnosis。
- `CI_INFRA_FAILURE`、`DOCKER_RESOURCE_FAILURE`：优先诊断执行底座，不改业务代码。
- `UNKNOWN`：人工确认。

## 14. Trace 与产物

每次 pipeline run 应写入：

- `PipelineRunRef`
- `TraceRef`
- `ci-log` ArtifactRef
- 可选 `deploy-result` ArtifactRef
- 可选 `EnvironmentRef`

LangSmith metadata：

```json
{
  "requirementId": "req_20260710_activity_hit_preview",
  "runId": "PDRbY_AI59",
  "appId": "marketing-admin",
  "workflowId": "full-lifecycle",
  "nodeId": "harness-start-pipeline",
  "pipelineRunId": "pipeline-run-42",
  "deploymentSetId": "deployset-42",
  "imageTag": "marketing-admin:req_20260710_activity_hit_preview-PDRbY_AI59"
}
```

## 15. 第一版验收标准

给定一个应用和一次需求 run：

1. 能生成或记录分支，并记录构建 / 镜像部署产物。
2. 能启动一个 pipeline run。
3. 能把 pipeline run 写入 `lifecycle-state.json`。
4. 能采集 pipeline 日志为 `ci-log` artifact。
5. 能在成功时生成 `EnvironmentRef`。
6. 能把 `EnvironmentRef.baseUrl` 提供给 testing workflow。
7. 能在失败时进入 diagnosis workflow。
8. 能按 `requirementId` 追踪 pipeline、日志、测试和诊断。
