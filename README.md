# AI Coding

面向需求、代码、测试与应用运维的 AI DevOps 平台。

AI Coding 当前已经不只是代码生成工具，而是覆盖需求、开发、测试、部署、质量门禁、归档和应用运维的 AI DevOps / AI SDLC 平台。它把 MRD、应用管理、知识库、需求 PI、代码实现、测试验证、跨应用 AI Testing 和 AI Ops 应用运维串成一条可追踪的研发交付链路。

当前产品形态不是“上传项目文件让模型猜”。需求从 MRD 和平台知识库出发，系统先基于应用管理列表、全局知识库和应用级知识库判断影响应用，再进入需求归属确认、应用分支并发实现、跨应用测试和归档交付。

完整链路：

```text
需求管理
  -> 应用管理 / 知识库管理
  -> 需求 PI / 影响面分析
  -> 多应用代码实现
  -> 单应用测试
  -> 跨应用 AI Testing
  -> 部署关联应用
  -> 质量门禁 / 回归计划
  -> 归档交付
  -> AI Ops 应用运维
```

## AI DevOps 设计思路

这个系统的核心设计不是“让 AI 写一段代码”，而是把研发交付过程中的需求、应用、知识、代码、测试、部署、质量和运维统一到一条可追踪的事实链路里。

传统研发流程里，需求、技术方案、开发、测试、上线和运维通常分散在不同系统中。AI 只能看到局部上下文，很容易出现几个问题：

- MRD 里没有明确写影响哪些应用。
- 开发知道改了哪些代码，但测试不知道该覆盖哪些跨应用链路。
- 测试有用例，但不知道需要准备哪些领域数据。
- 运维看到告警，但不知道和历史需求、代码改动、上下游依赖有什么关系。
- 产物散在聊天记录、文档、流水线日志和本地文件里，无法复盘。

AI DevOps 的设计目标是把这些分散事实统一起来：

```text
MRD
  -> 应用管理
  -> 知识库 / GitNexus
  -> 需求归属确认
  -> 多应用分支实现
  -> 单应用测试
  -> 跨应用测试
  -> lifecycle artifacts
  -> 运维影响面分析
```

### 1. 知识库是怎么设计的

知识库分两层：

```text
应用级知识库
  -> 描述单个应用负责什么、有哪些接口、依赖谁、有哪些数据库表、怎么测试和造数

全局知识库
  -> 汇总所有应用的业务域、能力地图、API 路由图、依赖图、影响面索引和业务术语
```

生成链路：

```text
应用管理列表
  -> 仓库扫描
  -> GitNexus 代码图谱
  -> 应用级知识库
  -> 全局知识库合并
  -> 新鲜度记录
```

知识库解决的是“AI 判断必须有证据”的问题。比如 MRD 里出现“库存保护”，系统不会靠硬编码把它映射到 `ecom-inventory`，而是按下面的证据链判断：

```text
MRD 关键词：库存保护、库存不足、可用库存
  -> global capability-map 命中库存能力
  -> app-domain-map 命中 inventory 域
  -> dependency-map 发现 ecom-marketing 依赖 ecom-inventory
  -> 应用级知识库确认 ecom-inventory 拥有库存可用性校验
  -> ecom-inventory 进入候选影响应用
```

### 2. 需求是怎么从 MRD 拆到多个应用改动的

需求 PI 的关键不是直接生成代码，而是先做需求归属确认。

```text
MRD
  -> 提取业务关键词、验收场景、用户入口、领域名词
  -> 从应用管理拿候选应用
  -> 从 global 知识库召回相关应用
  -> 从应用级知识库验证应用能力
  -> 生成 requirement-ownership.json
  -> 生成 fanout-decision.json
  -> 创建应用分支 workflow
```

以当前 case 为例：

```text
MRD: 定向营销活动创建时增加商品上架与库存保护校验
```

拆解结果：

| MRD 能力点 | 命中证据 | 应用 | 分支动作 |
| --- | --- | --- | --- |
| 活动创建主流程 | 营销活动、campaign、createCampaign | `ecom-marketing` | 后端实现 + 后端测试 |
| 商品上架校验 | 商品状态、SKU、SALEABLE | `ecom-product` | 后端实现 + 后端测试 |
| 库存保护校验 | 库存、availableQuantity、stock guard | `ecom-inventory` | 后端实现 + 后端测试 |
| 运营后台错误提示 | console、运营后台、创建页面 | `console` | 前端实现 + 前端测试 |

最终不是生成一个大任务，而是生成多个独立应用分支：

```text
console
  -> frontend-impl
  -> frontend-test

ecom-marketing
  -> java-impl
  -> backend-test

ecom-product
  -> java-impl
  -> backend-test

ecom-inventory
  -> java-impl
  -> backend-test
```

每个分支都有自己的子 agent、产物和失败回退，避免多应用上下文互相污染。

### 2.1 多应用代码实现怎么触发子 agent

需求归属确认完成后，系统会生成 `fanout-decision.json`。这个文件决定哪些应用进入本次实现分支：

```text
fanout-decision.json
  -> includedProjects
  -> workflowInstance.branches
  -> branch nodes
```

Pipeline Engine 在进入应用实现阶段时，不是创建一个大 agent 处理所有应用，而是按分支创建子 agent：

```text
for each branch project:
  create AgentEngine(projectName, nodeId)
  cwd = 当前应用项目目录
  tools = read / grep / edit / write / maven / bash
  prompt = 当前应用的 MRD + 技术方案 + OpenSpec 任务 + 知识库证据
```

也就是说：

- `ecom-marketing/java-impl` 有自己的实现 agent。
- `ecom-product/java-impl` 有自己的实现 agent。
- `ecom-inventory/java-impl` 有自己的实现 agent。
- `console/frontend-impl` 有自己的前端实现 agent。

子 agent 的触发条件来自分支节点状态：

```text
branch node status != completed/skipped
  -> 可以触发对应子 agent
```

某个应用的 `java-impl` 完成后，该应用可以直接进入 `backend-test`，不需要等待其他应用的 `java-impl` 都完成。这就是“分支流水线并发”。

### 2.2 子 agent 之间怎么通信

子 agent 之间不直接通信，也不共享对话上下文。这样设计是为了避免一个应用的上下文污染另一个应用。

通信方式是通过结构化产物和 workflow 状态完成的：

```text
子 agent A
  -> 写入 artifacts/<app>/...
  -> 更新 branch artifactIndex
  -> 更新 branch node status

子 agent B
  -> 只读取自己应用相关输入
  -> 需要跨应用信息时读取正式产物，而不是读取 A 的聊天记录
```

允许共享的是正式事实：

- `mrd-clarified.md`
- `requirement-ownership.json`
- `fanout-decision.json`
- `<app>/tech-design.md`
- `<app>/branch-summary.json`
- lifecycle artifacts
- 知识库 / GitNexus 证据

不允许共享的是：

- sibling agent 的自由对话上下文
- sibling agent 的未确认中间推理
- sibling 分支的失败状态
- sibling 分支的临时工具输出

分支汇合时，系统只汇总每个分支的 `branch-summary.json` 和 lifecycle artifacts：

```text
branch summaries
  -> app join
  -> AI Testing input
```

所以子 agent 之间不是“聊天协作”，而是“通过产物和事实模型协作”。

### 3. 造数是怎么判断的

造数不是让模型随便编几条 JSON。AI Testing 会根据测试用例、应用影响面、知识库里的数据实体和依赖关系判断需要哪些领域数据。

判断依据：

- MRD 的验收场景。
- 进入实现分支的应用。
- 知识库里的数据库表、领域实体和接口说明。
- 跨应用依赖链路。
- 测试用例的前置条件和断言。

当前 case 的造数判断：

```text
活动创建需要：
  -> 一个可上架商品
  -> 一条可用库存
  -> 一个活动草稿或创建请求

负向场景需要：
  -> 一个未上架商品
  -> 一条低库存记录
```

所以 AI Testing 生成的数据计划会落到领域 data builder：

```text
商品域 builder
  -> createSku(SALEABLE)
  -> createSku(OFF_SHELF)

库存域 builder
  -> setStock(AVAILABLE)
  -> setStock(lowStock)

营销域 builder
  -> createCampaign(DRAFT)
```

真实执行时，`demo/ecom/ecom-integration-tests` 会运行：

```bash
npm run seed
npm run test:live
```

其中 `seed` 负责真实造数，`test:live` 负责验证跨应用链路。

### 4. 影响面是怎么分析的

影响面分析是贯穿 AI Coding、AI Testing、AI Ops 的横切能力。

它综合四类事实：

```text
需求事实：MRD、requirement-ownership、fanout-decision
应用事实：应用管理、应用业务域、应用能力
知识事实：应用级知识库、global 知识库、业务术语
代码事实：GitNexus 文件图谱、接口图谱、依赖图谱
运行事实：部署、测试、覆盖率、质量门禁、告警、归档
```

在 AI Coding 中，影响面用于判断哪些应用需要改代码：

```text
MRD -> 知识库召回 -> 应用级验证 -> fanout-decision
```

在 AI Testing 中，影响面用于判断哪些链路需要测试：

```text
已改应用
  -> 上游入口
  -> 下游依赖
  -> 共享数据实体
  -> 集成测试用例
  -> 回归范围
```

在 AI Ops 中，影响面用于判断告警会影响哪些上下游：

```text
告警接口 / traceId / 错误关键词
  -> 应用知识库
  -> GitNexus 依赖图
  -> 上下游应用
  -> 修复建议
```

这个设计保证了同一套事实可以服务研发、测试和运维，而不是每个环节重新让模型猜一次。

### 5. 怎么知道要启动哪些服务

服务启动不是由模型随意决定，而是由 lifecycle deployment context 和影响面共同决定。

判断输入：

```text
fanout-decision.json
  -> 本次需求直接影响哪些应用

branch-summary.json
  -> 每个应用实际改了什么

dependency-map / GitNexus
  -> 哪些上下游链路需要参与集成测试

AI Testing data plan / cases
  -> 测试执行依赖哪些领域服务

lifecycle deployment set
  -> 本次测试环境应该部署哪些 app ref
```

在当前 ecom case 中：

```text
活动创建链路：
  console
    -> ecom-marketing
      -> ecom-product
      -> ecom-inventory
```

因此部署关联应用阶段会准备这些服务：

| 服务 | 启动原因 |
| --- | --- |
| `console` | 运营后台入口和前端交互 |
| `ecom-marketing` | 活动创建主服务 |
| `ecom-product` | 商品上架状态校验 |
| `ecom-inventory` | 库存保护校验 |

demo 环境下，服务启动落到：

```bash
./demo/ecom/scripts/start-all.sh
```

AI Testing 执行前会创建 deployment context：

```text
deploymentSet
  -> environment
  -> app refs
  -> testing workflow
```

然后集成测试仓库执行：

```bash
cd demo/ecom/ecom-integration-tests
npm run seed
npm run test:live
```

如果后续接入真实环境，这里可以替换为：

- K8s namespace 部署
- CI/CD pipeline 部署
- 测试环境服务发现
- 稳定版本 + feature version 混部
- 按 dependency-map 只启动必要服务

## 产品截图

### AI Coding / 需求 PI

![AI Coding 需求 PI 工作流](docs/png/readme-ai-coding.png)

### AI Testing / 跨应用测试

![AI Testing 跨应用测试](docs/png/readme-ai-testing.png)

### AI Ops / 应用运维

![AI Ops 应用运维](docs/png/readme-ai-ops.png)

### 应用管理

![应用管理](docs/png/readme-app-management.png)

### 知识库管理

![知识库管理](docs/png/readme-knowledge.png)

## 产品演示与技术方案

每个模块都可以作为一个独立产品来介绍：先看产品演示和核心特色，再看技术链路和实现边界。

- [AI Coding 产品演示与技术方案](docs/ai-coding-technical-design.md)
- [AI Testing 产品演示与技术方案](docs/ai-testing-technical-design.md)
- [AI Ops 产品演示与技术方案](docs/ai-ops-technical-design.md)
- [应用管理产品演示与技术方案](docs/application-management-technical-design.md)
- [知识库管理产品演示与技术方案](docs/knowledge-management-technical-design.md)
- [GitNexus 与影响面分析产品演示与技术方案](docs/knowledge-gitnexus-impact-design.md)

## 核心能力

- 需求管理：维护 MRD，MRD Ready 后从需求管理页面启动 PI 流程。
- 应用管理：维护应用列表、仓库路径、应用类型、业务域、接口和依赖信息。
- 知识库管理：生成应用级知识库、全局应用能力图谱、依赖图谱、API 路由图和业务术语索引。
- 需求归属确认：根据 MRD + 全局知识库 + 应用级知识库确认影响应用，不依赖硬编码业务映射。
- 应用分支流水线：每个应用独立子 agent、独立状态、独立产物和独立失败回退。
- AI Coding：面向开发交付，按应用生成实施方案与任务，完成 Java/前端实现、代码审查、后端测试、前端测试和分支摘要。
- AI Testing：面向测试交付，生成集成测试用例、造数计划、集成测试代码，部署关联应用并执行真实跨应用测试。
- AI Ops：面向应用运维，基于应用、源码、知识库、GitNexus 产物和本地告警内容做告警分析与修复建议。
- 生命周期产物：部署、测试、覆盖率、质量门禁、失败归因、回归计划和归档报告统一登记为 lifecycle artifacts。

## 已跑通的真实 Case

当前完整跑通的主用例是：

```text
MRD: 定向营销活动创建时增加商品上架与库存保护校验
```

系统根据 MRD 和知识库命中的影响应用：

- `console`
- `ecom-marketing`
- `ecom-product`
- `ecom-inventory`

已验证能力：

- 从需求管理启动 PI 流程。
- 需求分析与归属确认不再要求上传代码项目。
- 应用分支按流水线并发推进，而不是阶段栅栏式推进。
- 子 agent 之间隔离上下文，一个分支失败不会污染 sibling 分支。
- `console` 前端实现和测试独立执行。
- 后端应用完成 Java 实现和后端测试。
- 跨应用测试执行真实造数和真实集成测试。
- 最终归档完成。

真实跨应用测试仓库：

```text
demo/ecom/ecom-integration-tests
```

真实执行命令：

```bash
npm run seed
npm run test:live
```

已验证 run：

```text
g2jG99Lmk1
```

该 run 已完成全部 PI 节点，`npm run seed` 写入真实商品、库存、活动数据，`npm run test:live` 执行 `node:test` 集成测试并通过 2 个用例。

## 示例

### 需求输入示例

```text
定向营销活动创建时，需要校验商品是否已上架，并校验库存是否可用。
如果商品未上架或库存不足，活动创建应失败并给出明确提示。
```

### 应用归属示例

| 应用 | 归属原因 | 处理方式 |
| --- | --- | --- |
| `ecom-marketing` | 活动创建主流程 | 进入后端实现分支 |
| `ecom-product` | 商品上架状态校验 | 进入后端实现分支 |
| `ecom-inventory` | 库存保护校验 | 进入后端实现分支 |
| `console` | 活动创建页面提示和交互 | 进入前端实现分支 |

### AI Testing 示例

```text
造数：
  -> 创建 SALEABLE SKU
  -> 设置 AVAILABLE 库存
  -> 创建 DRAFT 定向活动

集成测试：
  -> 商品和库存数据准备完成后允许创建活动
  -> 未上架商品和低库存场景进入负向用例
```

### AI Ops 示例

```text
告警：营销活动创建失败率升高
线索：marketing createCampaign 接口返回库存保护错误
影响面：ecom-marketing -> ecom-product / ecom-inventory
建议：先校验商品状态接口，再校验库存查询链路，最后回归活动创建链路
```

## 工作流

### 需求 PI 主流程

```text
MRD / Knowledge Init
  -> 需求分析与归属确认
  -> 实施方案与任务
  -> 应用分支流水线
  -> 分支汇合
  -> 集成测试用例
  -> 造数
  -> 生成集成测试代码
  -> 部署关联应用
  -> 执行集成测试
  -> 归档
```

### 应用分支流水线

后端应用：

```text
implementation-plan
  -> java-impl
  -> backend-test
```

前端应用：

```text
implementation-plan
  -> frontend-impl
  -> frontend-test
```

### AI Testing 流程

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

## 快速开始

### 环境要求

- Node.js 20+
- npm
- Java / JDK
- Maven
- 可用的大模型 API 配置

### 安装

```bash
npm install
npm run build
```

### 启动

```bash
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

### 模型配置

常用环境变量：

```bash
LLM_PROVIDER=openai-compat
LLM_MODEL=gpt-5.4
LLM_BASE_URL=https://your-model-endpoint/v1
LLM_API_KEY=your-api-key
JAVA_HOME=/path/to/jdk
MAVEN_HOME=/path/to/maven
PORT=3000
```

完整 PI 流程应使用真实大模型调用验证，不应使用 mock LLM。

## Demo Ecom

Demo 多应用工程位于：

```text
demo/ecom/
```

常用命令：

```bash
./demo/ecom/scripts/init-db.sh
./demo/ecom/scripts/build-all.sh
./demo/ecom/scripts/start-all.sh
./demo/ecom/scripts/stop-all.sh
```

集成测试仓库：

```text
demo/ecom/ecom-integration-tests/
```

它包含：

- 测试 fixture
- 各领域数据 builder
- `seed` 造数脚本
- `node:test` 集成测试
- live 服务健康检查

手动验证：

```bash
cd demo/ecom/ecom-integration-tests
npm run seed
npm run test:live
```

`test:live` 要求相关服务可用；服务不可用时会失败，不会静默 skip。

## 关键产物

运行态目录：

```text
runtime-projects/runs/<runId>/artifacts/
```

常见 PI 产物：

- `project-manifest.json`
- `mrd-clarified.md`
- `mrd-clarify-questions.md`
- `requirement-ownership.json`
- `fanout-decision.json`
- `<app>/tech-design.md`
- `<app>/openspec/.../tasks.md`
- `<app>/changed-files.json`
- `<app>/code-preview-manifest.json`
- `<app>/code-review.md`
- `<app>/changed-test-files/*`
- `<app>/test-report.md`
- `<app>/frontend-implementation-report.md`
- `<app>/frontend-test-report.md`
- `<app>/branch-summary.json`
- `cross-app/test-results.json`
- `cross-app/delivery-metadata.json`
- `archive-manifest.json`

AI Testing 产物：

- `testing/<workflowInstanceId>/generate_strategy/testing-strategy-*.json`
- `testing/<workflowInstanceId>/generate_cases/testing-test-cases-*.json`
- `testing/<workflowInstanceId>/generate_data_plans/testing-data-plan-*.json`
- `testing/<workflowInstanceId>/generate_scripts/testing-generated-script-*.json`
- `testing/<workflowInstanceId>/execute_scripts/testing-execution-report-*.json`
- `testing/<workflowInstanceId>/calculate_metrics/testing-coverage-report-*.json`
- `testing/<workflowInstanceId>/quality_gate/testing-quality-gate-*.json`
- `testing/<workflowInstanceId>/regression_update/testing-regression-plan-*.json`

## 架构分层

```text
src/
  agents/
    codegen/          # 需求 PI 与代码生成 Agent
    testing/          # AI Testing Agent
    ops/              # AI Ops Agent
    knowledge/        # 知识库 Agent
    core/             # 共享 Agent Runtime
  application/        # 应用管理产品服务
  knowledge/          # 知识库初始化与检索
  lifecycle/          # 部署、测试、归档、质量门禁等生命周期事实模型
  requirement-pi/     # 需求 PI 产品入口
  requirements/       # 需求管理服务
  testing/            # AI Testing 产品服务
  app-ops/            # 应用运维服务
  tools/
    builtin/          # read / grep / glob / edit / bash / Java / Maven 工具
    knowledge/        # 知识库检索工具
    testing/          # 造数、脚本、执行、指标、schema 工具
    ops/              # 运维分析工具
  workflows/
    definitions/      # Workflow 模板与节点契约
    engine/           # PI Pipeline Engine
    runtime/          # 分支执行、testing runtime、ops runtime
  server/             # Hono API、Controller、WebSocket
  session/            # Session 与 execution-state 读模型
web/                  # 单页前端
prompts/              # 节点 Prompt
demo/ecom/            # 本地多应用 Demo 工作区
```

分层原则：

- Controller 只做 HTTP 入口，不承载业务逻辑。
- 产品服务层负责需求、应用、知识库、测试、运维等领域能力。
- Workflow definition 描述流程模板，runtime/engine 负责执行。
- Agent 负责推理和工具调用，正式结果必须落结构化 artifact。
- Tool 负责读写文件、检索知识库、执行构建测试和运行真实命令。
- lifecycle 记录部署、测试、覆盖率、质量门禁、失败归因、归档等事实。

## 测试

运行全部测试：

```bash
npm test
```

常用聚焦测试：

```bash
npm run build
node --test dist/__tests__/workflow-foundation.test.js
node --test dist/__tests__/testing-workflow-runtime.test.js dist/__tests__/testing-controller.test.js dist/__tests__/testing-tools.test.js
```

## 运行说明

- 运行态保存在 `runtime-projects/`。
- 本地模型配置和密钥不应提交到 Git。
- 每个应用分支拥有独立 agent id、artifact index、失败状态和重试状态。
- 顶层 fanout/join 只汇总分支状态，不共享子 agent 上下文。
- 跨应用测试不能只看节点状态，必须查看真实 execution report。

## License

内部原型项目。公开发布前请补充正式 License。
