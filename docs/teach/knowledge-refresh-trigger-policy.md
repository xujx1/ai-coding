# 知识库刷新触发策略

## 1. 结论

知识库更新主路径：

```text
初始化建库
  + 归档时增量更新
```

需求执行期间默认只读知识库，不默认刷新。

过期时只提醒用户，按需懒加载刷新。

一句话策略：

```text
初始化负责建库，需求执行只读，过期提醒懒刷新，归档默认增量更新本次受影响应用知识库。
```

## 2. 为什么不在每次需求前刷新

100+ 应用场景下，如果每次需求都刷新全量知识库，会带来：

- 启动慢。
- 成本高。
- GitNexus 扫描耗时。
- 大量无关应用被重复处理。
- 需求执行链路不稳定。

知识库更新应该有明确来源、明确影响范围和可追踪 trace。需求归档天然具备这些条件。

## 3. 知识库更新类型

### 3.1 初始化建库

触发场景：

```text
平台首次接入
knowledge-base 仓库不存在
global/GLOBAL_CONTEXT.md 不存在
registry/apps.json 不存在
某个应用首次接入
某个应用 app-knowledge-base 不存在
```

执行：

```text
init-all-app-knowledge
  -> 生成每个 app-knowledge-base
  -> 生成 global 聚合层
  -> 生成 GitNexus global graph
  -> 构建 vector-index
  -> 写 init-report
```

初始化是冷启动必须做的。

### 3.2 需求执行中只读

在这些阶段默认只读知识库：

```text
mrd-clarify
fanout-decision
prd-generate
tech-design
code-generate
test-strategy
test-case-generate
failure-diagnosis
```

默认不触发全量刷新，也不触发单应用刷新。

如果发现知识库过期，只提示用户，不阻塞主流程：

```text
该应用知识库已过期，当前将继续使用旧知识库。
可选择立即刷新，或在本次需求归档时自动增量更新。
```

### 3.3 懒加载刷新

懒加载刷新只刷新当前需要的应用，不刷新全部应用。

触发条件：

```text
用户点击刷新
fanout 置信度低且原因是知识不足
技术方案阶段发现关键文件 / 接口缺失
应用知识库 missing
知识库 partial 且当前节点强依赖缺失内容
```

执行：

```text
refresh-app-knowledge(appId)
  -> 扫描该 app
  -> 更新 app-knowledge-base
  -> 更新 app gitnexus graph
  -> 更新 global 聚合层中该 app 相关片段
  -> 更新 vector-index 中该 app chunks
```

### 3.4 归档增量更新

每次需求完成归档时，默认更新本次受影响应用的知识库。

触发：

```text
archive
```

范围：

```text
primaryApps
secondaryApps
testOnlyApps 中有知识变化的应用
```

不是全量更新 100+ 应用。

执行：

```text
archive-feedback
  -> 基于代码 diff、技术方案、测试报告、诊断报告提取 knowledge delta
  -> 更新对应 app-knowledge-base
  -> 更新 global 层相关索引
  -> 更新 GitNexus 图谱
  -> 更新 vector-index
  -> 更新 KB_FRESHNESS
```

## 4. Freshness 状态

```ts
type KnowledgeFreshness = {
  appId: string;
  sourceCommitSha: string;
  knowledgeCommitSha: string;
  lastGeneratedAt: string;
  lastArchiveFeedbackAt?: string;
  staleAfterDays: number;
  status: 'fresh' | 'stale' | 'missing' | 'partial' | 'failed';
};
```

状态含义：

```text
fresh
  -> 正常读取

stale
  -> 提醒用户，可继续读取旧知识库

missing
  -> 阻塞，需要初始化或懒加载生成

partial
  -> 可继续，但 fanout / 技术方案置信度降权

failed
  -> 进入人工确认或降级策略
```

## 5. 归档更新策略

归档默认不是全量重建，而是增量更新。

产物：

```text
artifacts/knowledge-delta/
  <appId>.patch.md
  dependency-map.patch.json
  gitnexus-graph.patch.json
  vector-index.patch.json
```

更新规则：

```text
append / update / replace / graph-update
  -> 生成 delta / patch 作为审计产物
  -> 默认自动应用到知识库

低置信度 / 大范围变化 / 跨应用依赖变更
  -> 仍默认自动应用
  -> 在 archive report 中标记 risk
  -> 保留 rollbackRef / patch artifact
```

知识库更新不进入人工确认。目标是需求归档时默认完成知识反哺，避免归档闭环卡在人审。

## 6. GitNexus 图谱同步

归档更新知识库时，必须同步处理 GitNexus 图谱。

触发：

```text
代码 diff 涉及接口、调用链、数据库访问、MQ、外部依赖
技术方案记录了新的跨应用调用
测试或诊断发现真实调用关系和现有图谱不一致
```

策略：

```text
低风险局部变化
  -> 基于 changed files / GitNexus 增量扫描更新 app graph

跨应用调用变化
  -> 更新 global graph 和 dependency-map

不确定或大范围变化
  -> 生成 gitnexus-graph.patch.json
  -> 默认自动应用
  -> 在 archive report 中标记 risk
```

## 7. Vector Index 同步

归档更新知识库时，需要同步更新向量索引。

只更新受影响 chunk：

```text
新增或修改的 CONTEXT.md 段落
新增或修改的业务术语
新增或修改的能力描述
新增或修改的 API 摘要
本次需求归档摘要
本次 fanout 决策摘要
本次失败归因摘要
```

不重新 embedding 全量知识库，除非手工触发全量重建。

## 8. 需求执行期间的提示

当知识库过期时，UI 或事件中提示：

```text
应用 marketing 的知识库已过期 12 天。
当前流程将继续使用旧知识库，fanout 置信度会降权。
你可以选择：
1. 继续
2. 立即刷新该应用知识库
3. 本次归档时自动增量更新
```

默认选择：

```text
继续 + 归档时增量更新
```

## 9. 并发与失败隔离

全应用初始化和批量刷新需要限流：

```text
maxConcurrentAppRefresh = 3
```

规则：

- 单个应用失败不阻塞其他应用。
- 失败写入 init-report / refresh-report。
- 缺失关键知识库的应用在 fanout 中降权或标记 missing。
- 已命中的 primary app 如果知识库 missing，必须懒加载或人工确认。

## 10. Workflow 接入

新增节点：

```text
knowledge-check-freshness
knowledge-lazy-refresh
archive-knowledge-delta
archive-update-app-kb
archive-update-global-kb
archive-update-gitnexus-graph
archive-update-vector-index
```

需求主流程：

```text
mrd-clarify
  -> knowledge-check-freshness
  -> fanout-decision
  -> requirement-clarification-gate
  ...
  -> archive
  -> archive-knowledge-delta
  -> archive-update-app-kb
  -> archive-update-global-kb
  -> archive-update-gitnexus-graph
  -> archive-update-vector-index
```

## 11. 验收标准

1. 知识库缺失时可以初始化。
2. 需求执行期间默认只读知识库。
3. 知识库 stale 时提示用户，不默认阻塞。
4. 用户可以对命中应用执行懒加载刷新。
5. 归档时默认对本次受影响应用生成 knowledge delta。
6. 归档时同步更新 GitNexus 图谱，graph patch 作为审计产物保留。
7. 归档时同步更新 vector-index 受影响 chunks。
8. 不会因为某个应用刷新失败阻塞其他应用。
9. 每次知识库更新都有 trace 和 freshness 记录。
10. 知识库更新默认不进入人工确认。
