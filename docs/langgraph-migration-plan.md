# LangGraph 完整迁移技术方案

## 1. 背景和目标

当前 `ai-coding` 的流程编排由自定义 `PipelineEngine` 完成。核心特点是：

- 流程是固定 MRD-to-Code 流水线，不是通用工作流编辑器。
- `execution-state.json` 是产品读模型，前端、恢复、归档、Demo 都依赖它。
- `logs/events.ndjson` 是 UI 轨迹和审计来源。
- 节点执行会写入 `artifacts/`、`workspace/`、`agents/*.json`、`checkpoints/`。
- 引擎内置确认门、重试、回退、项目级子 Agent、产物索引和上下文 manifest。

迁移目标不是简单替换循环代码，而是把“执行调度和恢复能力”交给 LangGraph，同时保留现有产品协议和运行态目录结构。

目标架构：

- 前端使用 React Flow 形式展示和编辑 workflow definition，可参考 `ai-ops/src/app/workflows`。
- 后端使用 LangGraph `StateGraph` 作为流程 runtime。
- 继续保留 `execution-state.json` 作为前端和 API 的稳定读模型。
- LangGraph checkpoint 作为执行内部状态，用于恢复、interrupt、time travel 和故障容错。
- 现有节点业务逻辑、AgentEngine、工具权限、产物生成优先复用，分阶段迁移。

非目标：

- 不在第一阶段重写所有节点 prompt 和业务执行逻辑。
- 不把前端 React Flow nodes/edges 直接等同于 LangGraph 内部状态。
- 不让 LangGraph checkpoint 直接成为前端读取协议。
- 不破坏现有 fixture demo 和历史 run 的读取能力。

## 2. 迁移原则

1. 单一产品读模型

   `execution-state.json` 继续是 UI、REST API、WebSocket 恢复和归档报告的读取来源。LangGraph checkpoint 只负责 runtime resume，不直接暴露给前端。

2. 节点业务逻辑先包裹，后重构

   第一阶段每个 LangGraph node 只是调用当前已有节点执行函数。等 runtime 稳定后，再考虑把 Agent loop、tool loop 改造成 LangGraph 子图。

3. 所有副作用必须幂等

   LangGraph interrupt 恢复时，interrupt 所在 node 可能从 node 开始重新执行。所有 interrupt 前的文件写入、事件写入、状态写入必须通过幂等 key 防重。

4. 大对象留在文件系统

   Graph state 只保存路径、摘要、索引和状态，不保存完整 transcript、完整产物内容或大工具输出。

5. 先支持固定流程，再开放自定义流程

   `ai-coding` 当前业务是固定 MRD-to-Code。先把固定 `PIPELINE_NODES` 编译为 LangGraph，再引入前端可编辑 workflow。

## 3. 参考能力和现状差异

### 3.1 当前 ai-coding

当前核心模块：

- `src/workflows/definitions/pipelineDefinition.ts`: 固定节点定义。
- `src/workflows/engine/pipelineEngine.ts`: 顺序执行、确认门、重试、回退、事件和产物索引。
- `src/persistence/stateStore.ts`: `execution-state.json`、`agents/*.json`、plan state。
- `src/events/EventLog.ts`: `events.ndjson`。
- `src/agent/AgentEngine.ts`: ReAct loop、工具调用、上下文压缩、模型切换。

这些能力不能被 LangGraph 自动替代：

- 产物文件写入和索引。
- 页面事件语义。
- 权限审批和工具安全。
- Java/Maven 专用执行逻辑。
- 多项目 project state。
- 节点回退和修复轮次。

### 3.2 ai-ops 可借鉴部分

`ai-ops/src/app/workflows` 提供了一个 React Flow 前端：

- `WorkflowDefinition` 使用 `nodes` 和 `edges` 表达流程结构。
- 节点配置包含 tools、MCP、skills、knowledge、prompt、maxTurns。
- 编辑器支持拖拽、连线、右侧节点配置面板、自动保存。

可直接借鉴：

- React Flow 画布布局。
- `WorkflowDefinition` 的 nodes/edges schema 思路。
- 节点配置面板的 tools/MCP/skills/prompt tabs。
- `structureEditable` 的锁定模式。默认 MRD-to-Code 可以先锁定结构，只允许编辑节点配置。

不建议直接照搬：

- `ai-ops` 的执行引擎仍是自定义 `while` loop，不是 LangGraph。
- `ai-ops` 的节点语义偏通用 Agent 编排，`ai-coding` 的节点语义偏产物流水线。
- `ai-coding` 需要 confirmation、artifact、rollback、project state，这些需要扩展 schema。

## 4. 目标架构

### 4.1 模块划分

建议新增模块：

```text
src/workflows/
  types.ts                    # WorkflowDefinition、WorkflowNode、WorkflowEdge
  builtinDefinitions.ts       # 内置 MRD-to-Code workflow
  storage.ts                  # workflow 定义读写
  compilerTypes.ts            # 编译中间结构

src/langgraph/
  state.ts                    # LangGraph state schema 和 reducer
  compiler.ts                 # WorkflowDefinition -> StateGraph
  runtime.ts                  # invoke/stream/resume/cancel 封装
  checkpointer.ts             # 文件或 DB checkpointer 适配
  readModelSync.ts            # LangGraph state -> ExecutionState 同步
  eventBridge.ts              # LangGraph events -> PipelineEvent/EventLog
  commands.ts                 # resume/cancel/rerun/approve/reject 命令模型

src/langgraph/nodes/
  stageNode.ts                # 通用 stage node wrapper
  confirmationNode.ts         # interrupt-based confirmation gate
  fanoutNode.ts               # 动态展开多应用分支
  joinNode.ts                 # 等待多应用分支汇合
  aggregateReviewNode.ts      # 跨应用审核和汇总
  rollbackRouter.ts           # 回退/重试路由
  terminalNode.ts             # completed/failed/cancelled 收尾

src/workflows/runtime/
  pipelineNodeRunners.ts      # 节点执行函数边界
  pipeline-node-runners/      # upload、legacy stage、E2E 等 runner
```

迁移期保留：

```text
src/workflows/engine/pipelineEngine.ts # legacy mode 使用
src/persistence/stateStore.ts # 产品读模型继续使用
src/events/EventLog.ts        # 事件日志继续使用
```

### 4.2 运行链路

启动任务：

1. API 创建 run，初始化运行态目录。
2. 选择 workflow definition，默认使用内置 MRD-to-Code。
3. `LangGraphRuntime.start(runId, workflowId)` 加载 workflow。
4. `compiler.ts` 编译为 LangGraph app。
5. app 使用 `thread_id = runId` 运行。
6. 每个节点执行时同步更新 `execution-state.json` 和 `events.ndjson`。
7. 如果遇到确认门，节点调用 `interrupt()`，runtime 返回 waiting confirmation。
8. 用户确认后，API 使用相同 `thread_id` 和 `Command({ resume })` 恢复。
9. 流程结束后更新 `execution-state.json.status = completed|failed|cancelled`。

多应用任务启动后：

1. `mrd-render` 或 `implementation-plan` 产出应用拆解结果，写入 `ProjectManifest`。
2. fan-out node 根据 `ProjectManifest.projects` 动态创建每个应用的 branch。
3. 每个 branch 独立执行应用内代码修改、应用内 CR、应用内测试、应用内修复回退。
4. join node 等待所有必须完成的 branch 达到终态。
5. aggregate review node 汇总所有应用的变更、测试结果和风险，做跨应用代码审核。
6. 如果跨应用审核发现契约、依赖、兼容性问题，按影响应用集合回退对应 branch。
7. 所有应用通过后进入 archive，生成跨应用交付包。

前端读取：

- 列表和详情仍读现有 `/api/sessions`、`/api/sessions/:runId`。
- WebSocket 仍推送 `PipelineEvent` 风格事件。
- 新增 workflow editor API 只管理定义，不直接读取 LangGraph checkpoint。

## 5. Workflow Definition 设计

### 5.1 基础 schema

```ts
export type WorkflowNodeType =
  | 'stage'
  | 'agent'
  | 'confirmation'
  | 'router'
  | 'fanout'
  | 'join'
  | 'aggregate_review'
  | 'end';

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: number;
  locked?: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  globalConfig: WorkflowGlobalConfig;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position?: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowNodeData {
  label: string;
  description?: string;
  stageId?: string;
  runner?: StageRunnerId;
  hasConfirmationGate?: boolean;
  usesReActLoop?: boolean;
  maxTurns?: number;
  planModeRequired?: boolean;
  artifactOutputs?: string[];
  enabledBuiltins?: string[];
  enabledMcpTools?: string[];
  enabledSkills?: string[];
  systemPrompt?: string;
  modelOverrideKey?: string;
  fanout?: FanoutConfig;
  join?: JoinConfig;
}

export interface FanoutConfig {
  source: 'projects' | 'apps' | 'custom';
  branchWorkflowId: string;
  concurrencyLimit?: number;
  failurePolicy: 'fail_fast' | 'continue_and_collect' | 'threshold';
  maxFailures?: number;
}

export interface JoinConfig {
  waitFor: 'all' | 'required_only' | 'threshold';
  minSuccess?: number;
  timeoutMs?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  kind: 'normal' | 'conditional' | 'rollback' | 'retry' | 'approval';
  condition?: WorkflowEdgeCondition;
  priority?: number;
}
```

### 5.2 内置 MRD-to-Code workflow

由当前 `PIPELINE_NODES` 自动生成：

```text
upload-init
  -> mrd-render
  -> mrd-render-confirmation
  -> implementation-plan
  -> implementation-plan-confirmation
  -> spec-generate
  -> java-impl
  -> java-impl-router
  -> testcode-generate
  -> testcode-router
  -> archive
  -> end
```

确认门拆成独立 confirmation node，避免 stage node 内部既写产物又 interrupt，降低恢复重复副作用风险。

回退 router 拆成独立 router node：

- `java-impl-router`: 根据 review findings 判断是否回退到 `java-impl` 或进入 `testcode-generate`。
- `testcode-router`: 根据 maven/test/coverage 分类判断是否回退到 `java-impl`、`testcode-generate` 或进入 `archive`。

### 5.3 前端编辑策略

第一阶段：

- 引入 React Flow 只展示内置 workflow。
- `locked = true`，禁止新增/删除节点和连线。
- 允许编辑：
  - 节点模型 override。
  - maxTurns。
  - 是否跳过确认门。
  - prompt 模板选择。
  - tools/skills 配置。

第二阶段：

- 支持 fork 内置 workflow 生成自定义 workflow。
- 支持新增 agent/router/end 节点。
- 对产物型 stage 节点保持白名单，避免用户删除关键产物导致下游不可用。

第三阶段：

- 支持条件边编辑。
- 支持并行项目分支。
- 支持 workflow versioning 和 run 绑定 workflow snapshot。

### 5.4 动态多应用 workflow

多应用修改不应通过预先画出固定数量应用节点实现。应用数量来自上传代码、应用绑定或需求拆解结果，因此需要动态 workflow。

推荐抽象：

```text
upload-init
  -> mrd-render
  -> implementation-plan
  -> app-fanout
       -> per-app branch:
            app-spec-generate
            -> app-code-impl
            -> app-code-review
            -> app-testcode-generate
            -> app-unit-test
            -> app-integration-test
            -> app-branch-summary
  -> app-join
  -> cross-app-code-review
  -> cross-app-integration-review
  -> archive
  -> end
```

其中 `per-app branch` 是 branch workflow，不直接作为主 workflow 的固定节点展开。主 workflow 只表达 fan-out、join 和跨应用节点。

关键节点：

- `app-fanout`: 根据 `projects` 或 `apps` 动态创建分支。
- `app-code-impl`: 每个应用独立修改代码。
- `app-code-review`: 每个应用独立 CR，发现问题只回退本应用 branch。
- `app-unit-test`: 每个应用独立跑单测。
- `app-integration-test`: 每个应用独立跑应用内集成测试。
- `app-branch-summary`: 输出该应用的变更摘要、风险、接口变化、测试结果。
- `app-join`: 等待所有应用 branch 完成。
- `cross-app-code-review`: 汇总所有应用变更，审核跨应用契约、接口兼容、数据模型、调用链和发布顺序。
- `cross-app-integration-review`: 汇总跨应用测试结果，必要时生成跨应用联调测试计划。

### 5.5 Branch workflow schema

新增 branch workflow 定义：

```ts
export interface BranchWorkflowDefinition extends WorkflowDefinition {
  branchKind: 'project' | 'application' | 'module';
  inputSchema: {
    branchId: string;
    projectName: string;
    projectRoot: string;
    requirementSlicePath: string;
    upstreamArtifacts: string[];
  };
}
```

主 workflow 的 fanout node 引用 branch workflow：

```json
{
  "id": "app-fanout",
  "type": "fanout",
  "data": {
    "label": "多应用并发执行",
    "fanout": {
      "source": "projects",
      "branchWorkflowId": "mrd-to-code-app-branch",
      "concurrencyLimit": 4,
      "failurePolicy": "continue_and_collect"
    }
  }
}
```

`concurrencyLimit` 必须存在，避免一次需求涉及很多应用时同时打满模型、磁盘和测试进程。

### 5.6 动态 workflow 和 LangGraph 的关系

动态 workflow 分两层：

1. 产品定义层

   React Flow 保存的是“模板图”，包含 fanout/join/aggregate 节点，不保存每个实际应用分支。

2. Runtime 展开层

   LangGraph 运行时根据 `ProjectManifest` 动态展开 branch task。每个 branch task 有自己的 `branchId`、`projectName`、`projectRoot`、状态和产物索引。

前端展示也分两层：

- Workflow 模板视图：展示 fanout/join 节点。
- Run 实例视图：fanout 节点可展开，展示实际应用分支列表和每个分支的节点状态。

不要把动态 branch 回写进 workflow definition，否则一次 run 的实例状态会污染模板。

## 6. LangGraph State 设计

### 6.1 Graph state

Graph state 必须 JSON serializable，并且只保存小对象。

```ts
export interface PipelineGraphState {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  status: 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled';
  currentNodeId?: string;

  nodes: Record<string, GraphNodeState>;
  projects: GraphProjectState[];
  branches: Record<string, BranchState>;
  branchOrder: string[];
  joins: Record<string, JoinState>;
  artifactIndex: Record<string, string[]>;
  contextManifests: Record<string, ContextManifest>;

  modelOverrides: Record<string, string>;
  permissionMode: string;
  currentAgentRunId?: string;

  confirmation?: GraphConfirmationState;
  rollback?: RollbackState;
  retry: GraphRetryState;

  error?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface GraphNodeState {
  id: string;
  status: NodeStatus;
  startedAt?: number;
  completedAt?: number;
  outputArtifacts?: string[];
  childAgentIds?: string[];
  error?: string;
  failureCount: number;
  idempotencyKeys?: string[];
}

export interface GraphConfirmationState {
  nodeId: string;
  sourceStageId: string;
  title: string;
  contentPath?: string;
  contentPreview?: string;
  approved?: boolean;
  feedback?: string;
}

export interface BranchState {
  branchId: string;
  workflowId: string;
  projectName: string;
  projectRoot: string;
  status: 'pending' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled' | 'waiting_fix';
  currentNodeId?: string;
  nodes: Record<string, GraphNodeState>;
  artifactIndex: Record<string, string[]>;
  contextManifests: Record<string, ContextManifest>;
  childAgentIds: string[];
  retry: GraphRetryState;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface JoinState {
  joinNodeId: string;
  waitingForBranchIds: string[];
  completedBranchIds: string[];
  failedBranchIds: string[];
  status: 'pending' | 'waiting' | 'completed' | 'failed';
}
```

### 6.2 State reducer

LangGraph reducer 规则：

- `nodes`: 按 node id merge。
- `projects`: 按 project name merge。
- `branches`: 按 branch id merge。
- `joins`: 按 join node id merge。
- `artifactIndex`: 按 stage id merge，覆盖同 stage 最新产物。
- `contextManifests`: 按 stage id merge。
- `retry`: 累加或覆盖，按字段明确处理。
- `events` 不进入 graph state，统一写 `events.ndjson`。

### 6.3 ExecutionState 同步

`readModelSync.ts` 提供：

```ts
export function syncExecutionStateFromGraph(
  graphState: PipelineGraphState,
  options: { reason: string }
): ExecutionState
```

同步规则：

- `PipelineGraphState.status` -> `ExecutionState.status`。
- `currentNodeId` -> `currentNodeId/currentNodeIndex`。
- `nodes` record -> `ExecutionState.nodes` array，顺序按 workflow definition。
- `projects/artifactIndex/contextManifests/rollback/modelOverrides` 原样映射。
- `branches` 映射到扩展后的 `ExecutionState.projects`，并为前端提供 branch drilldown。
- `updatedAt` 每次同步刷新。

同步时机：

- graph start。
- node start。
- node end。
- confirmation interrupt 前。
- confirmation resume 后。
- rollback decision 后。
- failure/cancel/complete。

### 6.4 多应用状态设计

现有 `ProjectState` 只能表达“项目在当前节点的状态”，不足以表达动态 branch 内的多节点执行。需要扩展：

```ts
export interface ProjectState {
  name: string;
  root: string;
  branchId?: string;
  currentNodeId?: string;
  status: ProjectStatus;
  retry: {
    reviewBlockCount: number;
    testRetryCount: number;
    coverageRetryCount: number;
    integrationRetryCount: number;
    crossAppReviewBlockCount: number;
  };
  nodes?: Record<string, NodeState>;
  outputArtifacts?: string[];
  dependencyChanges?: DependencyChange[];
  apiChanges?: ApiChange[];
}
```

跨应用审核需要每个 branch 输出结构化摘要：

```ts
export interface BranchSummary {
  branchId: string;
  projectName: string;
  changedFiles: string[];
  publicApiChanges: ApiChange[];
  databaseChanges: DatabaseChange[];
  configChanges: ConfigChange[];
  dependencyChanges: DependencyChange[];
  testResults: TestResultSummary;
  riskNotes: string[];
  requiredCrossAppChecks: string[];
}
```

这些摘要写入：

```text
artifacts/<project>/branch-summary.json
artifacts/<project>/code-review.md
artifacts/<project>/test-report.md
```

`cross-app-code-review` 只读取 branch summary 和必要产物，不读取所有 transcript。

### 6.5 并发控制

多应用并发需要三层限流：

1. branch 并发数

   `fanout.concurrencyLimit` 控制同时运行的应用分支数量，默认 3 或 4。

2. 模型并发数

   对 LLM provider 增加 semaphore，避免多个 branch 内同时产生大量请求。

3. 命令并发数

   Maven test、compile、integration test 必须有独立限流，避免 CPU 和磁盘打满。

建议配置：

```text
AI_CODING_BRANCH_CONCURRENCY=4
AI_CODING_LLM_CONCURRENCY=6
AI_CODING_TEST_CONCURRENCY=2
AI_CODING_BRANCH_FAILURE_POLICY=continue_and_collect
```

失败策略：

- `fail_fast`: 任一 branch 失败即取消其他 branch。
- `continue_and_collect`: 继续跑完其他 branch，join 后统一展示失败和可修复项。
- `threshold`: 失败数量超过阈值才终止。

对于代码生成场景，推荐默认 `continue_and_collect`。这样一个应用失败不会浪费其他应用已经可以完成的修改。

### 6.6 跨应用审核和回退

跨应用审核节点输入：

- 所有 `branch-summary.json`。
- 所有应用 `changed-files.json`。
- 所有应用 `code-review.md`。
- 所有应用 `test-report.md`。
- 需求拆解中的应用边界和接口约定。

审核输出：

```ts
export interface CrossAppReviewResult {
  status: 'approved' | 'blocked';
  findings: CrossAppFinding[];
  affectedBranches: string[];
  requiredFixes: Array<{
    branchId: string;
    projectName: string;
    targetNodeId: string;
    feedback: string;
  }>;
}
```

典型跨应用问题：

- A 应用改了 DTO，但 B 应用调用方未适配。
- 上游接口返回码、字段语义、错误处理不一致。
- 数据库 schema 变更缺少兼容策略。
- 配置项、topic、RPC service name 不一致。
- 多应用发布顺序存在风险。
- 单应用测试通过，但跨应用契约不成立。

回退策略：

- 如果问题只影响某个应用，回退该 branch 到 `app-code-impl` 或 `app-testcode-generate`。
- 如果问题影响接口契约，回退相关多个 branch。
- 如果问题来自需求拆解或实施方案，回退主 workflow 到 `implementation-plan`，并清理所有 downstream branch。

跨应用回退必须记录：

```ts
export interface CrossAppRollbackState {
  sourceNodeId: 'cross-app-code-review' | 'cross-app-integration-review';
  affectedBranchIds: string[];
  targetNodeIdByBranch: Record<string, string>;
  reason: string;
  attempt: number;
}
```

### 6.7 前端多应用展示

Run 页面建议增加分层视图：

```text
主流程:
  Upload
  需求拆解
  实施方案
  多应用并发执行 [3/4 completed, 1 failed]
    - app-a: completed
    - app-b: running: app-unit-test
    - app-c: waiting_fix: app-code-review
    - app-d: completed
  跨应用代码审核
  归档
```

交互：

- 点击 fanout 节点展开 branch 列表。
- 点击 branch 查看该应用的执行轨迹和产物。
- 跨应用审核节点展示 finding 到 branch 的映射。
- 支持只重跑失败 branch。
- 支持取消单个 branch 或取消整个 run。

事件新增：

```ts
| { type: 'branch_start'; branchId: string; projectName: string }
| { type: 'branch_node_start'; branchId: string; nodeId: string }
| { type: 'branch_node_end'; branchId: string; nodeId: string; success: boolean }
| { type: 'branch_end'; branchId: string; status: string }
| { type: 'join_waiting'; nodeId: string; waitingForBranchIds: string[] }
| { type: 'cross_app_review_required'; findings: CrossAppFinding[] }
```

旧前端可以忽略这些新事件，新前端使用它们渲染多应用分支。

## 7. Checkpointer 和 Store

### 7.1 开发期

开发期可以使用 LangGraph 内置 memory checkpointer，但只用于本地验证，不用于正式功能。

### 7.2 生产期文件 checkpointer

当前项目运行态是文件系统，因此先实现文件 checkpointer：

```text
runs/<runId>/
  langgraph/
    checkpoints/
      <checkpoint-id>.json
    latest.json
    metadata.json
```

要求：

- 原子写入：先写 `.tmp`，再 rename。
- checkpoint 和 `execution-state.json` 不要求同文件事务，但要保证可恢复。
- `thread_id = runId`。
- 每次 resume 前读取 latest checkpoint。

### 7.3 后续 DB checkpointer

如果需要多进程、多实例或远程任务队列，应迁移到数据库 checkpointer：

- SQLite: 单机部署。
- Postgres: 多实例部署。
- Redis 只适合短期状态，不建议作为唯一 durable checkpoint。

### 7.4 Store 使用边界

LangGraph store 用于长期跨 run 信息，例如：

- 用户偏好。
- 项目历史经验。
- 常用模型选择。
- 组织级知识索引。

不要把当前 run 的产物、事件和 agent state 放入 store。它们仍属于 run directory。

## 8. 节点执行迁移

### 8.1 拆分当前 PipelineEngine

先从 `PipelineEngine.executeNode` 和相关私有函数中抽出可独立调用的 node runner：

```ts
export interface StageRunnerContext {
  runId: string;
  workflowId: string;
  nodeId: string;
  stageId: string;
  state: PipelineGraphState;
  eventLog: EventLog;
  store: StateStore;
  emit: (event: PipelineEvent) => void;
}

export interface StageRunnerResult {
  output?: unknown;
  outputArtifacts: string[];
  contextManifest?: ContextManifest;
  childAgentIds?: string[];
}

export type StageRunner = (ctx: StageRunnerContext) => Promise<StageRunnerResult>;
```

每个原节点对应一个 runner：

- `uploadInitRunner`
- `mrdRenderRunner`
- `implementationPlanRunner`
- `specGenerateRunner`
- `javaImplRunner`
- `testcodeGenerateRunner`
- `archiveRunner`

### 8.2 通用 LangGraph node wrapper

```ts
export function createStageNode(nodeDef: WorkflowNode): GraphNode {
  return async (state, config) => {
    const ctx = createRunnerContext(state, nodeDef, config);
    await markNodeStart(ctx);
    try {
      const result = await runStage(ctx);
      return await markNodeCompleted(ctx, result);
    } catch (err) {
      return await markNodeFailed(ctx, err);
    }
  };
}
```

职责：

- 记录 `pipeline_node_start`。
- 更新 graph state 和 read model。
- 调用 runner。
- 收集产物。
- 写 context manifest。
- 记录 `pipeline_node_end`。
- 返回 state patch。

### 8.3 Confirmation node

确认门独立为 LangGraph node：

```ts
async function confirmationNode(state: PipelineGraphState) {
  const payload = buildConfirmationPayload(state);
  syncWaitingConfirmation(state, payload);
  const decision = interrupt(payload) as ConfirmationDecision;
  return applyConfirmationDecision(state, decision);
}
```

确认门规则：

- interrupt payload 必须 JSON serializable。
- 大内容写入 artifact 或 checkpoint 文件，payload 只放预览和路径。
- 用户拒绝且无 feedback -> cancelled。
- 用户拒绝且有 feedback -> 回到 source stage 重跑。
- 用户批准 -> 进入下一节点。

幂等要求：

- stage node 已经完成产物写入后才进入 confirmation node。
- confirmation node 自身不写业务产物，只写状态和事件。
- `confirmation_waiting` 事件用 idempotency key 防重复。

### 8.4 Router node

Router node 根据 state 决定下一跳。

```ts
export function routeAfterJavaImpl(state: PipelineGraphState): string {
  const rollback = detectRollbackAfterNode(state, 'java-impl');
  if (rollback) return 'java-impl';
  return 'testcode-generate';
}
```

LangGraph 编译时使用 conditional edge：

```ts
builder.addConditionalEdges('java-impl-router', routeAfterJavaImpl, {
  'java-impl': 'java-impl',
  'testcode-generate': 'testcode-generate',
  'failed': 'failed',
});
```

### 8.5 Fanout node

Fanout node 负责把需求拆解出的应用集合转换成 branch task。

```ts
async function appFanoutNode(state: PipelineGraphState): Promise<Partial<PipelineGraphState>> {
  const projects = resolveProjectsFromManifest(state);
  const branches = createBranchStates(projects, {
    branchWorkflowId: 'mrd-to-code-app-branch',
  });
  return {
    branches,
    branchOrder: branches.map(branch => branch.branchId),
    joins: {
      'app-join': {
        joinNodeId: 'app-join',
        waitingForBranchIds: branches.map(branch => branch.branchId),
        completedBranchIds: [],
        failedBranchIds: [],
        status: 'waiting',
      },
    },
  };
}
```

实现要求：

- branch id 必须稳定，例如 `${runId}-${projectName}` 的安全化版本。
- fanout node 只创建 branch state，不直接执行应用代码。
- fanout node 写入 `branch_start` 事件，或者由 branch runner 在实际启动时写入。
- fanout node 必须支持空项目列表，空列表应进入 failed 或等待用户补充。

### 8.6 Branch runner

Branch runner 执行每个应用自己的 branch workflow。第一阶段可以不把 branch workflow 也编译成完整 LangGraph 子图，而是用受控并发调度器顺序执行 branch 内节点。第二阶段再把 branch workflow 编译为子图。

```ts
export interface BranchRunnerContext extends StageRunnerContext {
  branchId: string;
  projectName: string;
  projectRoot: string;
  branchWorkflow: BranchWorkflowDefinition;
}

export async function runBranch(ctx: BranchRunnerContext): Promise<BranchState> {
  for (const node of ctx.branchWorkflow.nodes) {
    await runBranchNode(ctx, node);
    const route = routeBranchNode(ctx, node);
    if (route.rollback) resetBranchTo(ctx, route.targetNodeId);
  }
  return completeBranch(ctx);
}
```

并发调度器：

```ts
export async function runBranchesWithLimit(
  branches: BranchState[],
  limit: number,
  runOne: (branch: BranchState) => Promise<BranchState>
): Promise<BranchState[]> {
  // 使用内部 semaphore 控制并发，结果按 branchOrder 合并回 state。
}
```

branch 内节点建议：

- `app-spec-generate`
- `app-code-impl`
- `app-code-review`
- `app-testcode-generate`
- `app-unit-test`
- `app-integration-test`
- `app-branch-summary`

### 8.7 Join 和 aggregate review node

Join node 不做模型调用，只判断所有分支是否达到可汇合状态。

```ts
function appJoinNode(state: PipelineGraphState): Partial<PipelineGraphState> {
  const join = state.joins['app-join'];
  const completed = join.waitingForBranchIds.filter(id => state.branches[id]?.status === 'completed');
  const failed = join.waitingForBranchIds.filter(id => state.branches[id]?.status === 'failed');
  return updateJoinState(join, completed, failed);
}
```

Aggregate review node 读取所有 branch summary，生成跨应用审核结果。

```ts
export async function crossAppCodeReviewRunner(ctx: StageRunnerContext): Promise<StageRunnerResult> {
  const summaries = loadBranchSummaries(ctx.state);
  const result = await runCrossAppReviewAgent(summaries, ctx);
  writeCrossAppReviewArtifacts(result, ctx);
  if (result.status === 'blocked') {
    applyCrossAppRollback(result, ctx.state);
  }
  return {
    output: result,
    outputArtifacts: ['cross-app/code-review.md', 'cross-app/review-findings.json'],
  };
}
```

Aggregate review 不能直接修改所有应用代码。它只产生结构化 finding 和回退指令，由 router 把受影响 branch 送回对应节点修复。

## 9. 事件和流式输出

### 9.1 事件桥接

保留当前 `PipelineEvent` 和 `EventLog`，新增 `LangGraphEventBridge`：

```ts
export interface LangGraphEventBridge {
  emitPipelineEvent(event: PipelineEvent): void;
  logEvent(type: EventType, payload: unknown, agentRunId?: string, nodeId?: string): void;
  syncReadModel(state: PipelineGraphState, reason: string): void;
}
```

节点 runner 不直接依赖 WebSocket，统一通过 bridge：

- 写 `events.ndjson`。
- emit WebSocket event。
- 同步 `execution-state.json`。

### 9.2 LangGraph stream 映射

LangGraph runtime 对外提供：

```ts
start(runId): AsyncGenerator<PipelineEvent>
resume(runId, decision): AsyncGenerator<PipelineEvent>
cancel(runId): Promise<void>
```

内部可以消费 LangGraph stream events，但对前端仍输出现有事件：

- `stage_start`
- `stage_progress`
- `stage_end`
- `confirmation_required`
- `confirmation_resolved`
- `pipeline_complete`
- `pipeline_failed`
- `pipeline_cancelled`

### 9.3 AgentEngine 事件

第一阶段 `AgentEngine` 保持不变。它已经产生：

- `agent_start`
- `agent_text`
- `tool_start`
- `tool_end`
- `agent_end`

这些继续进入 `events.ndjson` 和 WebSocket。

后续如果把 `AgentEngine` 改为 LangGraph 子图，再映射子图 stream events。

## 10. API 设计

### 10.1 工作流定义 API

新增：

```text
GET    /api/workflows
POST   /api/workflows
GET    /api/workflows/:workflowId
PUT    /api/workflows/:workflowId
POST   /api/workflows/:workflowId/fork
GET    /api/workflows/:workflowId/validate
```

第一阶段可只提供：

- `GET /api/workflows/default-mrd-to-code`
- `PUT /api/workflows/default-mrd-to-code/config`

### 10.2 Run API 兼容

现有 API 保持：

```text
POST /api/sessions
POST /api/sessions/:runId/start
POST /api/sessions/:runId/resume
POST /api/sessions/:runId/confirm
POST /api/sessions/:runId/cancel
GET  /api/sessions/:runId
```

内部根据 feature flag 决定：

```ts
if (config.workflowRuntime === 'langgraph') {
  return langGraphRuntime.start(runId);
}
return legacyPipelineEngine.start(runId);
```

### 10.3 确认恢复 API

确认请求：

```json
{
  "nodeId": "implementation-plan-confirmation",
  "approved": true,
  "feedback": ""
}
```

内部转换：

```ts
new Command({
  resume: {
    approved: true,
    feedback: "",
    decidedAt: Date.now(),
    decidedBy: "user"
  }
})
```

## 11. 前端迁移方案

### 11.1 新增 Workflow 视图

参考 `ai-ops`：

- 左侧节点列表。
- 中间 React Flow 画布。
- 右侧节点配置面板。
- 顶部展示保存状态和 workflow 版本。

`ai-coding` 首屏仍是任务工作台，不改成通用 workflow 产品。Workflow 编辑入口放在“基础配置”或独立设置页。

### 11.2 节点状态叠加

React Flow node 展示运行状态：

- pending: 灰色。
- running: 蓝色或黄色。
- waiting_confirmation: 橙色。
- completed: 绿色。
- failed: 红色。
- skipped/suspended: 中性灰。

状态来源不是 workflow definition，而是 `/api/sessions/:runId` 的 `execution-state.json`。

### 11.3 结构锁定模式

默认 MRD-to-Code：

- 禁止删除节点。
- 禁止删除关键边。
- 禁止编辑 stage runner。
- 允许调整模型、maxTurns、确认门开关、prompt config。

自定义 workflow：

- 允许新增 agent/router/end。
- 允许编辑边。
- stage runner 节点只能从白名单添加。

### 11.4 配置保存

保存 workflow definition 时：

- 保存完整 nodes/edges。
- 校验 DAG 或允许 loop 需要显式设置 maxSteps。
- 校验必需产物依赖。
- 保存 workflow snapshot 到 run metadata，保证历史 run 可复现。

## 12. 兼容和迁移策略

### 12.1 Feature flag

新增配置：

```text
AI_CODING_WORKFLOW_RUNTIME=legacy|langgraph
AI_CODING_WORKFLOW_EDITOR=0|1
AI_CODING_LANGGRAPH_CHECKPOINTER=file|memory|postgres
```

默认：

- 本地开发可开 `langgraph`。
- 主分支初期默认 `legacy`。
- CI 同时跑 legacy 和 langgraph golden tests。

### 12.2 历史 run 兼容

历史 run 没有 LangGraph checkpoint：

- 仍按 `execution-state.json` 展示。
- resume 历史 run 时默认走 legacy engine。
- 如果用户选择迁移历史 run，需要生成 initial graph checkpoint，但不作为默认行为。

### 12.3 Demo fixture 兼容

`fixtures/full-flow-demo/run` 保持旧结构。

新增一个 LangGraph demo fixture：

```text
fixtures/langgraph-full-flow-demo/run/
  execution-state.json
  langgraph/checkpoints/latest.json
  logs/events.ndjson
  artifacts/
```

Demo 注入逻辑根据 runtime flag 选择 fixture。

### 12.4 回滚策略

任何阶段发现问题：

- 保留 `legacy` runtime。
- 新 run 可切回 legacy。
- 已经用 LangGraph 开始的 run 可以继续用 LangGraph，避免跨 runtime resume。
- 如果 LangGraph checkpoint 损坏，可尝试从 `execution-state.json` 重建恢复点，但标记为 best-effort recovery。

## 13. 测试方案

### 13.1 单元测试

新增测试：

- `WorkflowDefinition` 校验。
- `PIPELINE_NODES -> WorkflowDefinition` 转换。
- `WorkflowDefinition -> LangGraph` 编译。
- state reducer merge。
- `PipelineGraphState -> ExecutionState` 同步。
- confirmation decision apply。
- rollback router。
- retry counter。
- idempotency key 去重。
- fanout branch state 生成。
- branch concurrency scheduler。
- join state 判断。
- cross-app review result -> rollback state 转换。

### 13.2 集成测试

覆盖：

- 完整 mock provider 跑通。
- mrd-render 确认批准后继续。
- mrd-render 确认拒绝加 feedback 后重跑。
- implementation-plan 确认批准后进入 spec。
- java review blocked 后回退 java-impl。
- maven test failed 后回退对应节点。
- archive 完成后生成 zip。
- 进程中断后用同 runId resume。
- waiting_confirmation 状态下重启后 resume。
- 多应用 fanout 后并发执行每个 branch。
- 单个 branch CR 失败只回退该 branch。
- 单个 branch 单测失败只回退该 branch。
- 多个 branch 完成后 join 进入跨应用审核。
- 跨应用审核发现接口契约问题后回退受影响 branch。
- branch concurrency limit 生效。

### 13.3 Golden tests

基于当前 full-flow 覆盖增加双 runtime：

```ts
describe.each(['legacy', 'langgraph'])(...)
```

对比关键结果：

- final status。
- node 顺序和状态。
- 关键产物存在。
- artifactIndex。
- contextManifests。
- branches 和 branchOrder。
- 每个 branch 的关键产物。
- cross-app review artifacts。
- events 中关键事件顺序。
- agent state 数量和 nodeId。

### 13.4 前端测试

使用 Playwright：

- workflow 画布加载。
- 节点状态随 run 更新。
- 确认门弹出和恢复。
- 锁定模式不能删除节点。
- 修改 maxTurns/model override 保存成功。
- 历史 run 正常展示。
- fanout 节点可展开实际应用分支。
- branch 状态、产物、事件可 drilldown。
- 跨应用审核 finding 能定位到 affected branch。

## 14. 风险和应对

### 14.1 双状态源风险

风险：LangGraph checkpoint 和 `execution-state.json` 不一致。

应对：

- 明确 checkpoint 是 runtime source，execution-state 是 read model。
- 所有 graph state patch 后立即同步 read model。
- 增加一致性校验 API。
- 测试中断恢复场景。

### 14.2 interrupt 副作用重复

风险：恢复 confirmation 时，interrupt 前代码重复执行。

应对：

- confirmation 拆成独立 node。
- stage node 不调用 interrupt。
- event 写入加 idempotency key。
- 文件写入使用确定路径和覆盖策略。

### 14.3 回退语义复杂

风险：LangGraph conditional edge 表达不清现有回退逻辑。

应对：

- 把回退判断集中到 router node。
- router node 只读 state 和产物索引，不执行业务副作用。
- 回退前统一 reset downstream node state。

### 14.4 前端 workflow 过度开放

风险：用户删除关键节点导致产物链断裂。

应对：

- 默认锁定内置流程结构。
- 自定义 workflow 使用 validator。
- stage runner 使用白名单。
- 产物依赖缺失时禁止保存或禁止启动。

### 14.5 LangGraph API 变更

风险：LangGraph JS API 仍可能演进。

应对：

- 所有 LangGraph 调用集中在 `src/langgraph/runtime.ts` 和 `compiler.ts`。
- 不在业务节点中散落 LangGraph API。
- 锁定 package 版本。
- 增加最小 smoke test。

### 14.6 多应用并发资源争用

风险：多个应用同时修改、编译、测试会打满模型并发、CPU、磁盘或 Maven 本地仓库锁。

应对：

- branch、LLM、测试三层限流。
- 每个 branch 使用独立 workspace。
- Maven 本地仓库可使用共享只读缓存 + branch 私有写缓存。
- 大型任务默认 `continue_and_collect`，避免一个 branch 失败导致其他结果丢失。

### 14.7 跨应用回退范围过大

风险：跨应用审核发现问题后，如果回退主流程，会清理大量已完成 branch，成本高。

应对：

- cross-app review 输出 affectedBranches。
- 默认只回退受影响 branch。
- 只有需求拆解或实施方案错误才回退主 workflow。
- 每次跨应用回退记录 attempt，达到阈值后转人工确认。

## 15. 里程碑计划

### Phase 0: Spike 和技术验证，2-3 天

交付：

- 安装 `@langchain/langgraph` 和 `@langchain/core`。
- 用 3 个节点实现最小 MRD-to-Code graph。
- 验证 file checkpointer。
- 验证 interrupt approve/reject。
- 验证 stream events 能桥接到现有 WebSocket。

验收：

- 一个 run 能 start、interrupt、resume、complete。
- `execution-state.json` 能同步到 UI 可读结构。

### Phase 1: Workflow definition 和前端只读画布，3-5 天

交付：

- 新增 `src/workflows/types.ts`。
- `PIPELINE_NODES -> WorkflowDefinition` 转换。
- React Flow workflow view。
- 节点状态叠加。
- 默认 locked mode。

验收：

- 页面能展示当前固定流水线。
- run 过程中节点状态实时更新。
- 不影响 legacy runtime。

### Phase 2: LangGraph runtime wrapper，1 周

交付：

- `src/langgraph/state.ts`。
- `compiler.ts`。
- `runtime.ts`。
- `readModelSync.ts`。
- `eventBridge.ts`。
- stage node wrapper。
- confirmation node。

验收：

- mock provider 完整跑通。
- 两个确认门可 approve/reject。
- `events.ndjson` 和 WebSocket 与旧版事件基本兼容。

### Phase 3: 业务节点迁移，1-2 周

交付：

- 拆出所有 stage runner。
- java-impl/testcode/archive 接入 LangGraph。
- rollback router。
- retry 语义迁移。
- context manifest 和 artifact index 同步。

验收：

- full-flow 双 runtime 覆盖通过。
- full-flow demo 可在 LangGraph runtime 下跑通或 replay。

### Phase 4: 多应用动态 workflow，1-2 周

交付：

- fanout node。
- branch workflow definition。
- branch runner 和并发调度器。
- join node。
- branch state -> ExecutionState 同步。
- 前端 fanout drilldown。

验收：

- 一个需求拆出多个应用后可并发修改代码。
- 每个应用独立 CR、独立单测、独立回退。
- join 等待所有应用完成后进入跨应用节点。
- branch concurrency limit 生效。

### Phase 5: 跨应用审核和集成测试，1-2 周

交付：

- `branch-summary.json` 生成。
- `cross-app-code-review` runner。
- `cross-app-integration-review` runner。
- cross-app finding 到 branch 的映射。
- affected branch 定向回退。

验收：

- 跨应用审核能发现接口、DTO、配置、依赖和发布顺序问题。
- 跨应用审核 blocked 时只回退受影响 branch。
- 所有应用通过后 archive 生成跨应用交付包。

### Phase 6: 自定义 workflow 编辑，1-2 周

交付：

- workflow 保存 API。
- fork 内置 workflow。
- 节点配置面板。
- validator。
- workflow snapshot 绑定 run。

验收：

- 用户可 fork 默认流程并调整节点配置。
- 非法流程不能启动。
- 历史 run 可按原 workflow snapshot 展示。

### Phase 7: 稳定化和切默认，1 周

交付：

- 完整回归。
- 历史兼容。
- checkpoint 损坏恢复策略。
- 文档和运维说明。
- 默认 runtime 切到 LangGraph。

验收：

- CI 默认跑 LangGraph。
- legacy runtime 保留一个版本周期。
- 关键用户路径无回归。

## 16. 推荐实施顺序

推荐不要从“完整替换 PipelineEngine”开始。更稳的顺序：

1. 先落 workflow definition 和只读 React Flow 视图。
2. 再做 LangGraph 最小 runtime spike。
3. 然后拆出 node runner，减少 `PipelineEngine` 私有函数耦合。
4. 接入 confirmation interrupt。
5. 接入 router/rollback。
6. 接入 fanout/join，实现多应用 branch 并发。
7. 接入跨应用审核和定向回退。
8. 最后开放自定义 workflow 编辑。

这样每一步都能独立交付，并且随时可以回到 legacy runtime。

## 17. 最终完成标准

完整迁移完成需要满足：

- 默认 runtime 使用 LangGraph。
- 所有现有 pipeline 节点在 LangGraph 下行为一致。
- 确认门、拒绝反馈、重试、回退、恢复、取消都可用。
- 前端可展示 workflow 图和运行状态。
- 支持动态多应用 fanout、branch 并发、join 和跨应用审核。
- 支持每个应用独立代码修改、代码 CR、单测、集成测试和定向回退。
- `execution-state.json`、`events.ndjson`、`artifacts/` 结构兼容。
- full-flow 测试和 demo 通过。
- 历史 run 可读。
- 新 run 可绑定 workflow snapshot。
- LangGraph checkpoint 可用于进程重启恢复。

## 18. 参考资料

- LangGraph overview: https://docs.langchain.com/oss/javascript/langgraph/overview
- LangGraph persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
- LangGraph interrupts: https://docs.langchain.com/oss/javascript/langgraph/interrupts
- 当前架构文档: `docs/architecture.md`
- 当前流水线定义: `src/workflows/definitions/pipelineDefinition.ts`
- 当前执行引擎: `src/workflows/engine/pipelineEngine.ts`
- 当前状态持久化: `src/persistence/stateStore.ts`
- ai-ops workflow editor: `/Users/xu/IdeaProjects/ai-ops/src/app/workflows`
