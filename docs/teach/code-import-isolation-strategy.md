# 代码导入隔离策略

## 1. 结论

`ai-testing`、`ai-ops`、`harness-main` 的代码可以先整体拷贝进 `ai-coding` 仓库统一管理，但不能直接混入 `src/` 核心运行区。

第一版采用三层结构：

```text
reference/   原始代码参考区，不参与 ai-coding 构建
src/         ai-coding 真实运行代码
docs/teach/ 方案、决策和迁移说明
```

核心原则：

```text
reference/ 只读参考
src/ 才是 ai-coding 生效代码
```

## 2. 为什么不能直接放进 src

直接把三套代码放入 `src/` 会带来几个问题：

- `harness-main` 是 Go 项目，和 `ai-coding` 的 TypeScript 编译模型不同。
- `ai-testing` 和 `ai-ops` 都有自己的 Next.js / package.json / 运行态假设。
- `src/` 通常会被 TypeScript 编译、测试和打包工具扫描。
- 原项目里的 UI、server、runtime、配置和依赖会和 `ai-coding` 冲突。
- 后续很难判断哪份代码是真实运行入口，哪份只是参考。

所以整包拷贝必须进入 `reference/`，不进入 `src/`。

## 3. 推荐目录结构

```text
ai-coding/
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

  src/
    lifecycle/
    workflows/
    testing/
    ops/
    harness-runtime/
    integrations/
```

如果不想多一层 `original/`，也可以简化为：

```text
reference/
  ai-testing/
  ai-ops/
  harness-main/
```

但每个 reference 目录必须有 `MIGRATION.md`。

## 4. reference 目录规则

`reference/` 的定位是原始代码快照和迁移参考。

规则：

- 不参与主项目构建。
- 不参与主项目测试。
- 不作为运行入口。
- 不直接被 `src/` import。
- 不在 reference 里修业务逻辑。
- 只允许做少量迁移说明、路径说明和必要的忽略配置。

如果需要修改逻辑，应把对应能力迁入 `src/` 后再改。

## 5. src 目录规则

`src/` 是 `ai-coding` 的真实运行代码。

从 reference 迁入的能力必须接入统一：

- `LifecycleState`
- `ArtifactRef`
- `TraceRef`
- `EventLog`
- `ApprovalGate`
- `workflowInstance`

迁入后的代码应按能力域组织：

```text
src/testing/
  strategy/
  cases/
  data-plans/
  scripts/
  execution/
  reports/

src/ops/
  collectors/
  diagnosis/
  evidence/
  failure-classifier/
  runbooks/
  incidents/

src/harness-runtime/
  pipeline-model/
  docker-runner/
  log-store/
  environment/

src/integrations/
  docker/
  git/
  langsmith/
```

## 6. MIGRATION.md 模板

每个 reference 子目录都要维护迁移说明：

```markdown
# Migration Notes

## Source

- Source path:
- Source commit:
- Copied at:
- Copied by:

## Purpose

- Why this project is imported:
- Which lifecycle capability it supports:

## Keep For MVP

- ...

## Defer / Remove

- ...

## Migrated Modules

| Source | Target | Status | Notes |
| --- | --- | --- | --- |
| original/path | src/path | pending |  |

## Decisions

- ...
```

## 7. 迁移流程

推荐流程：

1. 把原项目完整拷贝到 `reference/<project>/original/`。
2. 写 `reference/<project>/MIGRATION.md`。
3. 先阅读 reference 中已有 README、架构文档和关键模块。
4. 选定 MVP 真正需要的能力。
5. 把能力代码迁入 `src/<domain>/`。
6. 接入生命周期状态、产物、事件和 trace。
7. 给迁入模块补最小测试。
8. 标记 `MIGRATION.md` 中已迁入模块。
9. 后续删除不再需要的 reference 快照或保留到版本稳定后再清理。

## 8. MVP 保留范围

### ai-testing

保留：

- 集成测试策略生成。
- 跨应用测试计划生成。
- 集成测试用例生成。
- DataPlan 造数计划。
- 测试数据准备、校验和清理脚本。
- 自动化脚本生成。
- 测试执行。
- 测试报告。
- 失败证据整理。

暂缓：

- 单元测试能力。
- 失败归因。
- 完整测试平台 UI。
- 复杂可视化编排。
- 高级回归选择。
- 大规模知识库索引。

### ai-ops

保留：

- Harness 日志采集。
- Docker 只读日志采集。
- 测试环境应用日志采集。
- 测试失败证据读取。
- 失败分类。
- 失败诊断。
- 修复建议。
- 相似问题检索的基础能力。

暂缓：

- 完整运维平台 UI。
- GitLab OAuth 完整接入。
- 复杂 MCP 市场化配置。
- 生产环境恢复动作自动执行。
- 多入口告警平台化能力。

### harness-main

保留或重写：

- pipeline run 模型。
- stage / step 状态模型。
- pipeline 状态查询。
- step log 采集。
- buildId / imageTag / imageDigest 记录。
- RequirementDeploymentSet 写入支持。
- Docker runner 的最小封装。
- 测试环境结果引用。

暂缓：

- 完整代码托管 UI。
- 完整权限体系。
- 完整 artifact registry。
- 完整 Gitspaces 能力。
- 完整企业级 Pipeline 语法兼容。

## 9. 边界判断

迁移时遇到模块，按下面标准判断：

```text
能直接支撑 MRD -> 代码 -> CI -> 测试 -> 诊断 -> 修复 -> 归档
  => 迁入 src

只是完整平台能力、管理 UI、复杂配置、非 MVP 增强
  => 留在 reference，暂不迁入

实现方式不适合 ai-coding，但概念有价值
  => 参考后重写
```

## 10. 验收标准

第一阶段完成后应满足：

1. `reference/ai-testing/original/` 存在。
2. `reference/ai-ops/original/` 存在。
3. `reference/harness-main/original/` 存在。
4. 每个 reference 目录有 `MIGRATION.md`。
5. 主项目构建不扫描 reference。
6. `src/` 中没有整包原项目混入。
7. `src/testing` 不包含单元测试和失败归因。
8. `src/ops` 不包含自动改代码能力。
9. `src/harness-runtime` 不维护独立总状态。
10. 已迁入模块能通过 `LifecycleState`、`NodeRun`、`ArtifactRef`、`EventLog` 和 `TraceRef` 关联到需求生命周期。
