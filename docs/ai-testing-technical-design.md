# AI Testing 产品演示与技术方案

AI Testing 负责需求 PI 后半段的跨应用测试。它和 AI Coding 平级，但不是独立上传项目的第二套流程，而是消费需求 PI 的分支结果、lifecycle 部署事实和知识库影响面，生成并执行跨应用测试。

## 产品特色

- 把“集成测试用例、造数、生成测试代码、部署关联应用、执行测试”拆成用户能理解的阶段。
- 测试范围来自 MRD、应用分支摘要、知识库和 GitNexus 影响面。
- 造数不是说明文档，会落到独立测试仓库的领域 data builder。
- 执行测试不是 dry-run，真实运行 `npm run seed` 和 `npm run test:live`。
- 测试结果、覆盖率、质量门禁、失败归因和回归计划都登记为 lifecycle artifacts。

## 演示路径

1. 在 AI Coding 流程中等待应用分支汇合。
2. 查看“集成测试用例”节点生成的策略和用例。
3. 查看“造数”节点生成的数据计划。
4. 查看“生成集成测试代码”节点关联到 `demo/ecom/ecom-integration-tests`。
5. 查看“部署关联应用”节点创建 deployment context。
6. 查看“执行集成测试”节点中的 seed report 和 test-live report。

## 示例

### 测试策略示例

```text
目标：验证营销活动创建链路在商品上架和库存保护规则下行为正确。
范围：console、ecom-marketing、ecom-product、ecom-inventory。
级别：integration + regression。
风险：商品状态和库存状态来自不同领域服务，需要覆盖跨应用一致性。
```

### 造数计划示例

| 领域 | 数据 | 目的 |
| --- | --- | --- |
| 商品域 | `SKU-STOCK-GUARD-1001`，状态 `SALEABLE` | 正向活动创建 |
| 库存域 | `STOCK-STOCK-GUARD-1001`，可用库存 80 | 正向库存保护 |
| 营销域 | `CAMP-STOCK-GUARD-1001`，状态 `DRAFT` | 活动创建验证 |
| 商品域 | 未上架 SKU | 负向校验 |
| 库存域 | 低库存记录 | 负向校验 |

### 执行报告示例

```text
npm run seed
  status: passed
  scenarioId: targeted-campaign-stock-guard

npm run test:live
  status: passed
  tests: 2
  failed: 0
```

## 目标

- 根据需求、影响应用和分支摘要生成集成测试策略。
- 生成集成测试用例和造数计划。
- 管理集成测试脚本仓库。
- 部署关联应用后执行真实跨应用测试。
- 计算覆盖率、通过率和质量门禁。
- 对失败进行归因，并生成回归计划。
- 所有测试产物登记为 lifecycle artifacts。

## 产品定位

AI Testing 是“跨应用质量验证”的产品。它不是单应用单测，也不是简单 E2E 脚本生成。它面向测试负责人和研发负责人，回答这些问题：

- 本次需求涉及哪些跨应用链路？
- 测试数据需要在哪些领域准备？
- 哪些应用需要部署 feature version，哪些可以复用 stable version？
- 集成测试是否真实执行，还是只生成了说明文档？
- 覆盖率、通过率、质量门禁和回归计划在哪里追踪？

## 页面视角

### 跨应用测试节点和产物

![AI Testing 跨应用测试](png/readme-ai-testing.png)

## Workflow

```text
load_requirement
  -> retrieve_context
  -> generate_strategy
  -> review_strategy
  -> generate_cases
  -> review_cases
  -> generate_data_plans
  -> review_data_plans
  -> deploy_related_apps
  -> generate_scripts
  -> review_scripts
  -> execute_scripts
  -> collect_report
  -> calculate_metrics
  -> quality_gate
  -> failure_triage
  -> regression_update
  -> persist_artifacts
```

在需求 PI 页面中拆成 5 个可见阶段：

```text
集成测试用例
  -> 造数
  -> 生成集成测试代码
  -> 部署关联应用
  -> 执行集成测试
```

## 关键模块

```text
src/testing/                          # AI Testing 产品服务
src/agents/testing/                   # 策略、用例、造数、脚本审查、归因、回归 Agent
src/tools/testing/                    # 造数、脚本生成、执行、指标、schema 工具
src/workflows/definitions/testing/    # testing workflow 定义
src/workflows/runtime/testing/        # testing runtime
src/lifecycle/testingArtifactSchemas.ts
src/lifecycle/testingArtifacts.ts
```

## 测试脚本仓库

当前 demo 使用独立集成测试仓库：

```text
demo/ecom/ecom-integration-tests/
```

职责：

- 保存跨应用测试 fixture。
- 提供各领域数据 builder。
- 提供 `seed` 造数脚本。
- 提供 `node:test` 集成测试。
- 通过 `test:live` 强制校验真实服务健康。

真实执行命令：

```bash
npm run seed
npm run test:live
```

其中：

- `npm run seed` 执行真实造数，写入商品、库存、活动数据。
- `npm run test:live` 强制要求服务可用，服务不可用时失败，不静默 skip。
- 执行结果保存为 `testing-execution-report-*.json`。

## 造数模型

AI Testing 的造数分两层：

1. 测试数据计划：描述需要准备哪些领域数据、如何清理、如何验证。
2. 测试脚本仓库：用领域 data builder 执行真实造数。

示例：

```text
商品域：创建 SALEABLE SKU
库存域：设置 AVAILABLE 库存
营销域：创建 DRAFT 定向活动
```

这种方式比在测试脚本里硬编码 HTTP 请求更稳定，因为不同领域的数据准备逻辑可以沉淀为可复用 builder。

## 关键产物

- `testing-strategy-*.json`
- `testing-test-cases-*.json`
- `testing-data-plan-*.json`
- `testing-generated-script-*.json`
- `testing-execution-report-*.json`
- `testing-coverage-report-*.json`
- `testing-quality-gate-*.json`
- `testing-failure-triage-*.json`
- `testing-regression-plan-*.json`

## 影响面来源

AI Testing 的测试范围来自多处事实：

1. `fanout-decision.json`：本次需求确认进入实现的应用。
2. `branch-summary.json`：每个应用实际改了什么、测试了什么。
3. lifecycle deployment set：本次测试环境部署了哪些应用版本。
4. 知识库依赖图：被改应用的上下游消费者和提供者。
5. GitNexus 图谱：接口、调用、文件和业务能力之间的关联证据。

这样 AI Testing 不只测试“改过的应用”，还会覆盖跨应用依赖和回归影响面。

## 当前真实验证

run `g2jG99Lmk1` 已完成：

- `npm run seed`：写入商品、库存、活动测试数据。
- `npm run test:live`：执行 `node:test` 集成测试。
- 结果：2 个集成测试用例通过，0 失败。

关键 execution report：

```text
testing-execution-report-report-cross-app-testing-g2jG99Lmk1-seed.json
testing-execution-report-report-cross-app-testing-g2jG99Lmk1-test-live.json
```

## 截图

![AI Testing 跨应用测试](png/readme-ai-testing.png)
