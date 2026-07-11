# MRD 到全应用影响范围 Fanout 机制

## 1. 结论

MRD 到应用影响范围的 fanout 不能让模型逐个读取 100+ 应用知识库后判断。

MVP 采用：

```text
MRD -> 全应用影响范围 fanout
  = 向量召回
  + 结构化索引召回
  + GitNexus 图谱扩展
  + 候选应用精排
  + 需求澄清确认
```

其中：

```text
global 知识库负责召回
向量库负责语义召回
结构化索引负责精确过滤
GitNexus 图谱负责链路扩展和证据补强
单应用知识库负责候选精排
人工确认负责最终边界
```

## 2. 为什么需要 Fanout 机制

MRD 使用的是业务语言，不一定直接写出应用名、接口名或代码名。

例如：

```text
支持活动命中效果预览
```

它可能不会直接提到：

```text
marketing-admin
marketing
campaign-hit-preview API
RuleEvaluateService
```

如果只靠关键词匹配，容易漏应用；如果让模型逐个分析 100+ 应用，又会慢、贵且不稳定。

所以需要先召回，再精排。

## 3. Fanout 输入

```text
MRD
global/GLOBAL_CONTEXT.md
global/business-glossary.md
global/app-domain-map.json
global/capability-map.json
global/api-route-map.json
global/dependency-map.json
global/gitnexus-graph/*
knowledge-base/vector-index/*
历史需求归档
历史 fanout 决策
```

## 4. Fanout 输出

```ts
type FanoutDecision = {
  requirementId: string;
  runId: string;
  primaryApps: AppImpact[];
  secondaryApps: AppImpact[];
  testOnlyApps: AppImpact[];
  excludedApps: AppImpact[];
  unresolvedTerms: string[];
  confidence: number;
  requiresClarification: boolean;
  clarificationQuestions: string[];
};

type AppImpact = {
  appId: string;
  role: 'primary' | 'secondary' | 'test-only' | 'excluded';
  confidence: number;
  matchedTerms: string[];
  matchedCapabilities: string[];
  matchedApis: string[];
  matchedFlows: string[];
  gitnexusEvidence: string[];
  vectorEvidence: string[];
  reason: string;
};
```

应用角色：

```text
primaryApps
  需要改代码的主应用

secondaryApps
  可能需要联动改造或兼容验证的应用

testOnlyApps
  不改代码，但需要测试覆盖或回归验证的应用

excludedApps
  明确不受影响的应用

unresolvedTerms
  MRD 提到但 registry / knowledge 中找不到映射的术语、系统或能力
```

## 5. 阶段 1：候选召回

第一阶段目标是把 100+ 应用缩小到 10~20 个候选应用。

召回信号：

```text
向量召回
业务词命中
能力名命中
页面 / 菜单 / 入口命中
API route 命中
数据实体 / 状态机命中
上下游依赖命中
GitNexus 图谱命中
历史需求相似命中
```

输出：

```ts
type FanoutRecallResult = {
  requirementId: string;
  runId: string;
  queryTerms: string[];
  candidates: Array<{
    appId: string;
    score: number;
    matchedSignals: Array<
      | 'vector'
      | 'business-term'
      | 'capability'
      | 'api-route'
      | 'data-entity'
      | 'dependency'
      | 'gitnexus'
      | 'history'
    >;
    evidence: string[];
  }>;
};
```

默认限制：

```text
candidateApps <= 20
强命中应用可以追加，不受 top 20 限制
低于分数阈值直接排除
```

## 6. 向量知识库

需要向量知识库，但它只负责召回候选，不负责最终决策。

向量库职责：

```text
把 MRD 的业务语言映射到应用职责、能力描述、历史需求和接口摘要。
```

向量库不做：

```text
直接判断主改应用
直接决定代码改造范围
替代 GitNexus 图谱
替代人工确认
```

## 7. 向量库内容

MVP 不把源码、日志全文塞进向量库，只放高质量摘要块。

建议索引内容：

```text
global/GLOBAL_CONTEXT.md 分块
global/business-glossary.md 分块
每个 app 的 CONTEXT.md
每个 app 的 01_业务与领域知识层.md 摘要
每个 app 的 03_核心流程与逻辑层.md 摘要
capability-map 里的能力描述
api-index 里的接口摘要
历史归档需求摘要
历史 fanout 决策摘要
历史失败归因摘要
```

chunk metadata：

```json
{
  "chunkId": "chunk_marketing_hit_preview_001",
  "appId": "marketing",
  "sourceType": "app-context",
  "path": "apps/marketing/app-knowledge-base/CONTEXT.md",
  "requirementId": null,
  "capability": "campaign-hit-preview",
  "domain": "marketing",
  "updatedAt": "2026-07-10T20:00:00+08:00"
}
```

## 8. 向量库实现

MVP 可以先用轻量实现：

```text
knowledge-base/vector-index/
  chunks.json
  embeddings.json
  metadata.json
```

能力：

```text
build-vector-index
query-vector-index
aggregate-app-candidates
```

规模变大后再替换：

```text
Qdrant
pgvector
Milvus
```

降级策略：

```text
没有向量库
  -> 用关键词 + capability-map + api-route-map + dependency-map + GitNexus 图谱召回
```

## 9. 应用候选打分

应用分数不是单一向量分数，而是多信号融合。

示例：

```text
appScore =
  vectorScore
  + keywordScore
  + capabilityScore
  + apiScore
  + graphScore
  + historyScore
```

建议权重初版：

```text
vectorScore      0.25
keywordScore     0.20
capabilityScore  0.25
apiScore         0.15
graphScore       0.10
historyScore     0.05
```

权重后续可以根据归档结果调整。

## 10. 阶段 2：候选精排

只对候选应用读取单应用知识库。

读取：

```text
apps/<appId>/app-knowledge-base/CONTEXT.md
apps/<appId>/app-knowledge-base/01_业务与领域知识层.md
apps/<appId>/app-knowledge-base/03_核心流程与逻辑层.md
apps/<appId>/app-knowledge-base/api-index.md
apps/<appId>/app-knowledge-base/gitnexus/graph-summary.md
```

判断：

```text
是否需要改代码
是否只是上下游联动
是否只需要测试覆盖
是否明确排除
是否需要继续澄清
```

## 11. 阶段 3：GitNexus 图谱扩展

对 primary / secondary 应用，沿 dependency-map 和 GitNexus 图谱扩一跳。

默认：

```text
dependency expansion depth = 1
```

规则：

```text
primary app 直接上下游
  -> secondary 或 testOnly

只被间接影响
  -> testOnly

MRD 明确涉及链路级改造
  -> 可扩展到 depth = 2，但必须进入需求澄清确认
```

不要默认无限扩散，否则 100+ 应用场景下影响面会失控。

## 12. 阈值策略

默认限制：

```text
candidateApps <= 20
primaryApps <= 5
secondaryApps <= 10
testOnlyApps <= 20
dependency expansion depth = 1
```

如果超过限制：

```text
requiresClarification = true
clarificationQuestions 增加“影响范围过大，请确认是否为跨域改造 / 平台级改造”
```

低置信度：

```text
confidence < 0.7
  -> 进入需求澄清确认
```

## 13. 需求澄清确认

Fanout 决策接入固定人工确认门：

```text
mrd-clarify
  -> fanout-recall
  -> fanout-rank
  -> requirement-clarification-gate
```

人工确认内容：

```text
主改应用对不对？
联动应用对不对？
仅测试应用对不对？
有没有漏掉应用？
有没有不该纳入的应用？
是否存在 unresolved terms？
```

需求澄清确认后的 `FanoutDecision` 是后续技术方案、代码生成、测试环境规划和集成测试的前置输入。

但它只代表需求影响范围，不直接等同于最终部署清单：

```text
FanoutDecision
  -> 回答哪些应用受需求影响

EnvironmentPlan
  -> 回答哪些应用需要在测试环境部署需求分支版本
```

测试环境部署范围还需要结合技术方案、代码 diff、CI 结果和共享环境健康状态生成。详细策略见 `docs/teach/test-environment-deployment-scope-strategy.md`。

## 14. 产物

输出：

```text
artifacts/fanout/fanout-recall.json
artifacts/fanout/fanout-decision.json
artifacts/fanout/fanout-evidence.md
```

注册为 `ArtifactRef`：

```text
fanout-recall
fanout-decision
fanout-evidence
```

## 15. 归档反哺

归档时，如果人工修改了 fanout 结果，需要反哺知识库：

```text
应用职责修正
  -> app-domain-map.json

能力映射修正
  -> capability-map.json

API / 页面入口修正
  -> api-route-map.json

跨应用依赖修正
  -> dependency-map.json
  -> global/gitnexus-graph/*

历史 fanout 决策
  -> vector-index
```

## 16. MVP 验收标准

1. 100+ 应用时不逐个读取单应用知识库。
2. 能通过向量库召回候选应用。
3. 向量库不可用时能通过结构化索引降级召回。
4. 候选应用默认不超过 20 个。
5. 只对候选应用读取单应用知识库精排。
6. 能输出 primary / secondary / testOnly / excluded。
7. 能沿 GitNexus 图谱做一跳影响扩展。
8. 低置信度或影响范围过大时进入需求澄清确认。
9. Fanout 修正能在归档阶段反哺全应用知识库。
