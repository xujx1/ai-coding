# 端到端 MVP 验收链路

## 1. 结论

第一版 MVP 的验收目标不是覆盖所有 DevOps 能力，而是跑通一条可追踪、可恢复、可诊断、可归档的需求全生命周期链路。

验收场景固定为：

```text
1 个 MRD
  -> fanout 命中 2-3 个应用
  -> 1-2 个应用产生代码变更
  -> shared-overlay 测试环境
  -> DataPlan 造数
  -> 集成测试失败一次
  -> ops 归因
  -> FixCycle
  -> RequirementDeploymentSet v2
  -> 重测通过
  -> 归档并更新知识库
```

这条链路是后续实现、迁移、测试和演示的共同验收基线。

## 2. 验收范围

MVP 从 MRD 已存在开始，不覆盖业务数据自动生成 MRD。

必须覆盖：

- 需求澄清。
- 应用 fanout。
- PRD 生成。
- 技术方案生成。
- 人工确认门。
- 多应用代码生成。
- 单元测试。
- 测试环境发布前代码审核。
- RepositoryManager。
- Harness / internal runtime 构建与部署。
- RequirementDeploymentSet。
- 集成测试策略。
- DataPlan 造数。
- 集成测试执行。
- ops 失败归因。
- FixCycle。
- 修复重跑。
- 归档。
- 知识库增量更新。

不覆盖：

- 生产发布。
- 业务数据自动生成 MRD。
- 完整代码托管平台 UI。
- 完整测试平台 UI。
- 完整运维平台 UI。
- 完整企业权限系统。
- 大规模多租户资源调度。

## 3. 示例应用范围

验收时选一个小型跨应用场景：

```text
primaryApps:
  app-a
  app-b

secondaryApps:
  app-c

testOnlyApps:
  app-d
```

要求：

- 至少 2 个应用进入 `FanoutDecision`。
- 至少 1 个应用进入 `primaryApps` 并生成代码变更。
- 至少 1 个应用作为 `secondaryApps` 或 `testOnlyApps` 参与集成测试。
- 不要求真实覆盖 100+ 应用，但 fanout 机制必须能表达 100+ 应用场景下的候选召回与缩小范围。

## 4. 端到端流程

```text
MRD uploaded
  -> mrd-clarify
  -> fanout-recall
  -> fanout-rank
  -> requirement-clarification-gate
  -> prd-generate
  -> tech-design
  -> tech-review-gate
  -> repository-checkout
  -> code-generate
  -> unit-test
  -> code-review-summary
  -> pre-deploy-code-review-gate
  -> environment-plan
  -> harness-build
  -> harness-deploy
  -> deployment-set-v1
  -> integration-test-strategy
  -> data-plan
  -> data-setup
  -> integration-test-execute
  -> test-failed
  -> ops-failure-classification
  -> fix-cycle-created
  -> fix-applied
  -> harness-rerun
  -> deployment-set-v2
  -> integration-test-rerun
  -> test-passed
  -> archive
  -> knowledge-delta-update
```

## 5. 必须产生的状态

必须写入统一状态机：

```text
LifecycleState
WorkflowRun
NodeRun
EventLog
ArtifactRef
ApprovalGateRef
```

关键状态要求：

- 每个节点都有 `NodeRun`。
- 每个人工门都有 `ApprovalGateRef`。
- 每个产物都有 `ArtifactRef`。
- 每次失败都有 `FailureClassification`。
- 每次修复都有 `FixCycle`。
- 每次部署事实都有独立 `RequirementDeploymentSet`。
- `ai-testing`、`ai-ops`、`harness-runtime` 不直接写总状态，只返回结构化结果。

## 6. 必须产生的产物

```text
artifacts/<requirementId>/<runId>/
  lifecycle-state.json
  event-log.jsonl
  artifacts-index.json

  fanout/
    fanout-recall.json
    fanout-decision.json
    fanout-evidence.md

  prd/
    prd.md

  tech-design/
    app-a-tech-design.md
    app-b-tech-design.md

  code/
    changed-files.json
    code-review-summary.md
    unit-test-result.json

  deployment/
    environment-plan.json
    deployment-set-v1.json
    deployment-set-v2.json

  testing/
    integration-test-strategy.md
    cross-app-test-plan.md
    integration-test-cases.json
    data-plan.json
    test-report-v1.md
    test-report-v2.md
    test-evidence/

  ops/
    failure-classification.json
    diagnosis-report.md
    evidence-manifest.json

  fix/
    fix-cycle.json
    fix-summary.md

  archive/
    archive-report.md
    knowledge-delta.json
```

## 7. 人工确认门验收

MVP 必须出现三道固定人工确认门：

```text
requirement-clarification-gate
tech-review-gate
pre-deploy-code-review-gate
```

要求：

- 复用 `ai-coding` 现有 session / event / confirmation gate UI。
- 不新增独立审批系统。
- 确认门写入 `ApprovalGateRef`。
- `Approve` 后继续下一个节点。
- `Request Changes` 能携带反馈回到上一个生成节点。
- 决策写入 `EventLog`。

异常确认门不要求必现，但必须能通过模拟条件触发：

```text
UNKNOWN
低置信度 CODE_BUG
schema 变更
共享测试数据变更
高风险业务逻辑
```

## 8. RepositoryManager 验收

MVP 必须证明 Harness / harness-runtime 能管理两类仓库：

```text
应用代码仓库
知识库仓库
```

最低要求：

- 能注册 `RepositoryRef`。
- 能按 `appId` 找到代码仓库。
- 能找到 knowledge repo。
- 能 checkout 或定位本地代码仓库。
- 能 checkout 或定位知识库仓库。
- 能创建或复用需求分支，或生成 workspace snapshot。
- 能写入知识库更新。

第一版 provider 定为：

```text
harness provider
```

原因是 `harness-main` 基于 Gitness，具备代码仓库、Git clone URL、SSH git service、branch、pull request、import、keyword search、repo tags 等仓库能力。它应作为代码仓库和知识库仓库管理的主底座。

工程落地允许保留 fallback：

```text
local / git provider
```

fallback 只用于本地开发、测试或 Harness 服务不可用时避免阻塞，不作为最终仓库管理目标。

## 9. 部署与测试环境验收

默认使用：

```text
EnvironmentPlan.mode = shared-overlay
```

要求：

- `primaryApps` 部署需求分支或 workspace snapshot 的构建产物。
- `secondaryApps` 默认复用稳定版本，必要时部署。
- `testOnlyApps` 不部署新版本，只做回归或契约验证。
- 部署完成生成 `RequirementDeploymentSet v1`。
- 修复后生成 `RequirementDeploymentSet v2`。
- v1 和 v2 不能互相覆盖。

## 10. 造数验收

必须生成结构化 `DataPlan`。

要求：

- 使用 `requirementId` / `runId` / `environmentId` / `testRunId` 追踪。
- 优先 API 造数。
- 允许直写测试数据库。
- DB 直写必须限定在测试环境，且写入数据必须带隔离键或独立 tenant / namespace。
- 必须包含 setup、validation、cleanup。
- 共享测试数据变更必须进入异常确认门。
- cleanup 失败必须写入测试报告和归档风险。

## 11. 失败与修复验收

验收链路必须故意制造一次失败。

可选失败类型：

```text
TEST_SCRIPT_BUG
DATA_SETUP_FAILED
CODE_BUG
CONFIG_ERROR
```

第一版不固定失败类型，demo 中选择任一低风险、可控、容易修复的失败即可，例如：

```text
TEST_SCRIPT_BUG
DATA_SETUP_FAILED
CONFIG_ERROR
```

目标是验证失败归因、FixCycle 和重跑链路，不必在第一版纠结具体失败类型，也不必一开始承担复杂代码修复风险。

要求：

- `ai-testing` 输出失败报告和证据。
- `ai-ops` 输出 `FailureClassification` 和 `DiagnosisReport`。
- `ai-ops` 不直接修改代码、不直接重跑。
- `FixCycle` 记录修复 owner 和修复类型。
- 修复后触发重跑。
- 重跑生成 `deployment-set-v2.json` 或复用部署产物但生成新的测试执行引用。
- 最终测试通过。

## 12. 归档验收

归档必须汇总：

- MRD。
- PRD。
- 技术方案。
- FanoutDecision。
- EnvironmentPlan。
- RequirementDeploymentSet v1 / v2。
- TestRun v1 / v2。
- FailureClassification。
- DiagnosisReport。
- FixCycle。
- 人工确认记录。
- 关键事件流。
- 知识库更新结果。

归档后必须：

- 生成 `archive-report.md`。
- 生成 `knowledge-delta.json`。
- 更新受影响应用知识库。
- 更新 GitNexus graph patch 并默认自动应用。
- 更新 freshness。

## 13. 通过标准

端到端 MVP 通过标准：

1. 从一份 MRD 启动完整生命周期。
2. 生成并确认 `FanoutDecision`。
3. 生成并确认 PRD / 技术方案。
4. 至少一个应用生成代码变更和单元测试结果。
5. 代码审核确认后进入测试环境部署。
6. 生成 `EnvironmentPlan`。
7. 生成 `RequirementDeploymentSet v1`。
8. 生成 `DataPlan` 并完成造数。
9. 集成测试第一次失败。
10. ops 完成失败归因。
11. 生成 `FixCycle`。
12. 修复并重跑。
13. 生成 `RequirementDeploymentSet v2` 或新的 test run 引用。
14. 集成测试最终通过。
15. 归档报告生成。
16. 知识库完成增量更新，所有 delta / graph patch 默认自动应用。
17. 所有关键对象都能通过 `requirementId` 和 `runId` 追踪。

## 14. 第一阶段 Workflow 节点范围

第一阶段实现完整端到端链路中的所有 workflow 节点，不只做局部 demo。

必须实现的节点：

```text
mrd-clarify
fanout-recall
fanout-rank
requirement-clarification-gate
prd-generate
tech-design
tech-review-gate
repository-checkout
code-generate
unit-test
code-review-summary
pre-deploy-code-review-gate
environment-plan
harness-build
harness-deploy
deployment-set
integration-test-strategy
data-plan
data-setup
integration-test-execute
ops-failure-classification
fix-cycle
fix-applied
harness-rerun
integration-test-rerun
archive
knowledge-delta-update
```

允许每个节点先用 MVP 级实现：

- 生成类节点可以先用模板 + LLM。
- repository 节点优先走 Harness provider，允许 local/git fallback。
- harness build/deploy 可以先用 internal runtime 或本地脚本模拟，但必须输出标准 `PipelineRunRef`、`EnvironmentRef`、`RequirementDeploymentSet`。
- testing 节点可以先支持 API 测试和低风险 DataPlan。
- ops 节点可以先支持规则 + LLM 归因。
- archive 节点必须输出报告和 knowledge delta。

## 15. 当前决策

- 端到端 MVP 以这条验收链路为目标。
- 第一版必须经历一次失败和修复，不能只演示 happy path。
- 第一版默认使用 shared-overlay 测试环境。
- 第一阶段实现所有 workflow 节点，每个节点可以先做 MVP 级实现。
- 第一版仓库 provider 以 Harness provider 为目标，local / git provider 只作为 fallback。
- 第一版失败类型不固定，demo 中选择任一低风险可控失败即可。
- 第一版不覆盖生产发布。
