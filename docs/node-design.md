# 节点设计

相关文档：[README](../README.md) ｜ [产品演示流程](product-demo-flow.md) ｜ [架构设计](architecture.md) ｜ [节点流转设计](node-transition.md) ｜ [动态工作流读模型](session-dynamic-workflow.md)

## 设计原则

当前节点分为两层：

- 顶层 session 节点：负责上传、需求确认、需求拆解、项目分流、分支汇合、跨应用测试和归档。
- 应用分支节点：负责每个项目自己的方案、Spec、实现、测试、前端/E2E 验证和分支 summary。

全局 workflow template 是基线，真实运行拓扑保存在 `execution-state.json` 的 `workflowInstance`。节点设计需要明确：

- 输入产物。
- 输出产物。
- 所属范围：session、project、track、cross-app。
- 是否需要确认门。
- 是否使用 ReAct 工具 loop。
- 下游读取哪些正式产物。

## 顶层节点总览

```text
上传初始化
  -> 需求归属确认
  -> 需求拆解
  -> 项目分流
  -> 应用分支
  -> 分支汇合
  -> 跨应用测试
  -> 归档
```

## 上传初始化

职责：

- 初始化 run 目录。
- 处理上传的需求文件和项目代码。
- 识别项目根目录。
- 生成输入摘要和项目 manifest。
- 检测项目能力，包括 Maven、Java source、Spring Boot、静态前端、启动命令、readiness 端点和 E2E 配置。

输入：

- 用户上传的 MRD/需求文件。
- 用户上传的一个或多个项目目录。

输出：

- `artifacts/input-summary.md`
- `artifacts/project-manifest.json`

确认门：无。

下游契约：

- `project-manifest.json` 必须列出需求文件、项目列表、项目能力和启动证据。
- Fanout 和 planner 只依赖 manifest 中的结构化项目证据，不直接猜测目录。

## 需求归属确认

职责：

- 读取 MRD 和项目 manifest。
- 生成需求边界、项目归属、包含/不包含范围和待确认问题。
- 把用户确认或补充说明写回节点上下文。

输入：

- `input/*`
- `artifacts/project-manifest.json`

输出：

- `artifacts/mrd-clarify-questions.md`
- `artifacts/requirement-ownership.json`

确认门：

- 有。
- 用户确认后继续需求拆解和 fanout。
- 用户反馈后当前节点重跑或追加确认信息。

下游契约：

- 项目分流必须读取结构化归属信息。
- 未确认的阻断问题不能静默进入实现阶段。

## 需求拆解

职责：

- 把确认后的需求整理成正式业务事实。
- 生成最终需求拆解清单和项目级实施边界。
- 写出 fanout 所需依据。

输入：

- `input/*`
- `artifacts/project-manifest.json`
- `artifacts/requirement-ownership.json`

输出：

- `artifacts/mrd-clarified.md`
- `artifacts/requirement-breakdown.md`
- `artifacts/fanout-decision.json`

确认门：

- 与需求归属确认共用用户确认机制。

下游契约：

- `mrd-clarified.md` 是下游业务事实来源。
- `fanout-decision.json` 是项目分支生成依据。

## 项目分流

职责：

- 读取 `fanout-decision.json`。
- 创建 `workflowInstance.branches`。
- 为每个分支生成 `executionPlan` 和 track。
- 更新 join 等待列表。

输入：

- `artifacts/project-manifest.json`
- `artifacts/mrd-clarified.md`
- `artifacts/requirement-ownership.json`
- `artifacts/fanout-decision.json`

输出：

- `workflowInstance.branches[]`
- `workflowInstance.executionPlan`
- `workflowInstance.plannerValidation`

确认门：

- 无独立确认门。
- 如果 fanout 决策包含未解析项目，节点进入 `waiting_confirmation`。

下游契约：

- 每个 included project 必须有稳定 `branchId`。
- unsupported 或低置信 capability 应生成 fallback track，而不是创建无法执行的死节点。

## 应用分支公共节点

每个应用分支至少包含：

```text
implementation-plan
  -> spec-generate
```

### Implementation Plan

职责：

- 生成项目级技术方案。
- 明确实现边界、候选文件、接口契约、测试策略和风险。

输入：

- `artifacts/mrd-clarified.md`
- `artifacts/project-manifest.json`
- `workflowInstance.executionPlan`
- 项目代码结构。

输出：

- `artifacts/implementation-plan-manifest.json`
- `artifacts/<project>/tech-design.md`

确认门：

- 当前作为分支计划的一部分执行，页面可查看产物；旧兼容确认门仍保留。

### Spec Generate

职责：

- 生成项目级 OpenSpec change。
- 按 Development、Test、Backend、Frontend、E2E、Documentation 等 section 写任务。

输入：

- `artifacts/<project>/tech-design.md`
- `artifacts/mrd-clarified.md`
- `workflowInstance.executionPlan`

输出：

- `artifacts/<project>/openspec-task.md`
- `artifacts/<project>/openspec-test-task.md`
- `artifacts/<project>/openspec/changes/run-<runId>-<project>/tasks.md`
- `artifacts/spec-manifest.json`

下游契约：

- 实现和测试节点在原任务文件上标记完成，不另造重复任务清单。

## Backend Track

```text
java-impl
  -> backend-test
```

### Java Impl

职责：

- 读取 OpenSpec、技术方案和项目代码。
- 使用工具真实修改 Java、XML、配置等文件。
- 执行编译。
- 生成代码审查报告和 findings。

输出：

- `artifacts/<project>/changed-files.json`
- `artifacts/<project>/changed-files/*`
- `artifacts/<project>/code-preview-manifest.json`
- `artifacts/<project>/code-review.md`
- `artifacts/<project>/review-findings.json`

执行方式：

- ReAct 工具 loop。
- 常用工具：`read_file`、`glob`、`grep`、`edit_file`、`write_file`、`maven_compile`、`review_artifact`。

### Backend Test

职责：

- 生成或补齐后端测试代码。
- 执行 Maven 单元测试。
- 分类失败并记录自动修复历史。

输出：

- `artifacts/<project>/changed-test-files/*`
- `artifacts/<project>/test-file-list.md`
- `artifacts/<project>/testcode-generation-report.md`
- `artifacts/<project>/test-report.md`
- `artifacts/<project>/surefire-summary.json`
- `artifacts/<project>/coverage-summary.json`
- `artifacts/<project>/failure-classification.json`
- `artifacts/<project>/autofix-history.md`

下游契约：

- 测试失败分类决定回退到实现节点、测试节点或等待人工修复。

## Frontend Track

```text
frontend-impl
  -> frontend-test
```

### Frontend Impl

职责：

- 修改前端页面、静态资源、样式或前端配置。
- 对单仓 Spring Boot 静态前端和独立前端项目都按 manifest 能力处理。

输出：

- `artifacts/<project>/frontend-implementation-report.md`
- `artifacts/<project>/changed-files/*`
- `artifacts/<project>/code-preview-manifest.json`

### Frontend Test

职责：

- 执行项目可用的前端构建、测试或静态检查。
- 对无独立前端脚本的静态资源项目记录明确 fallback。

输出：

- `artifacts/<project>/frontend-test-report.md`
- `artifacts/<project>/frontend-test-summary.json`

## E2E Track

```text
e2e-verify
```

职责：

- 由平台 runner 启动后端和前端。
- 注入 API base URL。
- 执行 API smoke 和 Playwright 浏览器验证。
- 捕获截图、console/network 摘要和失败分类。

输出：

- `artifacts/<project>/e2e/startup-manifest.json`
- `artifacts/<project>/e2e/api-contract-results.json`
- `artifacts/<project>/e2e/api-smoke-results.json`
- `artifacts/<project>/e2e/playwright-report/`
- `artifacts/<project>/e2e/screenshots/`
- `artifacts/<project>/e2e/console-network-summary.json`
- `artifacts/<project>/e2e/failure-classification.json`
- `artifacts/<project>/e2e/verification-summary.md`
- `artifacts/<project>/e2e/e2e-summary.json`

## 分支汇合

职责：

- 读取 `workflowInstance.branches`。
- 等待所有 required 分支进入终态。
- 计算 completed、failed、cancelled 和 waiting 列表。

输出：

- `workflowInstance.joins[]`

下游契约：

- 只有 join 达到完成或可收敛失败状态，才进入跨应用测试或归档。

## 跨应用测试

职责：

- 汇总分支 summary。
- 检查跨应用交付状态。
- 生成跨应用测试结果和交付元数据。

输入：

- `artifacts/<project>/branch-summary.json`
- 分支级测试、E2E 和 archive 候选产物。

输出：

- `artifacts/cross-app/test-results.json`
- `artifacts/cross-app/delivery-metadata.json`

## Archive

职责：

- 汇总所有正式产物。
- 统计节点耗时、工具耗时、工具失败数和 token 消耗。
- 生成项目级归档报告。
- 打包最终项目代码。

输出：

- `artifacts/<project>/archive-report.md`
- `artifacts/archive-manifest.json`
- `artifacts/downloads/<runId>-projects.zip`

下游契约：

- 这是交付终点。
- 页面可下载项目包。
