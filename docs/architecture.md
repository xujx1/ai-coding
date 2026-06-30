# 架构设计

相关文档：[README](../README.md) ｜ [产品演示流程](product-demo-flow.md) ｜ [GitHub 分享稿](activity-hit-preview-demo.md) ｜ [节点设计](node-design.md) ｜ [节点流转设计](node-transition.md) ｜ [动态工作流读模型](session-dynamic-workflow.md)

## 目标

AI Coding Pipeline 是一个面向 MRD-to-Code 的动态应用工作台。它不是通用拖拽式工作流编辑器，而是在用户上传 MRD 和项目后，为当前 session 生成一份可执行、可复盘的 workflow instance。

当前重点能力：

- 从需求中识别项目归属。
- 按应用 fanout 生成分支。
- 按项目能力生成 backend、frontend、E2E 或 documentation track。
- 通过 Agent 工具真实读写代码并执行验证。
- 在页面上展示事件、工具调用、确认门、重试回退、分支状态和正式产物。

## 总体结构

```text
web/                    浏览器单页应用
  app.js                会话、动态 workflow、分支、track、轨迹、产物、确认门交互
  app.css               页面样式
  index.html            页面入口

src/server/             HTTP API + WebSocket
  app.ts                Hono API、静态资源、会话控制、上传、Demo 注入
  ws.ts                 WebSocket 事件推送

src/session/            Session 管理
  SessionManager.ts     创建 run、恢复状态、分支 rerun/cancel、历史兼容和 demo 注入

src/workflows/          Workflow 定义和动态计划
  builtinDefinitions.ts 内置 MRD-to-Code 模板
  sessionInstance.ts    run 级 workflowInstance 读模型
  fanoutDecision.ts     项目分流决策
  sessionPlan.ts        应用分支和 track 计划
  planValidation.ts     动态计划校验

src/pipeline/           兼容执行器和节点 runner
  definition.ts         旧顶层节点定义和兼容 stage id
  engine.ts             节点编排、分支状态同步、确认门、重试、回退、产物索引
  node-runners/         upload、legacy stage、E2E 等 runner
  node-agents/          节点 prompt、产物格式、OpenSpec、归档

src/langgraph/          LangGraph runtime 实验路径
  runtime.ts            runtime 入口
  branchRunner.ts       分支执行
  readModelSync.ts      workflowInstance 读模型同步

src/agent/              Agent 执行内核
  AgentEngine.ts        ReAct loop、工具调用、事件、token 预算
  contextCompression.ts 上下文压缩
  planMode.ts           Plan 模式

src/e2e/                平台 E2E 验证
  capabilities.ts       项目启动和验证能力检测
  integrationHarness.ts 启动后端/前端、注入 API_BASE_URL
  runner.ts             API smoke、Playwright、截图、失败分类

src/tools/              工具系统
  builtin/              Read/Write/Edit/Glob/Grep/Bash/Java/Skill 等工具
  security/             路径校验、命令安全、权限控制

src/models/             模型系统
src/persistence/        execution-state、agent state、plan state
src/events/             事件日志

runtime-projects/       默认运行态目录，不提交 Git
fixtures/activity-hit-preview-demo/run/ 真实双项目动态流程 Demo 快照
```

## 请求链路

1. 用户在 Web 页面创建任务并上传 MRD、参考资料和项目文件夹。
2. `SessionManager` 创建 run，捕获内置 workflow template snapshot，并初始化 `workflowInstance`。
3. `upload-init` 写入 `project-manifest.json`，包含项目结构和能力证据。
4. `mrd-render` 生成需求拆解、归属信息和 `fanout-decision.json`。
5. `applyFanoutDecisionToSessionWorkflowInstance` 把 fanout 决策变成应用分支和 track 计划。
6. 执行器按分支运行 `implementation-plan`、`spec-generate`、实现和测试节点。
7. 分支完成后同步 join 状态，进入 `cross-app-test`。
8. `archive` 汇总分支报告、跨应用测试、工具指标和下载包。
9. 每个关键动作写入 `logs/events.ndjson`，并通过 WebSocket 推给页面。
10. 页面读取 `execution-state.json`、`workflowInstance`、事件和 artifacts，恢复完整 UI。

## 运行态目录

每次 run 的目录结构大致如下：

```text
runs/<runId>/
  execution-state.json
  input/
  workspace/
    project/
      <app-a>/
      <app-b>/
  artifacts/
    fanout-decision.json
    <project>/
      tech-design.md
      openspec/
      changed-files/
      changed-test-files/
      e2e/
      branch-summary.json
      archive-report.md
    cross-app/
    downloads/
  agents/
  logs/
    events.ndjson
    tool-*.log
  checkpoints/
```

关键原则：

- `input/` 存放需求和参考文件。
- `workspace/project/` 存放项目代码副本。
- `artifacts/` 存放正式产物，按项目和跨应用范围隔离。
- `logs/events.ndjson` 是页面轨迹和审计的主要来源。
- `agents/*.json` 保存 Agent 状态，可恢复执行过程。
- `checkpoints/` 保存跨节点瘦上下文 manifest。

## Workflow Instance

`workflowInstance` 是当前 session 的真实流程读模型，保存在 `execution-state.json`：

```text
upload-init
  -> mrd-clarify
  -> mrd-render
  -> project-fanout
  -> app-join
  -> cross-app-test
  -> archive
```

项目分支保存在：

```text
workflowInstance.branches[]
```

每个分支包含：

- `branchId`
- `projectName`
- `projectRoot`
- `status`
- `nodes[]`
- `tracks[]`
- `artifactIndex`
- `childAgentIds`
- `retry`

分支和 track 是 run 级 runtime state，不会修改全局 workflow template。

## 事件模型

系统用事件把服务端执行过程投射到前端 UI。常见事件包括：

- `pipeline_created`
- `pipeline_started`
- `pipeline_node_start`
- `model_selected`
- `agent_start`
- `agent_text`
- `tool_start`
- `tool_end`
- `artifact_written`
- `confirmation_waiting`
- `confirmation_resolved`
- `fanout_decision`
- `branch_transition`
- `join_state_updated`
- `context_compacted`
- `node_retry_scheduled`
- `node_rollback_requested`
- `pipeline_completed`
- `pipeline_failed`

事件同时用于实时刷新、历史回放、归档统计和故障复盘。

## 模型路由

模型选择由 `src/models/registry.ts` 负责：

- 每个 stage 有默认模型。
- 页面设置可配置模型 override。
- 执行节点时通过 stage id 和失败次数选择模型。
- 每次选择会写入 `model_selected` 事件。

分支节点仍使用 stage id 作为模型覆盖键，例如 `java-impl`、`backend-test`、`frontend-impl`、`e2e-verify`。

## 工具系统

ReAct 节点会向模型暴露工具。工具必须经过路径和权限控制，避免越权读写。

常用工具：

- `read_file`
- `write_file`
- `edit_file`
- `glob`
- `grep`
- `bash`
- `maven_compile`
- `maven_test`
- `review_artifact`
- `discover_skills`
- `skill`

工具执行结果会写入事件和工具日志。较长输出保存在 `logs/tool-*.log`，页面只展示摘要。

## E2E 验证

平台 E2E runner 负责：

- 根据 manifest 检测后端和前端启动命令。
- 分配临时端口。
- 启动 Spring Boot 或前端服务。
- 注入 `VITE_API_BASE_URL`、`NEXT_PUBLIC_API_BASE_URL`、`REACT_APP_API_BASE_URL` 等环境变量。
- 执行 API smoke。
- 执行 Playwright 验证并截图。
- 写入失败分类。

典型产物：

- `artifacts/<project>/e2e/startup-manifest.json`
- `artifacts/<project>/e2e/api-contract-results.json`
- `artifacts/<project>/e2e/api-smoke-results.json`
- `artifacts/<project>/e2e/playwright-report/`
- `artifacts/<project>/e2e/screenshots/`
- `artifacts/<project>/e2e/verification-summary.md`
- `artifacts/<project>/e2e/e2e-summary.json`

## 真实 Demo

服务启动时默认注入 `fixtures/activity-hit-preview-demo/run`：

- 这是一次真实跑通的活动命中预览双项目流程。
- 注入时会克隆到当前 runtime，而不是修改 fixture。
- 克隆时会重写旧 runId 和旧绝对路径。
- 可通过 `AI_CODING_AUTO_DEMO=0` 关闭自动注入。

## 架构边界

- 内置 workflow 模板是结构基线，真实执行拓扑由 session `workflowInstance` 表达。
- `legacy` runtime 仍是默认执行路径，LangGraph runtime 通过 `AI_CODING_WORKFLOW_RUNTIME=langgraph` 灰度。
- 主流程负责状态、确认门、fanout、join、回退、事件和产物索引。
- 业务 prompt 放在 `prompts/`，输出模板放在 `prompts/template/`。
- 下游节点优先读取正式产物和 context manifest，不读取完整 transcript 作为业务输入。
- 分支、track、项目产物和跨应用产物必须保持隔离。
