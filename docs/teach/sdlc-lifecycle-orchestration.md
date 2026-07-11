# AI Coding 全生命周期编排方案

## 1. 结论

第一版将 `ai-coding` 作为唯一主控项目，统一承载需求全生命周期的状态、事件、产物、人工确认和归档。

`ai-testing`、`ai-ops` 的能力不作为长期独立平台互相调用，而是逐步迁入或封装进 `ai-coding` 的能力域中。Harness Open Source 相关代码也进入 `ai-coding` 仓库统一管理，但第一阶段先隔离拷贝，后续只抽取或重写支撑生命周期闭环的基础仓库管理和 CI/CD 能力。

目标不是搭多个系统互相调用，而是在 `ai-coding` 内集成多个 workflow，围绕同一个 `requirementId` 推进研发交付。

## 2. 背景

需求全生命周期可以从 MRD 已存在开始，暂不覆盖业务数据自动生成 MRD。

第一版目标链路：

```text
MRD 输入
  -> PRD 生成与评审
  -> 技术方案生成与评审
  -> 代码理解与代码生成
  -> Harness CI/CD 构建与部署测试环境
  -> 测试策略、用例、造数、自动化脚本生成
  -> 集成测试执行与报告
  -> 测试环境、Harness、Docker 日志诊断
  -> 修复回流与重跑
  -> 归档
```

## 3. 主控归属

`ai-coding` 作为 Lifecycle Orchestrator，负责：

- 创建和恢复 session。
- 维护统一 `runId`、`requirementId` 和应用分支状态。
- 管理 MRD、PRD、技术方案、代码变更、测试报告、诊断报告和归档报告。
- 注册和执行多个 workflow。
- 编排人工确认门。
- 调用 Harness、测试能力和诊断能力。
- 保留事件日志、工具轨迹和产物索引。

不建议第一版新建 `ai-sdlc-orchestrator` 项目。原因是当前 `ai-coding` 已经具备 session、workflowInstance、branch、track、artifact、event 和 confirmation gate 基础，先在现有项目里跑通闭环更务实。

后续如果平台化复杂度上升，再抽出独立 orchestrator。

## 4. 能力边界

### 4.1 ai-coding

主能力：

- MRD 澄清。
- PRD 生成与评审。
- 技术方案生成与评审。
- 多应用 fanout。
- 代码理解、代码生成和代码审查。
- 单元测试和本地验证。
- 生命周期主状态维护。
- 归档。

### 4.2 testing 能力

从 `ai-testing` 迁入或封装：

- 集成环境测试策略生成。
- 跨应用测试计划生成。
- 集成测试用例生成。
- 缺口分析。
- 造数计划。
- 测试数据准备、校验和清理。
- 自动化脚本生成。
- pytest / API / E2E 执行。
- 测试报告。
- 回归选择。

边界：

- 单元测试属于 `ai-coding` 的代码生成和 TDD 闭环。
- `ai-testing` 只负责测试环境里的集成测试、跨应用验证和造数。
- 失败根因判断交给 ops 能力，`ai-testing` 只提供测试报告和失败证据。

详细策略见 `docs/teach/integration-testing-lifecycle-strategy.md`。

建议在 `ai-coding` 中按能力域落地，而不是保留旧项目名：

```text
src/testing/
  strategy/
  cases/
  data-plans/
  scripts/
  execution/
  reports/
  regression/
```

### 4.3 ops 能力

从 `ai-ops` 迁入或封装：

- Harness pipeline 日志诊断。
- Docker 容器日志诊断。
- 测试环境应用日志诊断。
- APM / trace / metrics 工具接入。
- 相似故障检索。
- 修复建议。
- 复盘知识沉淀。

建议落地：

```text
src/ops/
  collectors/
  diagnosis/
  failure-classifier/
  evidence/
  runbooks/
  incidents/
```

### 4.4 Harness 能力

Harness Open Source 作为代码仓库、知识库仓库、CI/CD、流水线、日志和测试环境执行底座。

代码管理策略：

- 第一阶段把 `/Users/xu/IdeaProjects/harness-main` 拷贝到 `ai-coding` 仓库的隔离目录。
- 不直接把 Go 代码揉进 `ai-coding` 核心 TypeScript 运行态。
- 先把它作为 reference 管理，不参与主项目构建。
- 后续根据 MVP 需要，只保留或重写基础能力。

建议目录：

```text
reference/harness-main/
```

最终需要在 `ai-coding` 内沉淀的能力：

```text
src/integrations/harness/
  client.ts
  repositories.ts
  knowledgeRepositories.ts
  branches.ts
  pipelines.ts
  executions.ts
  logs.ts
  environments.ts
  types.ts
```

第一版优先支持：

- 管理应用代码仓库。
- 管理知识库仓库。
- 按 appId / repoId / tag / keyword 搜索仓库。
- 创建或复用分支。
- checkout 代码仓库和知识库仓库。
- 支持知识库更新写入。
- 触发构建并记录部署产物。
- 触发 pipeline。
- 查询 pipeline 状态。
- 获取 stage / step logs。
- 获取部署测试环境结果。
- 取消或重跑 pipeline。

如果 Harness API 接入成本高，MVP 可以先不依赖完整 Harness 服务，而是基于拷贝代码中的模型和执行逻辑，重写一个最小 `internal-harness`：

```text
src/harness-runtime/
  pipeline-model/
  docker-runner/
  log-store/
  environment/
```

核心要求不是复刻完整 Harness Open Source，而是让 `requirementId -> feature/branch -> pipelineRun -> build/image -> environment -> testRun -> diagnosis` 可以在一个仓库内闭环。

分支、部署产物、CI 触发和测试环境发布前代码审核策略见 `docs/teach/branch-commit-release-policy.md`。集成环境阶段的 feature 与部署产物绑定策略见 `docs/teach/feature-deployment-artifact-policy.md`。

代码仓库和知识库仓库管理边界见 `docs/teach/harness-repository-management-policy.md`。

### 4.5 Docker 只读诊断能力

Docker socket 权限很高，不能直接暴露给 Agent。

需要受控只读工具：

```text
src/integrations/docker/
  listContainers.ts
  containerLogs.ts
  inspectContainer.ts
  dockerEvents.ts
  types.ts
```

约束：

- 只读。
- 限定容器 label、name 前缀或 requirementId。
- 限定时间窗口。
- 日志脱敏。
- 禁止 `exec`、删除容器、改网络、改 volume。

### 4.6 应用知识库能力

Harness / harness-runtime 只负责管理代码仓库和知识库仓库，不负责知识库生成和更新。

`ai-coding` 负责：

- 从应用代码仓库扫描生成单应用 `app-knowledge-base`。
- 调用 GitNexus 做代码链路扫描。
- 维护全应用 knowledge registry。
- 在需求执行时按阶段读取应用知识库。
- 在归档后提取 knowledge delta。
- 更新知识库仓库内容和 freshness。

详细策略见 `docs/teach/application-knowledge-repository-strategy.md`。

MRD 到全应用影响范围判断采用 fanout 机制：global 知识库和向量库负责候选召回，结构化索引和 GitNexus 图谱负责证据补强，候选应用再读取单应用知识库精排。详细策略见 `docs/teach/mrd-fanout-decision-policy.md`。

需求澄清阶段确认的是需求影响范围，即 `FanoutDecision`。测试环境最终部署范围由 `EnvironmentPlan` 表达，需要结合 fanout、技术方案、代码 diff、CI 结果和共享环境健康状态生成。详细策略见 `docs/teach/test-environment-deployment-scope-strategy.md`。

## 5. 多 Workflow 设计

Workflow 可以多个，但必须写入同一份生命周期状态。

建议拆分：

```text
Workflow 1: MRD -> PRD -> Tech Design
Workflow 2: Tech Design -> Code Generation -> Unit Test
Workflow 3: CI/CD -> Deploy Test Env
Workflow 4: Integration Test Strategy -> Data Setup -> Test Execution -> Report
Workflow 5: Failure Diagnosis -> Fix Suggestion -> Re-run
Workflow 6: Archive
```

也可以组合成端到端 workflow：

```text
Full Lifecycle Workflow
  -> mrd-clarify
  -> requirement-clarification-gate
  -> prd-generate
  -> tech-design
  -> tech-review-gate
  -> code-generate
  -> unit-test
  -> autofix
  -> ci-build
  -> pre-deploy-code-review-gate
  -> environment-plan
  -> harness-deploy
  -> integration-testing-generate
  -> data-setup
  -> testing-execute
  -> failure-diagnosis
  -> fix-and-rerun
  -> archive
```

## 6. 统一生命周期状态

无论执行哪个 workflow，都写同一个 `LifecycleState`。

`ai-coding` 是唯一状态写入者。`ai-testing`、`ai-ops`、`harness-runtime` 不维护独立总状态，只返回结构化结果，由 `ai-coding` 写入 `LifecycleState`、`WorkflowRun`、`NodeRun`、`ArtifactRef` 和 `EventLog`。详细策略见 `docs/teach/lifecycle-workflow-state-machine.md`。

示例结构：

```ts
type LifecycleState = {
  requirementId: string;
  runId: string;
  currentPhase: LifecyclePhase;
  apps: AppDeliveryState[];
  artifacts: ArtifactRef[];
  approvals: ApprovalGate[];
  ciRuns: HarnessRunRef[];
  environments: EnvironmentRef[];
  testRuns: TestRunRef[];
  diagnoses: DiagnosisRef[];
  archive?: ArchiveRef;
};

type AppDeliveryState = {
  appId: string;
  appName: string;
  repoRef?: string;
  branchName?: string;
  deploymentSetId?: string;
  sourceSnapshot?: string;
  buildId?: string;
  imageTag?: string;
  imageDigest?: string;
  status: AppDeliveryStatus;
  changedFiles: string[];
  ciRunIds: string[];
  testRunIds: string[];
  diagnosisIds: string[];
};
```

核心 ID：

```text
requirementId
runId
appId
repoId
branchName
deploymentSetId
buildId
imageTag
imageDigest
sourceSnapshot
pipelineExecutionId
environmentId
testRunId
diagnosisId
archiveId
```

## 7. 统一事件

建议事件命名：

```text
MRD_UPLOADED
PRD_GENERATED
PRD_REVIEW_WAITING
PRD_APPROVED
TECH_DESIGN_GENERATED
TECH_DESIGN_REVIEW_WAITING
TECH_DESIGN_APPROVED
BRANCH_CREATED
CODE_GENERATED
CODE_REVIEW_WAITING
CODE_APPROVED
CI_TRIGGERED
CI_PASSED
CI_FAILED
DEPLOY_STARTED
DEPLOYED_TO_TEST
TEST_STRATEGY_GENERATED
TEST_CASES_GENERATED
TEST_EXECUTION_STARTED
TEST_EXECUTION_PASSED
TEST_EXECUTION_FAILED
FAILURE_DIAGNOSIS_STARTED
FAILURE_DIAGNOSIS_COMPLETED
FIX_GENERATED
RERUN_TRIGGERED
ARCHIVED
```

## 8. 统一产物契约

产物必须可追踪来源。

建议最小结构：

```ts
type ArtifactRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  sourceType:
    | 'mrd'
    | 'prd'
    | 'tech-design'
    | 'code-change'
    | 'ci-log'
    | 'deploy-result'
    | 'test-strategy'
    | 'test-case'
    | 'test-report'
    | 'diagnosis-report'
    | 'archive-report';
  path: string;
  summary?: string;
  deploymentSetId?: string;
  sourceSnapshot?: string;
  createdAt: string;
};
```

## 9. 人工确认门

第一版固定人工确认门只保留三道：

- 需求澄清确认。
- 技术方案确认。
- 测试环境发布前代码审核。

其他环节默认自动推进。只有触发高风险命令、大范围代码变更、共享环境部署、数据变更、未知失败、生产动作或权限升级时，才进入异常人工确认门。

确认门不是阻碍自动化，而是保证系统可信和可审计。详细策略见 `docs/teach/approval-gates-automation-policy.md`。

## 10. 失败归因

测试或部署失败不能直接默认是代码 bug。

失败归因由迁入后的 `ops` 能力承担，能力来源参考 `ai-ops`。`ops` 负责证据收集、失败分类、根因候选和修复建议；`ai-coding` 只消费结构化归因结果并决定下一步 workflow。

建议统一失败分类：

```text
CODE_BUG
TEST_SCRIPT_BUG
DATA_SETUP_FAILED
ENVIRONMENT_NOT_READY
DEPENDENCY_UNAVAILABLE
CONFIG_ERROR
CI_INFRA_FAILURE
DOCKER_RESOURCE_FAILURE
UNKNOWN
```

自动修复策略：

- `CODE_BUG`：可回流到代码修复 workflow。
- `TEST_SCRIPT_BUG`：回流测试脚本修复。
- `DATA_SETUP_FAILED`：回流造数计划。
- `ENVIRONMENT_NOT_READY`、`CI_INFRA_FAILURE`、`DOCKER_RESOURCE_FAILURE`：优先诊断环境和执行底座，不改业务代码。
- `UNKNOWN`：要求人工确认。

详细策略见 `docs/teach/failure-classification-autofix-policy.md`。

## 11. 建议目录结构

```text
src/
  lifecycle/
    state.ts
    events.ts
    artifacts.ts
    approvals.ts
    transitionRules.ts

  workflows/
    definitions/
      mrdToDesign.ts
      codeGeneration.ts
      harnessDeploy.ts
      testing.ts
      failureDiagnosis.ts
      fullLifecycle.ts

  testing/
    strategy/
    cases/
    data-plans/
    scripts/
    execution/
    reports/
    regression/

  ops/
    collectors/
    diagnosis/
    failure-classifier/
    evidence/
    runbooks/
    incidents/

  integrations/
    harness/
    docker/
    git/
```

## 12. 代码迁移策略

第一阶段迁移不要一边搬代码一边深度重构。先把 `ai-testing`、`ai-ops` 和 `harness-main` 中已经实现或可参考的能力代码整体拷贝到 `ai-coding` 目录内，保留来源边界和可追溯关系，后续再逐步裁剪。

建议先按来源建立 reference 目录：

```text
reference/
  ai-testing/
  ai-ops/
  harness-main/
```

或按能力域建立目录，但保留迁移说明：

```text
src/testing/
  MIGRATION.md
src/ops/
  MIGRATION.md
```

迁移原则：

- 先完整拷贝，避免遗漏隐含依赖。
- 保留原始目录结构和关键 README / docs，便于对照。
- 暂不追求一次性统一类型、事件、存储和 UI。
- 先保证代码可读、可编译或至少可静态隔离。
- 后续再按 `testing`、`ops`、`harness-runtime`、`integrations` 能力域做瘦身。
- 最终只保留支撑 MVP 生命周期闭环的基本功能。

MVP 需要优先保留的基础能力：

```text
testing:
  集成测试策略生成
  跨应用测试计划生成
  集成测试用例生成
  DataPlan 造数计划
  测试数据准备、校验和清理
  自动化脚本生成
  测试执行
  测试报告
  失败证据整理

ops:
  Harness 日志采集
  Docker 只读日志采集
  测试环境应用日志采集
  测试失败证据读取
  失败分类
  失败诊断
  修复建议

harness:
  应用代码仓库管理
  知识库仓库管理
  repo registry / search / tags
  branch / checkout / update
  分支 / 部署产物引用
  pipeline run 模型
  pipeline 状态查询
  step log 采集
  buildId / imageTag / imageDigest 记录
  RequirementDeploymentSet 写入支持
  测试环境结果引用
  Docker runner / logs 的最小封装
```

可以暂缓或裁剪的能力：

```text
testing:
  单元测试能力
  失败归因
  复杂可视化编排
  高级回归选择
  大规模知识库索引
  大规模测试资产管理

ops:
  完整可视化工作流编辑器
  GitLab OAuth 完整接入
  复杂 MCP 市场化配置
  生产环境恢复动作自动执行
  多入口告警平台化能力

harness:
  完整代码托管平台 UI
  完整权限体系
  完整 artifact registry
  完整 Gitspaces 能力
  完整企业级 Pipeline 语法兼容
```

推荐迁移节奏：

1. 先拷贝 `ai-testing`、`ai-ops` 和 `harness-main` 到 `ai-coding/reference/`。
2. 记录来源 commit、迁移时间和保留能力清单。
3. 给 `ai-coding` 增加最小 adapter，先以函数调用或 CLI 调用方式接入。
4. 跑通一个 MRD 到测试失败诊断的最小链路。
5. 再把真正用到的代码迁到 `src/testing/`、`src/ops/`、`src/harness-runtime/`。
6. 删除或归档未使用的 reference 代码。

## 13. MVP 落地顺序

### 阶段 1：统一状态和事件

- 新增 `LifecycleState`。
- 把现有 `workflowInstance` 与生命周期状态建立映射。
- 新增统一事件类型。
- 新增 artifact contract。

### 阶段 2：Harness adapter

- 实现 Harness provider / RepositoryManager。
- 管理代码仓库和知识库仓库。
- 触发 pipeline。
- 查询状态。
- 获取日志。
- 记录 `ciRuns` 和 `environments`。
- 根据 `EnvironmentPlan` 部署需求分支版本或复用稳定版本。

### 阶段 3：Integration testing workflow

- 从 PRD、技术方案、fanout 结果和代码变更生成集成测试策略和跨应用用例。
- 生成造数计划，完成测试数据准备、校验和清理。
- 在测试环境执行 API / E2E / 回归测试。
- 写入测试报告和失败证据。

### 阶段 4：Ops diagnosis workflow

- 采集 Harness logs、Docker logs、测试环境应用日志。
- 输出结构化诊断报告。
- 根据失败分类决定是否回流修复。

### 阶段 5：Fix and rerun

- 低风险失败自动生成修复。
- 触发 Harness 重跑。
- 触发测试重跑。
- 汇总闭环结果。

### 阶段 6：归档

- 汇总 MRD、PRD、技术方案、代码变更、CI、部署、测试、诊断和修复记录。
- 生成最终 archive report。

## 14. 第一版验收标准

给定一份 MRD 和一个应用仓库，系统能够：

1. 生成 PRD 和技术方案。
2. 生成代码变更。
3. 触发 Harness CI/CD。
4. 部署到测试环境。
5. 生成集成测试策略、造数计划和跨应用测试用例。
6. 在测试环境执行集成测试并输出报告。
7. 在失败时采集 Harness、Docker 和应用日志。
8. 输出失败归因和修复建议。
9. 至少完成一次修复回流和重跑。
10. 归档完整交付链路。

端到端 MVP 的详细验收场景见 `docs/teach/e2e-mvp-acceptance-scenario.md`。第一版必须覆盖一次失败、归因、修复、重跑和归档，不能只演示 happy path。

第一阶段实现完整 workflow 的所有节点，每个节点允许先采用 MVP 级实现。

## 15. 当前决策

- `ai-coding` 是唯一主控项目。
- 多个 workflow 在 `ai-coding` 内注册和推进。
- 第一阶段实现端到端 workflow 的所有节点。
- `ai-testing` 能力迁入或封装为 `testing` 能力域，但只负责集成环境测试、跨应用验证和造数；单元测试由 `ai-coding` 负责。
- `ai-ops` 能力迁入或封装为 `ops` 能力域。
- `harness-main` 先拷贝进 `ai-coding` 仓库统一管理，后续只保留或重写基础仓库管理和 CI/CD 执行能力。
- 暂不实现业务数据自动生成 MRD。
- 迁移代码时先整体拷贝，再基于 MVP 基础能力逐步裁剪。
