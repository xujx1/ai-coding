# Harness 仓库管理边界方案

## 1. 结论

Harness / harness-runtime 在 MVP 中不只是 CI/CD runtime，还需要承担代码仓库和知识库仓库的管理底座。

边界一句话：

```text
Harness 管仓库和流水线，ai-coding 管生命周期和知识生成。
```

更具体：

```text
Harness / harness-runtime
  -> 管理应用代码仓库
  -> 管理知识库仓库
  -> 管理 branch / tag / repo metadata / search / access
  -> 提供 checkout / update / push / PR 或等价仓库操作
  -> 提供 pipeline / build / deploy / logs / environment

ai-coding
  -> 维护 lifecycle state
  -> 生成 MRD / PRD / 技术方案
  -> 生成代码和单元测试
  -> 生成、读取、更新知识库内容
  -> 调用 GitNexus
  -> 编排测试、诊断、修复、归档
```

Harness 不负责知识库内容生成、知识正确性判断、GitNexus 扫描决策和归档 knowledge delta 提取。

## 2. 为什么需要仓库管理

全生命周期需要持续访问两类仓库：

```text
应用代码仓库
  -> fanout 后定位应用
  -> 技术方案读取代码上下文
  -> 代码生成拉分支
  -> CI / 部署使用需求分支或 workspace snapshot
  -> 归档记录代码变更

知识库仓库
  -> 全应用知识库初始化
  -> MRD fanout 读取 global registry
  -> 技术方案读取 app knowledge
  -> 测试生成读取 api-index / db-schema / GitNexus graph
  -> 归档后更新 knowledge delta
```

如果 Harness 不管理仓库，`ai-coding` 就会被迫自己做一套 repo registry、branch、search、access、checkout、push 管理，边界会变重。

## 3. MVP 仓库能力

MVP 只做最小仓库管理能力：

```text
RepositoryRegistry
  注册应用代码仓库和知识库仓库

RepositoryRef
  统一引用 provider、repoId、repoPath、defaultBranch、localPath

BranchRef
  创建或复用需求分支

RepoSearch
  按 appId、repoId、tag、path、keyword 查找仓库

RepoTags
  标记 app、domain、knowledge、runtime、owner 等元数据

RepoCheckout
  拉取或定位本地代码 / 知识库

RepoUpdate
  写入知识库更新或需求代码变更
```

暂不做完整平台能力：

- 完整代码托管 UI。
- 完整 SCM 权限模型。
- 完整 PR review 平台。
- 完整 artifact registry。
- 完整 Gitspaces。
- 完整企业级审计与组织管理。

## 4. RepositoryRef 契约

```ts
type RepositoryRef = {
  repoId: string;
  provider: 'harness' | 'git' | 'local';
  repoType: 'code' | 'knowledge';
  repoPath: string;
  defaultBranch: string;
  localPath?: string;
  appId?: string;
  domain?: string;
  tags: string[];
  accessRef?: string;
};
```

应用注册示例：

```json
{
  "repoId": "repo_marketing",
  "provider": "harness",
  "repoType": "code",
  "repoPath": "spaces/marketing/marketing",
  "defaultBranch": "main",
  "appId": "marketing",
  "domain": "marketing",
  "tags": ["app", "marketing", "backend"]
}
```

知识库仓库示例：

```json
{
  "repoId": "repo_knowledge_base",
  "provider": "harness",
  "repoType": "knowledge",
  "repoPath": "spaces/knowledge/knowledge-base",
  "defaultBranch": "main",
  "tags": ["knowledge", "global-registry"]
}
```

## 5. RepositoryManager 接口

```ts
type RepositoryManager = {
  listRepositories(filter?: RepositoryFilter): Promise<RepositoryRef[]>;
  getRepository(repoId: string): Promise<RepositoryRef>;
  findRepositoryByApp(appId: string): Promise<RepositoryRef | undefined>;
  findKnowledgeRepository(): Promise<RepositoryRef>;
  searchRepositories(query: RepositorySearchQuery): Promise<RepositoryRef[]>;
  ensureBranch(input: EnsureBranchInput): Promise<BranchRef>;
  checkout(input: CheckoutInput): Promise<CheckoutRef>;
  updateFiles(input: UpdateFilesInput): Promise<RepoUpdateRef>;
};
```

接口只表达上层需要的能力，不绑定 Harness 原始内部模型。

## 6. 与 ai-coding 的关系

`ai-coding` 调用 RepositoryManager：

```text
fanout
  -> 读取 registry / knowledge repo

tech design
  -> checkout code repo

code generation
  -> ensure feature branch or workspace snapshot

knowledge init / refresh
  -> checkout knowledge repo
  -> write knowledge files
  -> update knowledge repo

archive
  -> update knowledge repo
  -> record repo update refs
```

但所有 lifecycle 状态仍由 `ai-coding` 写入，不由 Harness 写入。

## 7. 与知识库的关系

Harness 管知识库仓库，不管知识内容：

```text
Harness:
  仓库在哪里？
  默认分支是什么？
  如何 checkout？
  如何写入更新？
  如何搜索仓库？
  谁有访问权限？

ai-coding:
  生成哪些知识文件？
  GitNexus 图谱怎么更新？
  freshness 如何判断？
  archive delta 如何合并？
```

## 8. Provider 决策

`harness-main` 基于 Gitness，具备 Git/SCM 能力，包括：

```text
repository / space
branch
pull request
git clone URL / SSH clone URL
git-upload-pack / git-receive-pack
import / linked repository
keyword search
repo tags / metadata
```

因此第一版 RepositoryManager 的目标 provider 是：

```text
harness provider
```

但工程落地允许提供一个兼容接口的 fallback：

```text
local / git provider
```

fallback 用于本地开发、测试或 Harness 服务暂不可用时继续推进端到端链路。fallback 不能改变上层契约，所有结果仍必须转换成 `RepositoryRef`、`BranchRef`、`CheckoutRef`、`RepoUpdateRef`。

## 9. 当前决策

- Harness / harness-runtime 需要管理应用代码仓库。
- Harness / harness-runtime 需要管理知识库仓库。
- MVP 做最小 RepositoryManager，不做完整 SCM 平台。
- 第一版 RepositoryManager 以 Harness provider 为目标。
- local / git provider 只作为 fallback。
- 知识生成和更新仍由 `ai-coding` 主控。
- 仓库操作结果只作为结构化结果返回，由 `ai-coding` 写入状态机。
