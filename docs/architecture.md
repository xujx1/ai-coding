# 架构设计

相关文档：[README](../README.md) ｜ [产品演示流程](product-demo-flow.md) ｜ [节点设计](node-design.md) ｜ [节点流转设计](node-transition.md) ｜ [上下文压缩设计](context-compression.md)

## 目标

AI Coding Pipeline 是一个固定 MRD-to-Code 工作台，不是通用工作流编辑器。它的目标是把一次需求从“上传 MRD 和项目代码”推进到“可下载的代码交付包”，并在页面上完整展示模型输出、工具调用、确认门、重试回退和产物。

当前主要面向 Java/Maven 项目。

## 总体结构

```text
web/                    浏览器单页应用
  app.js                会话、节点、轨迹、产物、确认门交互
  app.css               页面样式
  index.html            页面入口

src/server/             HTTP API + WebSocket
  app.ts                Hono API、静态资源、会话控制、上传、Demo 注入
  ws.ts                 WebSocket 事件推送

src/pipeline/           固定流水线
  definition.ts         节点定义和旧节点 ID 兼容映射
  engine.ts             节点状态机、确认门、重试、回退、产物索引
  node-agents/          各节点业务执行封装、prompt 上下文和产物格式化

src/agent/              Agent 执行内核
  AgentEngine.ts        ReAct loop、工具调用、事件、token 预算
  contextCompression.ts 上下文压缩
  planMode.ts           Plan 模式

src/tools/              工具系统
  builtin/              Read/Write/Edit/Glob/Grep/Bash/Java 等工具
  security/             路径校验、命令安全、权限控制

src/models/             模型系统
  registry.ts           阶段模型选择和用户 override
  providers.ts          OpenAI-compatible / Anthropic / mock provider

src/persistence/        状态持久化
  stateStore.ts         execution-state、agent state、plan state

src/events/             事件日志
  EventLog.ts           logs/events.ndjson 读写
  types.ts              事件类型定义

runtime-projects/       默认运行态目录，不提交 Git
prompts/                节点 prompt
prompts/template/       输出模板和兜底模板
fixtures/full-flow-demo/run/ 真实完整流程 Demo 快照
```

## 请求链路

1. 用户在 Web 页面创建任务并上传 MRD 和项目代码。
2. `src/server/app.ts` 创建 run，并调用上传处理逻辑写入运行态目录。
3. 用户启动流水线后，服务端拿到对应 `PipelineEngine`。
4. `PipelineEngine` 按 `PIPELINE_NODES` 顺序执行固定节点。
5. 节点内部根据类型选择：
   - 普通节点：读取上游产物，调用模型，生成 Markdown/JSON 产物。
   - ReAct 节点：创建 `AgentEngine`，让模型通过工具真实读写代码。
6. 每个关键动作写入 `logs/events.ndjson`，并通过 WebSocket 推给页面。
7. 产物写入 `artifacts/`，状态写入 `execution-state.json`，Agent 状态写入 `agents/*.json`。
8. 页面左侧展示流程状态，中间展示执行轨迹，右侧展示当前节点产物。

## 运行态目录

每次 run 的目录结构大致如下：

```text
runs/<runId>/
  execution-state.json
  input/
  workspace/
    project/
  artifacts/
  agents/
  logs/
    events.ndjson
    tool-*.log
  checkpoints/
```

关键原则：

- `input/` 存放需求文件。
- `workspace/project/` 存放项目代码副本。
- `artifacts/` 存放流水线正式产物。
- `logs/events.ndjson` 是页面轨迹和审计的主要来源。
- `checkpoints/` 存放跨节点瘦上下文 manifest。
- 运行态目录是临时数据，已被 `.gitignore` 忽略。

## 事件模型

系统用事件把服务端执行过程投射到前端 UI。常见事件包括：

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
- `context_compacted`
- `node_retry_scheduled`
- `node_rollback_requested`
- `node_rollback_started`
- `pipeline_completed`
- `pipeline_failed`

事件同时用于：

- 页面实时刷新。
- 会话恢复后的历史轨迹回放。
- 归档报告统计节点耗时、工具耗时和 token 消耗。

## 模型路由

模型选择由 `src/models/registry.ts` 负责：

- 每个阶段有默认模型。
- 页面设置可配置模型 override。
- 执行节点时通过 `getModelForStage(node.id, ..., modelOverrides)` 选择模型。
- 每次选择会写入 `model_selected` 事件。

这样主流程不直接绑定某个模型供应商。

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

工具执行结果会写入事件和工具日志。较长输出会保存在 `logs/tool-*.log`，页面只展示摘要。

## 真实 Demo

服务启动时默认注入 `fixtures/full-flow-demo/run`：

- 这是一次真实跑通的营销活动软删除流程。
- 注入时会克隆到当前 runtime，而不是修改 fixture。
- 克隆时会重写旧 runId 和旧绝对路径。
- 可通过 `AI_CODING_AUTO_DEMO=0` 关闭自动注入。

## 架构边界

- 主流程只负责状态机、确认门、重试、回退、事件和产物索引。
- 业务 prompt 放在 `prompts/`。
- 输出模板放在 `prompts/template/`。
- 下游节点优先读取正式产物和 context manifest，不读取完整 transcript 作为业务输入。
- ReAct 节点必须通过工具真实读写项目代码，不能只生成说明性文本。
