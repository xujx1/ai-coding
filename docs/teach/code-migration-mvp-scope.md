# 代码迁移 MVP 范围

## 1. 结论

代码迁移分两层：

```text
第一层：完整拷贝到 reference/
第二层：只把 MVP 基础能力迁入 src/
```

`reference/` 是原始代码参考区，不参与 `ai-coding` 构建和运行。

`src/` 才是 `ai-coding` 生效代码，迁入后必须接入统一状态机、产物、事件、trace 和人工确认门。

## 2. 第一层：完整拷贝

先把三套代码完整拷贝到：

```text
reference/
  ai-testing/
    MIGRATION.md
    original/

  ai-ops/
    MIGRATION.md
    original/

  harness-main/
    MIGRATION.md
    original/
```

目标：

- 避免遗漏隐含依赖和已有能力。
- 保留原项目 README、docs、prompt、配置和运行方式。
- 后续迁移时可对照来源。
- 先统一仓库管理，再逐步裁剪。

限制：

- 不参与主项目构建。
- 不参与主项目测试。
- 不作为运行入口。
- 不直接被 `src/` import。
- 不在 `reference/` 中修业务逻辑。

## 3. 第二层：MVP 迁入 src

MVP 只迁入能支撑闭环的基础能力：

```text
MRD / PRD / 技术方案
  -> 代码生成与单测
  -> CI / 部署测试环境
  -> 集成测试与造数
  -> 失败诊断
  -> 修复回流
  -> 归档
```

迁入后的代码必须遵守：

- `ai-coding` 是唯一状态写入者。
- 所有结果通过结构化对象返回。
- 所有产物注册为 `ArtifactRef`。
- 所有节点写入 `NodeRun` 和 `EventLog`。
- Agent trace 可选接入 LangSmith，但本地状态是 source of truth。

## 4. ai-testing 迁入范围

迁入到：

```text
src/testing/
  strategy/
  cases/
  data-plans/
  scripts/
  execution/
  reports/
```

MVP 保留：

- 集成测试策略生成。
- 跨应用测试计划生成。
- 集成测试用例生成。
- `DataPlan` 造数计划。
- 测试数据准备、校验和清理脚本。
- API / E2E / 回归测试脚本生成。
- 测试执行。
- 测试报告。
- 失败证据整理。

不迁入或暂缓：

- 单元测试能力。
- 失败归因。
- 完整测试平台 UI。
- 复杂可视化编排。
- 高级回归选择。
- 大规模测试资产管理。

边界：

- 单元测试属于 `ai-coding` 的代码生成 TDD 闭环。
- 失败归因属于 `ops`。
- `ai-testing` 只改测试脚本、造数计划、断言配置。

## 5. ai-ops 迁入范围

迁入到：

```text
src/ops/
  evidence/
  collectors/
  failure-classifier/
  diagnosis/
  runbooks/
```

MVP 保留：

- CI 日志采集。
- Harness / internal runtime 日志采集。
- Docker 只读日志采集。
- 测试环境应用日志采集。
- 测试失败证据读取。
- `FailureClassification`。
- 失败分类 prompt / rules。
- 诊断报告。
- 根因候选。
- 修复建议。
- 相似问题检索的基础能力。

不迁入或暂缓：

- 完整运维 UI。
- 生产恢复动作。
- 告警平台。
- 复杂 MCP 市场化配置。
- 自动改代码能力。

边界：

- `ai-ops` 只诊断，不直接改代码、不直接改测试、不直接重跑 pipeline。

## 6. harness-main 迁入范围

`harness-main` 不建议大规模迁入 Go 代码。

第一阶段以参考和重写最小仓库管理 + CI/CD runtime 为主：

```text
src/harness-runtime/
  repositories/
  pipeline-model/
  runner/
  docker-runner/
  log-store/
  environment/
  deployment-set/
```

MVP 保留或重写：

- 应用代码仓库管理。
- 知识库仓库管理。
- repo registry / repo metadata / repo tags。
- repo search。
- branch 创建或复用。
- checkout / update 的最小封装。
- pipeline run 模型。
- stage / step 状态模型。
- pipeline 状态查询。
- step log 采集。
- buildId / imageTag / imageDigest 记录。
- `RequirementDeploymentSet` 写入支持。
- 测试环境 `EnvironmentRef`。
- rerun / cancel。
- Docker runner / logs 最小封装。

不迁入或暂缓：

- 完整代码托管 UI。
- 完整 SCM 平台 UI 和权限模型。
- 完整权限体系。
- 完整 artifact registry。
- 完整 Gitspaces 能力。
- 完整企业级 Pipeline 语法兼容。

边界：

- `harness-runtime` 只负责重建、重部署、重跑 pipeline。
- `harness-runtime` 负责代码仓库和知识库仓库管理。
- `harness-runtime` 不负责知识库内容生成和更新决策。
- 不维护独立总状态。
- 不做知识库生成。

## 7. lifecycle / workflows 必须先落地

在迁入 testing、ops、harness-runtime 前，优先补齐：

```text
src/lifecycle/
  state.ts
  events.ts
  artifacts.ts
  workflowRuns.ts
  nodeRuns.ts
  approvals.ts
  transitionRules.ts

src/workflows/
  definitions/
    mrdToDesign.ts
    codeGenerationTdd.ts
    ciDeploy.ts
    integrationTesting.ts
    failureDiagnosisFixRerun.ts
    archive.ts
    fullLifecycle.ts
```

原因：

- 迁入能力必须接入统一状态机。
- 没有状态机，testing / ops / harness-runtime 很容易各自维护状态。
- 先定义 workflow contract，迁入代码才能按接口裁剪。

## 8. 迁移优先级

建议顺序：

```text
P0: reference 完整拷贝 + MIGRATION.md
P1: lifecycle state machine
P2: artifact / event / approval gate contract
P3: harness provider / repository manager + pipeline + environment + deployment-set
P4: ai-testing 集成测试与造数
P5: ai-ops 证据采集与失败分类
P6: fix-cycle / rerun / archive integration
```

第一阶段不是只实现部分节点，而是实现完整端到端 workflow 的所有节点。上述优先级表示开发顺序，每个节点可以先做 MVP 级实现。

reference 拷贝是实现阶段 P0 任务，不在方案讨论阶段立即执行。当前先完成方案收口，再进入代码拷贝和迁移实施。

## 9. 验收标准

1. `reference/ai-testing/original/` 存在。
2. `reference/ai-ops/original/` 存在。
3. `reference/harness-main/original/` 存在。
4. 每个 reference 目录有 `MIGRATION.md`。
5. 主项目构建不扫描 `reference/`。
6. `src/` 中没有整包原项目混入。
7. `src/testing` 不包含单元测试和失败归因。
8. `src/ops` 不包含自动改代码能力。
9. `src/harness-runtime` 不维护独立总状态。
10. 迁入模块能通过 `LifecycleState`、`NodeRun`、`ArtifactRef`、`EventLog` 和 `TraceRef` 关联到需求生命周期。
