# 上下文压缩设计

相关文档：[README](../README.md) ｜ [产品演示流程](product-demo-flow.md) ｜ [架构设计](architecture.md) ｜ [节点设计](node-design.md) ｜ [节点流转设计](node-transition.md)

## 两类上下文

系统里有两类上下文，不能混在一起：

1. Agent 内部对话上下文。
2. 节点之间传递的业务上下文。

Agent 内部对话上下文用于让当前模型继续 ReAct loop。节点之间传递的业务上下文用于让下游节点知道上游正式产物和关键决策。

## Agent 内部压缩

实现位置：

```text
src/agent/contextCompression.ts
src/agent/AgentEngine.ts
```

触发条件：

- Agent 的 token 预算接近模型上下文窗口。
- 默认阈值来自 `TokenBudget`，当前按 80% 左右触发。

压缩目标：

- 保留当前任务目标。
- 保留读过的重要文件和结论。
- 保留修改过的文件。
- 保留编译和测试结果。
- 保留当前计划状态。
- 保留确认门和阻塞信息。
- 保留最近几轮原始消息。

压缩过程：

```text
old messages + recent messages
  -> summarize old messages
  -> summary message + recent messages
  -> continue agent loop
```

关键事件：

- `compact_start`
- `compact_end`
- Agent event: `compact`

如果模型压缩调用失败，会使用机械 fallback summary，至少保留读写文件、编译状态和测试状态。

## 跨节点瘦上下文

实现位置：

```text
src/workflows/engine/pipelineEngine.ts
```

每个节点完成后会生成：

```text
checkpoints/<nodeId>-context-manifest.json
```

同时写入 `execution-state.json` 的 `contextManifests`。

manifest 内容包括：

- `nodeId`
- `outputArtifacts`
- `importantDecisions`
- `riskNotes`
- `confirmation`
- `nextNodeInputs`

示例：

```json
{
  "nodeId": "mrd-render",
  "outputArtifacts": [
    {
      "path": "artifacts/mrd-clarified.md",
      "summary": "活动软删除接口、状态校验、软删除落库、幂等控制、审计日志、基础测试覆盖",
      "size": 5213
    }
  ],
  "importantDecisions": [
    "本期实现归属 project",
    "不新增前端页面",
    "不做物理删除"
  ],
  "nextNodeInputs": [
    "artifacts/mrd-clarified.md",
    "artifacts/mrd-clarify-questions.md"
  ]
}
```

## 为什么不把 transcript 当下游输入

Agent transcript 包含：

- 模型思考性文本。
- 工具调用中间结果。
- 失败重试过程。
- 页面展示用事件。
- 可能被截断的工具输出。

这些内容适合审计和回放，不适合作为业务事实输入。

下游节点应读取：

- 正式产物路径。
- 正式产物摘要。
- 上一节点确认结果。
- context manifest。

这样可以避免：

- 下游被模型中间态误导。
- 上下文无限膨胀。
- 工具输出噪声污染业务判断。
- 回退重跑后读取到旧轮次无关内容。

## 节点输入策略

不同节点读取不同正式产物：

- `需求拆解`：读取 `input/*` 和 `project-manifest.json`。
- `实施方案`：读取 `mrd-clarified.md`、`mrd-clarify-questions.md` 和项目代码结构。
- `SPEC生成`：读取 `prd.md`、`implementation-plan-manifest.json`、`tech-design.md`。
- `Java Impl`：读取 `openspec-task.md`、PRD、技术方案和项目代码。
- `Test Code Generate`：读取 `openspec-test-task.md`、变更清单和项目测试目录。
- `Archive`：读取状态、事件、Agent state 和全部正式产物。

## 超大文件处理

需求文件或项目文件过大时，原则是：

- 不把超大文件完整内联到主 prompt。
- 优先通过 `read_file` 分段读取。
- 保留文件名、大小、摘要和截断说明。
- 让模型按需调用 `glob`、`grep`、`read_file` 定位相关内容。

这样可以保持 prompt 可控，同时保留可追溯性。

## 压缩与确认门

确认门结果会进入节点状态和 context manifest：

```json
{
  "confirmation": {
    "approved": true,
    "feedback": "用户补充说明"
  }
}
```

如果用户反馈后当前节点重跑，反馈会进入下一轮节点 prompt，用于修订产物。

## 归档中的上下文指标

归档节点会读取：

- `execution-state.json`
- `logs/events.ndjson`
- `agents/*.json`

并统计：

- 节点耗时。
- 工具调用次数。
- 工具累计耗时。
- 工具失败次数。
- token 输入/输出/合计。
- 重试和回退次数。

这些指标进入 `artifacts/<project>/archive-report.md`，用于复盘一次需求从 MRD 到代码的完整成本。
