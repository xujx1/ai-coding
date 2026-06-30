# 节点流转设计

相关文档：[README](../README.md) ｜ [产品演示流程](product-demo-flow.md) ｜ [架构设计](architecture.md) ｜ [节点设计](node-design.md) ｜ [动态工作流读模型](session-dynamic-workflow.md)

## 状态来源

流水线主状态保存在：

```text
runs/<runId>/execution-state.json
```

关键字段：

- `status`：run 总状态。
- `nodes[]`：兼容顶层节点状态。
- `workflowInstance`：当前 session 的动态工作流读模型。
- `workflowInstance.branches[]`：应用分支状态。
- `workflowInstance.branches[].tracks[]`：track 状态。
- `workflowInstance.joins[]`：join 等待和完成状态。
- `artifactIndex`：全局节点产物索引。

Agent 状态保存在：

```text
runs/<runId>/agents/<agentRunId>.json
```

事件保存在：

```text
runs/<runId>/logs/events.ndjson
```

页面恢复时，主要读取 execution state、agent state 和 event log。

## 基础状态

节点、分支和 track 常见状态：

- `pending`：尚未执行。
- `running`：正在执行。
- `waiting_confirmation`：等待用户确认。
- `completed`：执行完成。
- `failed`：执行失败。
- `waiting_fix`：自动修复次数耗尽，等待人工介入。
- `suspended`：流程暂停。
- `interrupted`：用户中断。
- `cancelled`：已取消。
- `skipped`：已跳过。

Run 状态：

- `idle`
- `running`
- `waiting_confirmation`
- `completed`
- `failed`
- `interrupted`
- `cancelled`

## 正常流转

```text
pending
  -> running
  -> completed
  -> next node pending/running
```

节点成功后会做几件事：

1. 写入节点输出。
2. 收集产物列表。
3. 更新全局 `artifactIndex`。
4. 如为分支节点，同步 `branch.artifactIndex` 和 `branch.nodes[]`。
5. 更新 track 状态。
6. 生成 context manifest。
7. 写入 `pipeline_node_end` 或分支 transition 事件。
8. 如有确认门，进入 `waiting_confirmation`。

## 需求确认门

需求归属确认使用确认门：

```text
node completed
  -> waiting_confirmation
  -> user approve
  -> node completed
  -> continue
```

用户拒绝但提供反馈：

```text
waiting_confirmation
  -> user reject with feedback
  -> node pending
  -> rerun same node with feedback
```

确认门相关事件：

- `confirmation_waiting`
- `confirmation_resolved`

确认后的内容会写入正式需求产物，后续节点只读正式产物和 context manifest。

## Fanout 流转

需求拆解完成后生成 `fanout-decision.json`：

```text
mrd-render completed
  -> derive fanout decision
  -> apply decision to workflowInstance
  -> create branches
  -> project-fanout completed
```

Fanout 状态规则：

- 有 included projects 且无 unresolved projects：`completed`。
- 有 included projects 但存在 unresolved projects：`waiting_confirmation`。
- 无 included projects：`failed`。

Fanout 会创建：

- `workflowInstance.branches[]`
- `workflowInstance.executionPlan`
- `workflowInstance.plannerValidation`
- `workflowInstance.joins[app-join]`

## 分支和 Track 流转

分支状态由分支节点聚合得到：

```text
pending
  -> running
  -> completed
```

如果某个分支节点失败：

```text
running
  -> failed / waiting_fix / interrupted / cancelled
```

Track 状态由 track 内节点聚合得到：

- 任一节点 `failed` / `waiting_fix` / `cancelled`：track 进入同类状态。
- 任一节点 `running` / `waiting_confirmation`：track 为 `running`。
- 所有节点 `completed` 或 `skipped`：track 为 `completed`。
- 否则为 `pending`。

分支状态不会覆盖其他分支。一个应用失败时，已完成应用的产物和状态保持不变。

## Join 流转

分支创建后，`app-join` 记录所有等待分支：

```text
waitingForBranchIds = all branch ids
completedBranchIds = []
failedBranchIds = []
cancelledBranchIds = []
status = waiting
```

每次分支状态变化后同步 join：

```text
branch completed
  -> move branchId to completedBranchIds
  -> recompute waitingForBranchIds
```

Join 结束规则：

- 仍有等待分支：`waiting`。
- 无等待分支且存在失败/中断分支：`failed`。
- 无等待分支且无失败分支：`completed`。

Join 完成后进入 `cross-app-test`。

## 跨应用测试流转

```text
app-join completed
  -> cross-app-test running
  -> read branch summaries
  -> write cross-app artifacts
  -> cross-app-test completed
```

输出：

- `artifacts/<project>/branch-summary.json`
- `artifacts/cross-app/test-results.json`
- `artifacts/cross-app/delivery-metadata.json`

如果跨应用检查发现阻断问题，可以将 run 标记为 `failed` 或进入等待人工修复；当前真实 case 中结果为 ready。

## 分支重跑

分支控制作用于 session runtime state，不修改全局模板。

```text
POST /api/sessions/:runId/branches/:branchId/rerun
```

允许重跑的分支状态：

- `failed`
- `waiting_fix`
- `cancelled`

重跑逻辑：

1. 从指定 `fromNodeId` 找到分支节点序列位置。
2. 重置该节点及其后续节点为 `pending`。
3. 清理这些节点对应的 `branch.artifactIndex`。
4. 重置相关 track 状态。
5. 重新计算 join 状态。
6. 保留旧事件日志，方便复盘。

## 分支取消

```text
POST /api/sessions/:runId/branches/:branchId/cancel
```

允许取消的分支状态：

- `pending`
- `running`
- `waiting_confirmation`
- `suspended`

取消后：

- 分支状态变为 `cancelled`。
- 当前分支节点变为 `cancelled`。
- Join 重新计算 completed、failed、cancelled 和 waiting 列表。

Whole-run cancel 会同时取消活跃分支。

## Review 回退

实现节点会生成 `review-findings.json`。

如果 review 存在 BLOCK：

```text
implementation completed
  -> detect review BLOCK
  -> node_rollback_requested
  -> same branch implementation pending
  -> rerun implementation
```

回退次数受 `agent.autoFixRounds` 控制。超过上限后，该分支进入 `waiting_fix`。

## Test 回退

后端测试、前端测试和 E2E 验证都会生成失败分类。

失败分类决定回退目标：

- 实现问题：回退到对应实现节点。
- 测试代码问题：回退到测试节点。
- 前后端契约问题：回退到 contract/backend/frontend 相关节点。
- 环境问题：记录 fallback 或进入 `waiting_fix`。

典型流转：

```text
test node completed
  -> detect failure
  -> classify failure
  -> rollback branch node or wait for fix
```

## E2E Fallback

E2E runner 会尽量启动应用并执行 Playwright。若浏览器二进制、启动命令或 readiness 不可用：

```text
e2e-verify running
  -> bounded fallback
  -> write unsupported/fallback reason
  -> completed or waiting_fix
```

产物中必须记录 fallback reason，避免把环境能力不足误判成业务缺陷。

## 中断

用户点击中断流程后：

```text
running / waiting_confirmation / suspended
  -> interrupted
```

中断会：

- 标记当前 run 为 `interrupted`。
- 标记当前顶层节点为 `interrupted`。
- 标记活跃分支和当前分支节点为 `interrupted`。
- 写入状态和事件，供页面刷新后恢复。

中断不是删除 run，用户仍然可以查看已有产物和轨迹。

## 产物索引刷新

节点写入产物时会触发：

- `artifact_written` 事件。
- 全局 `artifactIndex` 更新。
- 分支 `artifactIndex` 更新。
- 当前节点/应用/track 的右侧产物刷新。

工具写入产物也会记录 `artifact_written`，因此页面可以在节点执行中看到文件出现，而不是等节点结束。

## 事件保留策略

重试、回退和分支重跑不会清空旧事件。这样页面可以展示：

- 第一轮做了什么。
- 第几次重试开始。
- 哪个 review/test/E2E 结果触发回退。
- 哪个分支独立失败或恢复。
- 修复后新增了哪些工具调用。

这对真实代码生成很关键，因为用户需要知道模型是否真的读写、编译和测试了文件。
