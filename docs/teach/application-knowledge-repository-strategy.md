# 应用知识库与知识仓库管理方案

## 1. 结论

应用知识库由 `ai-coding` 主控生成、读取、更新和归档反哺。

Harness / internal harness-runtime 只负责管理仓库，不负责生成知识库内容。

一句话边界：

```text
Harness 管仓库，ai-coding 管知识。
```

更具体：

```text
Harness / harness-runtime
  -> 管理应用代码仓库
  -> 管理知识库仓库
  -> 提供 branch / commit / PR / search / tags / access 等仓库能力

ai-coding
  -> 扫描代码
  -> 调用 GitNexus
  -> 生成应用知识库
  -> 读取应用知识库
  -> 归档后提取 knowledge delta
  -> 更新知识库内容
  -> 维护 freshness / trace / version
```

## 2. 背景

`dev-workflow/knowledge-base` 已有单应用知识库生成模式：

```text
app-knowledge-base/
  CONTEXT.md
  api-index.md
  KB_INDEX.md
  component-index.md
  01_业务与领域知识层.md
  02_架构与设计层.md
  03_核心流程与逻辑层.md
  db-schema.md
  KB_FRESHNESS.md
```

这个结构适合单应用，但当前 `ai-coding` 的目标是全应用仓库生命周期，需要额外增加全应用 global 聚合层和 registry 层，统一管理：

- 应用列表。
- 代码仓库。
- 知识库路径。
- 应用依赖关系。
- 业务术语。
- 应用职责边界。
- 能力地图。
- API 路由地图。
- 知识库 freshness。

## 3. 知识库分层

应用知识库至少分两层使用。

### 3.1 第一层：需求澄清层

面向需求澄清和应用归属判断。

内容：

```text
业务术语
核心实体
关键流程
业务规则
应用职责边界
上下游关系摘要
```

主要消费者：

```text
mrd-clarify
requirement-ownership
project-fanout
prd-generate
```

对应文件：

```text
CONTEXT.md
01_业务与领域知识层.md
03_核心流程与逻辑层.md
registry/business-glossary.md
registry/dependency-map.json
```

### 3.2 第二层：技术与测试生成层

面向技术方案、测试用例、造数和影响面分析。

内容：

```text
代码结构
接口索引
调用链
数据模型
依赖系统
核心流程
工程规范
测试方式
```

主要消费者：

```text
tech-design
code-generate
test-strategy
test-case-generate
data-plan
failure-diagnosis
```

对应文件：

```text
api-index.md
component-index.md
02_架构与设计层.md
03_核心流程与逻辑层.md
db-schema.md
GitNexus scan result
```

## 4. 知识库仓库形态

MVP 采用一个统一 knowledge monorepo。

原因：

- 当前目标是全应用生命周期，不是单应用隔离。
- 跨应用依赖、业务术语和应用 registry 需要统一管理。
- `ai-coding` 作为主控时，统一仓库更容易读取和更新。

推荐仓库：

```text
spaces/knowledge/knowledge-base
```

仓库结构：

```text
knowledge-base/
  global/
    GLOBAL_CONTEXT.md
    business-glossary.md
    app-domain-map.json
    dependency-map.json
    capability-map.json
    api-route-map.json
    gitnexus-graph/
      graph-summary.md
      nodes.json
      edges.json
      capability-to-code-map.json
    init-report.md

  registry/
    apps.json
    repositories.json
    dependency-map.json
    business-glossary.md

  apps/
    marketing/
      app-knowledge-base/
        CONTEXT.md
        KB_INDEX.md
        api-index.md
        component-index.md
        01_业务与领域知识层.md
        02_架构与设计层.md
        03_核心流程与逻辑层.md
        db-schema.md
        KB_FRESHNESS.md
        gitnexus/
          graph-summary.md
          nodes.json
          edges.json

    marketing-admin/
      app-knowledge-base/
        ...
```

后续如需更细权限，再演进为每应用一个知识库仓库。

## 5. 全应用知识库初始化

全应用知识库初始化不是简单地批量生成多个单应用知识库，而是生成一份可以服务 MRD 阶段的全应用知识库视图。

完整定义：

```text
全应用知识库初始化
  = 单应用 app-knowledge-base 生成
  + global 聚合知识库生成
```

目标是让 MRD 进来时，系统能够判断：

```text
这个需求涉及哪些业务域？
命中了哪些应用？
这些应用之间有没有调用关系？
哪个是主改应用？
哪个是联动应用？
哪些应用只是测试影响？
```

### 5.1 global 聚合层

推荐结构：

```text
knowledge-base/
  global/
    GLOBAL_CONTEXT.md
    business-glossary.md
    app-domain-map.json
    dependency-map.json
    capability-map.json
    api-route-map.json
    gitnexus-graph/
      graph-summary.md
      nodes.json
      edges.json
      capability-to-code-map.json
    init-report.md
```

`GLOBAL_CONTEXT.md` 是 MRD 阶段的 L0 必读入口。

内容：

```text
业务域列表
应用列表
应用职责边界
关键业务术语
核心业务流程
跨应用链路
高频需求影响面
应用间依赖关系
```

### 5.2 初始化流程

```text
init-all-app-knowledge
  -> load app registry / repo list
  -> checkout or locate all code repos
  -> generate / refresh each app-knowledge-base
  -> run GitNexus scan when available
  -> aggregate business glossary
  -> aggregate app domain map
  -> aggregate capability map
  -> aggregate API route map
  -> build dependency-map
  -> generate GLOBAL_CONTEXT.md
  -> write init-report
  -> commit knowledge repo
```

### 5.3 MRD 阶段读取

MRD 进入系统时，优先读取 global 层：

```text
global/GLOBAL_CONTEXT.md
global/business-glossary.md
global/app-domain-map.json
global/dependency-map.json
global/capability-map.json
global/api-route-map.json
```

输出候选应用影响范围：

```json
{
  "primaryApps": ["marketing-admin", "marketing"],
  "secondaryApps": ["coupon-service"],
  "testOnlyApps": ["reporting-service"],
  "excludedApps": ["order-service"],
  "evidence": [
    {
      "appId": "marketing-admin",
      "reason": "MRD 提到运营后台活动命中预览入口",
      "matchedTerms": ["活动配置", "命中预览", "运营后台"]
    },
    {
      "appId": "marketing",
      "reason": "命中预览需要调用营销活动规则计算能力",
      "matchedCapabilities": ["campaign-hit-preview", "rule-evaluation"]
    }
  ]
}
```

然后再进入应用 fanout，针对命中的应用读取单应用知识库：

```text
apps/marketing-admin/app-knowledge-base/CONTEXT.md
apps/marketing-admin/app-knowledge-base/api-index.md
apps/marketing/app-knowledge-base/CONTEXT.md
apps/marketing/app-knowledge-base/api-index.md
```

### 5.4 GitNexus 的作用

GitNexus 用于增强：

```text
跨应用调用链
接口调用关系
上下游依赖
影响面分析
能力到代码链路映射
```

GitNexus 可用时，global 层应吸收 GitNexus 扫描结果。

GitNexus 扫描结果也是知识库的一部分，必须随应用知识库一起管理。推荐落盘：

```text
knowledge-base/
  global/
    gitnexus-graph/
      graph-summary.md
      nodes.json
      edges.json
      capability-to-code-map.json

  apps/<appId>/app-knowledge-base/
    gitnexus/
      graph-summary.md
      nodes.json
      edges.json
```

职责划分：

```text
apps/<appId>/app-knowledge-base/gitnexus/
  -> 单应用内部调用链、类/方法/接口/表/消息节点和边

global/gitnexus-graph/
  -> 跨应用调用链、应用间接口依赖、能力到应用/代码映射
```

GitNexus 不可用时，MVP 可从以下文件降级聚合：

```text
每个 app 的 CONTEXT.md
每个 app 的 api-index.md
每个 app 的 01_业务与领域知识层.md
每个 app 的 03_核心流程与逻辑层.md
已有 dependency-map.json
```

### 5.5 初始化模式

默认模式：

```text
mode=lite
```

规则：

- 已有知识库且 freshness 未过期时默认跳过。
- 新应用可以使用 `mode=nano` 冷启动。
- 单个应用初始化失败不阻塞全局初始化。
- 最终必须生成 `global/init-report.md` 和 `global/init-report.json`。

初始化结果结构：

```ts
type AppKnowledgeInitResult = {
  appId: string;
  codeRepo: string;
  knowledgePath: string;
  status: 'created' | 'refreshed' | 'skipped-fresh' | 'failed';
  mode: 'nano' | 'lite' | 'full';
  sourceCommitSha?: string;
  error?: string;
  generatedFiles: string[];
  startedAt: string;
  finishedAt: string;
};
```

## 6. 全应用知识库与单应用知识库的关系

```text
global/
  -> 服务 MRD 需求澄清、业务术语识别、应用影响范围判断、fanout

apps/<appId>/app-knowledge-base/
  -> 服务技术方案、代码生成、测试生成、失败诊断
```

MRD 阶段先读 global，确认命中应用后再读对应 app knowledge。

## 7. 应用与仓库注册

`apps.json` 管应用身份、代码仓库和知识库路径。

示例：

```json
{
  "apps": [
    {
      "appId": "marketing",
      "name": "营销域服务",
      "domains": ["marketing", "campaign"],
      "tags": ["backend", "java"],
      "owners": ["marketing-team"],
      "codeRepo": {
        "provider": "harness",
        "repoPath": "spaces/marketing/marketing",
        "defaultBranch": "main"
      },
      "knowledgeRepo": {
        "provider": "harness",
        "repoPath": "spaces/knowledge/knowledge-base",
        "defaultBranch": "main",
        "kbPath": "apps/marketing/app-knowledge-base"
      },
      "freshness": {
        "lastUpdatedAt": "2026-07-10T20:00:00+08:00",
        "status": "fresh"
      }
    }
  ]
}
```

`repositories.json` 管仓库维度信息：

```json
{
  "repositories": [
    {
      "repoId": "repo_marketing",
      "provider": "harness",
      "repoPath": "spaces/marketing/marketing",
      "type": "code",
      "appIds": ["marketing"]
    },
    {
      "repoId": "repo_knowledge_base",
      "provider": "harness",
      "repoPath": "spaces/knowledge/knowledge-base",
      "type": "knowledge",
      "appIds": ["marketing", "marketing-admin"]
    }
  ]
}
```

## 8. 跨应用依赖管理

`dependency-map.json` 管跨应用调用关系。

示例：

```json
{
  "edges": [
    {
      "fromAppId": "marketing-admin",
      "toAppId": "marketing",
      "type": "http-api",
      "evidence": ["apps/marketing-admin/app-knowledge-base/api-index.md"],
      "summary": "运营后台调用营销活动查询和命中预览接口",
      "updatedAt": "2026-07-10T20:00:00+08:00"
    }
  ]
}
```

消费者：

- 需求澄清。
- 应用 fanout。
- 技术方案影响面分析。
- 跨应用测试。
- 失败诊断。

## 9. Harness 的角色

Harness / harness-runtime 负责：

```text
code repo hosting
knowledge repo hosting
branch / commit / PR
repo search
repo tags
access control
```

Harness / harness-runtime 不负责：

```text
知识库生成
知识库内容更新
知识正确性判断
GitNexus 扫描决策
归档后 knowledge delta 提取
```

`harness-main` 已有 Space、Repository、Repo Tags、Import、Keyword Search 等能力，可作为仓库注册和搜索底座的参考，但没有现成的应用知识库生成和归档反哺能力。

仓库管理详细边界见 `docs/teach/harness-repository-management-policy.md`。

## 10. ai-coding 的角色

`ai-coding` 负责：

```text
应用 registry 管理
代码仓库扫描
GitNexus 调用链扫描
GitNexus 知识图谱生成和更新
app-knowledge-base 生成
app-knowledge-base 读取
知识库 freshness 管理
归档后 knowledge delta 提取
知识库更新 commit
LangSmith / local trace
```

建议模块：

```text
src/knowledge/
  registry/
    appRegistry.ts
    repositoryRegistry.ts
    knowledgeRegistry.ts
    dependencyMap.ts

  app-kb/
    generateAppKnowledge.ts
    refreshAppKnowledge.ts
    readAppContext.ts
    gitnexusScan.ts

  gitnexus-graph/
    buildAppGraph.ts
    buildGlobalGraph.ts
    updateGraphFromDelta.ts
    readGraphContext.ts

  archive-feedback/
    extractKnowledgeDelta.ts
    updateAppKnowledge.ts
    updateGlobalRegistry.ts
    updateGitNexusGraph.ts
```

## 11. 初始化知识库流程

```text
register app
  -> clone / checkout code repo
  -> scan code
  -> GitNexus scan
  -> write app gitnexus graph
  -> generate app-knowledge-base
  -> aggregate global gitnexus graph
  -> update knowledge-base repo
  -> update registry/apps.json
  -> update dependency-map.json
  -> commit knowledge repo
```

## 12. 需求执行时的知识读取

按阶段读取不同知识，不把整个知识库塞给模型。

```text
需求澄清
  -> registry/business-glossary.md
  -> registry/dependency-map.json
  -> apps/<app>/app-knowledge-base/CONTEXT.md
  -> apps/<app>/app-knowledge-base/01_业务与领域知识层.md

技术方案
  -> CONTEXT.md
  -> 02_架构与设计层.md
  -> 03_核心流程与逻辑层.md
  -> api-index.md
  -> db-schema.md
  -> GitNexus scan result
  -> apps/<app>/app-knowledge-base/gitnexus/graph-summary.md

测试生成
  -> PRD
  -> tech-design
  -> api-index.md
  -> db-schema.md
  -> dependency-map.json
  -> global/gitnexus-graph/capability-to-code-map.json

失败诊断
  -> deploy / logs evidence
  -> dependency-map.json
  -> global/gitnexus-graph/graph-summary.md
  -> 03_核心流程与逻辑层.md
  -> history / archived diagnosis
```

## 13. 归档反哺知识库

需求归档后由 `ai-coding` 提取 knowledge delta。

知识库刷新触发策略遵循：初始化建库、需求执行只读、过期提醒懒刷新、归档默认增量更新本次受影响应用知识库。详细策略见 `docs/teach/knowledge-refresh-trigger-policy.md`。

流程：

```text
archive
  -> extract-knowledge-delta
  -> generate kb patch
  -> update app-knowledge-base
  -> update global registry
  -> update dependency-map
  -> update gitnexus graph
  -> update KB_FRESHNESS.md
  -> commit knowledge repo
```

反哺内容：

```text
新增业务术语 -> 01_业务与领域知识层.md / business-glossary.md
新增接口 -> api-index.md
新增核心流程 -> 03_核心流程与逻辑层.md
新增数据字段 / 状态 -> db-schema.md 或 01/02 层
新增测试坑点 -> test-guide 或 03 层补充
新增部署/诊断经验 -> ops-guide 或 history
跨应用调用变化 -> dependency-map.json
代码链路变化 -> apps/<app>/app-knowledge-base/gitnexus/*
跨应用图谱变化 -> global/gitnexus-graph/*
```

### 13.1 GitNexus 图谱更新

归档阶段不只更新 Markdown 知识库，也要处理 GitNexus 知识图谱。

触发条件：

```text
代码变更涉及接口、调用链、核心流程、数据库访问、MQ、外部依赖
技术方案记录了新的跨应用调用
测试或诊断发现真实调用关系和现有图谱不一致
```

更新方式：

```text
低风险局部变化
  -> 基于 changed files / GitNexus 增量扫描更新 app graph

跨应用调用变化
  -> 更新 global graph 和 dependency-map

不确定或大范围变化
  -> 生成 gitnexus-graph.patch.json
  -> 默认自动应用
  -> 在归档报告中标记 risk
```

图谱 delta 示例：

```ts
type GitNexusGraphDelta = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  scope: 'app' | 'global';
  changedNodes: Array<{ id: string; action: 'add' | 'update' | 'remove'; summary: string }>;
  changedEdges: Array<{ from: string; to: string; action: 'add' | 'update' | 'remove'; summary: string }>;
  evidenceArtifactIds: string[];
  confidence: number;
  autoApplied: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  rollbackRef?: string;
};
```

## 14. Knowledge Delta

不要让归档流程无审计地覆盖知识库。

先生成 delta / patch 作为审计和回滚依据：

```text
artifacts/knowledge-delta/
  marketing.patch.md
  marketing-admin.patch.md
  dependency-map.patch.json
  gitnexus-graph.patch.json
```

Delta 结构：

```ts
type KnowledgeDelta = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  targetPath: string;
  changeType: 'append' | 'update' | 'replace' | 'graph-update';
  summary: string;
  evidenceArtifactIds: string[];
  confidence: number;
  autoApplied: boolean;
  riskLevel: 'low' | 'medium' | 'high';
  rollbackRef?: string;
};
```

应用策略：

```text
所有 knowledge delta
  -> 生成 patch artifact
  -> 默认自动应用

低置信度 / 跨应用依赖变更 / 大范围 graph-update
  -> 默认自动应用
  -> archive report 标记 risk
  -> 保留 rollbackRef
```

## 15. Freshness

每个应用知识库必须维护：

```text
KB_FRESHNESS.md
```

全局 registry 也维护 freshness：

```json
{
  "appId": "marketing",
  "knowledgePath": "apps/marketing/app-knowledge-base",
  "lastUpdatedAt": "2026-07-10T20:00:00+08:00",
  "sourceCommitSha": "abc123",
  "lastRequirementId": "req_20260710_activity_hit_preview",
  "gitnexusGraphUpdatedAt": "2026-07-10T20:00:00+08:00",
  "status": "fresh"
}
```

## 16. MVP 验收标准

1. 有统一 knowledge monorepo 结构。
2. `registry/apps.json` 能映射 app、code repo、knowledge repo。
3. 每个应用有独立 `app-knowledge-base`。
4. 能从代码生成单应用知识库。
5. 能按阶段读取对应知识文件。
6. 能维护 `dependency-map.json`。
7. 能生成或降级维护 `global/GLOBAL_CONTEXT.md`。
8. GitNexus 可用时能生成单应用和全局知识图谱。
9. 归档后能生成 `knowledge-delta`。
10. 归档后能生成并自动应用 `gitnexus-graph.patch.json`。
11. 所有 delta 默认自动应用。
12. 高风险 delta 在归档报告中标记 risk，并保留 rollbackRef。
13. Harness 只管理代码仓库和知识库仓库，不参与知识生成。
