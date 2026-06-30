# AI Coding Pipeline

一个 Web 版 AI Coding 工作台：上传需求文档和一个或多个项目后，系统会在当前 session 内生成动态工作流，完成需求归属确认、项目分流、应用分支开发、测试验证、跨应用测试和归档交付。

当前默认演示 case 已固化为真实上传并跑通的“活动命中预览”双项目流程：

- MRD：`example/activity-hit-preview-mrd.md`
- 项目：`marketing`、`marketing-admin`
- 快照：`fixtures/activity-hit-preview-demo/run`
- 结果：2 个应用分支完成，`marketing-admin` 额外完成前端和 E2E 验证，最终生成归档报告和项目下载包

![动态多应用流程](docs/png/activity-hit-preview-dynamic-workflow.png)

## 文档导航

- [产品演示流程](docs/product-demo-flow.md)：按活动命中预览 case 串起演示讲解和截图。
- [GitHub 分享稿](docs/activity-hit-preview-demo.md)：面向 README/社区分享的完整 case 说明。
- [架构设计](docs/architecture.md)：说明 session workflow、动态分支、Agent、工具、事件和运行态存储。
- [节点设计](docs/node-design.md)：说明顶层节点、应用分支节点、track 节点和产物契约。
- [节点流转设计](docs/node-transition.md)：说明确认门、fanout、join、分支重跑、跨应用测试和归档状态。
- [动态工作流读模型](docs/session-dynamic-workflow.md)：说明 `workflowInstance`、fanout decision、execution plan 和 UI 读模型。
- [上下文压缩设计](docs/context-compression.md)：说明 Agent 长任务上下文压缩机制。

## 核心能力

- 多文件输入：支持上传 MRD、背景材料、参考资料和多个项目文件夹。
- 需求归属确认：先把需求拆成业务范围、应用归属、实施边界和需要确认的问题。
- 动态项目分流：根据 MRD 和项目 manifest 生成 `fanout-decision.json`，只纳入相关项目。
- 应用分支执行：每个应用分支拥有独立节点、状态、Agent、产物索引和失败信息。
- 能力驱动 track：根据项目能力生成 backend、frontend、E2E 或 documentation track。
- 真实代码修改：实现节点通过工具读写项目文件，保留工具轨迹和变更预览。
- 测试验证：后端执行 Maven 编译/测试，前端执行构建/静态检查，E2E 由平台 Playwright runner 验证。
- 跨应用测试：分支全部结束后汇总跨应用交付状态、测试结果和兼容性风险。
- 实时产物：工具写入文件后右侧产物树即时刷新，并按节点、应用、track 过滤。
- 归档交付：生成项目级归档报告、跨应用交付元数据和最终项目包。

## 当前流程

新 session 保存一个 `workflowInstance`，顶层流程是：

```text
上传初始化
  -> 需求归属确认
  -> 需求拆解
  -> 项目分流
  -> 应用分支并行执行
  -> 分支汇合
  -> 跨应用测试
  -> 归档
```

活动命中预览 case 的真实分支：

```text
marketing
  -> 实施方案
  -> SPEC 生成
  -> backend: Java 实现 -> Backend Test

marketing-admin
  -> 实施方案
  -> SPEC 生成
  -> backend: Java 实现 -> Backend Test
  -> frontend: Frontend Implementation -> Frontend Test
  -> e2e: E2E Verify
```

![工作流实例](docs/png/activity-hit-preview-workflow-instance.png)

![分支 tracks](docs/png/activity-hit-preview-branch-tracks.png)

## 内置 Demo

默认启动时会自动克隆真实快照：

- 快照目录：`fixtures/activity-hit-preview-demo/run`
- 页面名称：`活动命中预览 Demo`
- 原始 run：`PDRbY_AI59`
- 示例需求：营销活动命中预览
- 示例项目：`marketing` + `marketing-admin`
- 示例结果：需求拆解、分流决策、双应用分支实现、后端测试、前端测试、E2E 验证、跨应用测试和归档报告

如果不希望启动时自动注入 Demo：

```bash
AI_CODING_AUTO_DEMO=0 npm start
```

Demo 会被克隆到运行态目录，不会直接修改 `fixtures/activity-hit-preview-demo/run`。

## 快速开始

### 环境要求

- Node.js 20+
- npm
- Java/JDK，执行 Java 实现和测试节点时使用
- Maven，执行编译、单元测试和部分 Spring Boot 启动验证时使用

### 安装和启动

```bash
npm install
npm run build
npm start
```

默认访问：

```text
http://localhost:3000
```

开发模式：

```bash
npm run dev
```

常用环境变量：

```bash
PORT=4301
HOST=127.0.0.1
RUNTIME_DIR=/tmp/ai-coding-runtime
LLM_PROVIDER=openai-compat
LLM_MODEL=claude-sonnet-4-6
LLM_BASE_URL=https://your-model-endpoint/v1
LLM_API_KEY=your-api-key
JAVA_HOME=/path/to/jdk
MAVEN_HOME=/path/to/maven-or-mvn
AI_CODING_WORKFLOW_RUNTIME=legacy
AI_CODING_E2E_VERIFY=1
```

也可以在页面“设置”里配置模型、JDK 路径和 Maven 路径。

## 使用方式

1. 打开页面，查看自动加载的 `活动命中预览 Demo`。
2. 点击 `项目分流`，查看 MRD 如何命中 `marketing` 和 `marketing-admin`。
3. 展开应用分支，查看 backend、frontend、E2E track 的完成状态。
4. 点击分支节点，查看当前应用/track 过滤后的产物和 Agent 轨迹。
5. 点击 `跨应用测试`，查看分支汇总和交付元数据。
6. 点击 `归档`，查看归档报告并下载最终项目包。
7. 新建任务时上传自己的 MRD 和多个项目文件夹，按同样机制生成本次 session 的动态 workflow。

![跨应用测试](docs/png/activity-hit-preview-cross-app-test.png)

![归档下载](docs/png/activity-hit-preview-archive.png)

## 运行态目录

默认运行态目录是：

```text
runtime-projects/
```

目录内包含每次运行的 workspace、artifacts、logs、agents 和 checkpoints。它属于运行时数据，已在 `.gitignore` 中忽略，不应提交到 Git。

本地模型配置和密钥保存在 `.ai-coding/`，同样不会进入 Git。

## 重要产物

典型动态运行会生成：

- `artifacts/input-summary.md`
- `artifacts/project-manifest.json`
- `artifacts/mrd-clarified.md`
- `artifacts/mrd-clarify-questions.md`
- `artifacts/requirement-ownership.json`
- `artifacts/fanout-decision.json`
- `artifacts/implementation-plan-manifest.json`
- `artifacts/<project>/tech-design.md`
- `artifacts/<project>/openspec/changes/run-<runId>-<project>/tasks.md`
- `artifacts/<project>/changed-files.json`
- `artifacts/<project>/code-preview-manifest.json`
- `artifacts/<project>/code-review.md`
- `artifacts/<project>/changed-test-files/*`
- `artifacts/<project>/test-report.md`
- `artifacts/<project>/frontend-implementation-report.md`
- `artifacts/<project>/frontend-test-report.md`
- `artifacts/<project>/e2e/verification-summary.md`
- `artifacts/<project>/e2e/screenshots/*`
- `artifacts/<project>/branch-summary.json`
- `artifacts/cross-app/test-results.json`
- `artifacts/cross-app/delivery-metadata.json`
- `artifacts/<project>/archive-report.md`
- `artifacts/archive-manifest.json`
- `artifacts/downloads/<runId>-projects.zip`

## 工具与安全

Agent 可使用内置工具读取、搜索、编辑和写入当前 run 的项目文件，也可以调用 Java/Maven 工具执行编译与测试。工具执行范围限制在当前 run 的 workspace/project 和 artifacts 内。

关键工具包括：

- `read_file`
- `write_file`
- `edit_file`
- `glob`
- `grep`
- `bash`
- `maven_compile`
- `maven_test`
- `review_artifact`
- `skill`
- `discover_skills`

系统会记录工具开始、结束、失败、耗时和输出摘要，方便复盘。

## 上下文压缩

长任务执行过程中，Agent 会持续读取文件、编辑代码、运行 Maven 测试并把工具结果回灌给模型。系统在接近模型上下文窗口时会自动压缩历史消息：保留任务目标、关键文件、代码变更、测试结果、待办状态和阻塞信息，同时保留最近几轮原始上下文继续执行。

更多设计细节见 [上下文压缩设计](docs/context-compression.md)。

## 测试

```bash
npm test
```

当前测试覆盖固定兼容链路、动态 session workflow 读模型、fanout 决策、分支状态同步、真实示例流程、E2E 验证降级和上下文压缩。

## 项目结构

```text
src/
  agent/              # Agent loop、上下文压缩、token 预算
  e2e/                # 平台 E2E 能力检测、启动、契约和 Playwright runner
  events/             # 事件类型和事件日志
  langgraph/          # LangGraph runtime、分支 runner、join、rollback 读模型同步
  models/             # 模型注册和 provider
  persistence/        # execution-state、agent state 存储
  pipeline/           # 兼容流水线、节点编排和动态分支执行器
  runtime/            # run 目录、上传处理
  server/             # Hono HTTP API 和 WebSocket
  session/            # session 创建、恢复、分支控制和 demo 注入
  tools/              # 内置工具和安全校验
  workflows/          # workflow 定义、session instance、fanout、planner、validation
web/                  # 单页前端
prompts/              # 节点 prompt
fixtures/activity-hit-preview-demo/run/ # 真实双项目动态流程 Demo 快照
docs/png/             # README 和演示文档截图
```

## 设计原则

- 可复用 workflow 模板保持不可变，真实拓扑保存在每个 session 的 `workflowInstance`。
- 动态分支只改变本次 run 的执行计划，不修改全局模板。
- 下游节点优先读取正式产物和 context manifest，不把 Agent transcript 当作业务输入。
- 应用分支状态、track 状态和产物索引彼此隔离，失败不会覆盖其他分支的完成结果。
- Java、前端和 E2E 验证必须通过工具真实读写项目或运行验证，不能只生成说明性文本。
- 回退、重试和上下文压缩保留历史轨迹，便于用户复盘。

## 交流方式

邮箱：153268908@qq.com

![wechat.jpg](wechat.jpg)
