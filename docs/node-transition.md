# 节点流转设计

相关文档：[README](../README.md) ｜ [产品演示流程](product-demo-flow.md) ｜ [架构设计](architecture.md) ｜ [节点设计](node-design.md) ｜ [上下文压缩设计](context-compression.md)

## 状态来源

流水线主状态保存在：

```text
runs/<runId>/execution-state.json
```

Agent 状态保存在：

```text
runs/<runId>/agents/<agentRunId>.json
```

事件保存在：

```text
runs/<runId>/logs/events.ndjson
```

页面恢复时，主要读取 execution state、agent state 和 event log。

## 基础节点状态

节点常见状态：

- `pending`：尚未执行。
- `running`：正在执行。
- `waiting_confirmation`：等待用户确认。
- `completed`：执行完成。
- `failed`：执行失败。
- `waiting_fix`：自动修复次数耗尽，等待人工介入。
- `suspended`：流程暂停。
- `interrupted`：用户中断。
- `skipped`：跳过。

流水线状态会跟随当前节点变化：

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
3. 更新 `artifactIndex`。
4. 生成 context manifest。
5. 写入 `pipeline_node_end`。
6. 如有确认门，进入 `waiting_confirmation`。

## 确认门

有确认门的节点：

- `需求拆解`
- `实施方案`

确认门状态：

```text
node completed
  -> waiting_confirmation
  -> user approve
  -> node completed
  -> next node
```

用户拒绝但提供反馈：

```text
waiting_confirmation
  -> user reject with feedback
  -> node pending
  -> rerun same node with feedback
```

用户拒绝且无反馈：

```text
waiting_confirmation
  -> user reject without feedback
  -> pipeline cancelled
```

确认门相关事件：

- `confirmation_waiting`
- `confirmation_resolved`

## 从某节点重跑

页面支持从某个节点往后重跑。

重跑逻辑：

1. 找到目标节点 index。
2. 目标节点及其之后节点重置为 `pending`。
3. 清理这些节点对应的 `artifactIndex`。
4. 清理这些节点对应的 context manifest。
5. 保留旧事件日志，方便用户看到历史执行轨迹。
6. 从目标节点重新开始执行。

这种设计避免回滚时丢失审计信息。

## 普通失败自动重试

节点抛出异常后会自动重试，默认上限 3 次。

```text
running
  -> failed
  -> node_retry_scheduled
  -> pending
  -> running
```

超过上限：

```text
running
  -> failed
  -> pipeline failed
```

页面通过 `node_retry_scheduled` 展示第几次重试。

## Review 回退

`Java Impl` 节点内部会生成 `review-findings.json`。

如果 review 存在 BLOCK：

```text
Java Impl completed
  -> detect review BLOCK
  -> node_rollback_requested
  -> Java Impl pending
  -> rerun Java Impl
```

回退次数受 `agent.autoFixRounds` 控制。

如果超过自动修复次数：

```text
Java Impl
  -> waiting_fix
```

## Test 回退

`Test Code Generate` 节点会执行 Maven 测试，并生成 `failure-classification.json`。

失败分类决定回退目标：

- 实现问题：回退到 `Java Impl`。
- 测试代码问题：回退到 `Test Code Generate`。
- Runner 资产问题：进入 `waiting_fix`。
- 成功：继续 `Archive`。

典型流转：

```text
Test Code Generate completed
  -> detect test failure
  -> classify failure
  -> rollback to Java Impl or Test Code Generate
```

## 中断

用户点击中断流程后：

```text
running / waiting_confirmation / suspended
  -> interrupted
```

中断会：

- 标记当前 pipeline 为 `interrupted`。
- 标记当前节点为 `interrupted`。
- 标记相关项目为 `interrupted`。
- 写入状态，供页面刷新后恢复。

中断不是删除 run，用户仍然可以查看已有产物和轨迹。

## 产物索引刷新

节点写入产物时会触发：

- `artifact_written` 事件。
- `artifactIndex` 更新。
- 页面右侧产物刷新。

工具写入产物也会记录 `artifact_written`，因此页面可以在节点执行中看到文件出现，而不是等节点结束。

## 事件保留策略

重试和回退不会清空旧事件。这样页面可以展示：

- 第一轮做了什么。
- 第几次重试开始。
- 哪个 review/test 结果触发回退。
- 修复后新增了哪些工具调用。

这对真实代码生成很关键，因为用户需要知道模型是否真的读写了文件。
