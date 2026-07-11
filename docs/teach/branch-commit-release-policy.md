# 分支、部署产物与测试环境发布策略

## 1. 结论

一个需求影响多个应用时，按应用拆分代码分支。

核心策略：

```text
一个需求 + 一个应用 = 一个工作分支
AI 先在本地 workspace 修改代码
代码审核通过后才允许触发 CI 和部署测试环境
集成环境阶段以 feature / branch / build artifact 作为主线
不做正式提交、合并 master 或 release commit 管理
```

`commitSha` 不是 MVP 主索引，只作为 CI 或 Git 工具可选记录的来源快照。部署、测试、诊断和归档以 `RequirementDeploymentSet` 为准。详细策略见 `docs/teach/feature-deployment-artifact-policy.md`。

## 2. 分支命名

每个需求每个应用一个独立工作分支：

```text
feature/<requirementId>/<appId>
```

示例：

```text
feature/req_20260710_activity_hit_preview/marketing
feature/req_20260710_activity_hit_preview/marketing-admin
```

多应用需求不要把所有应用混在同一个分支里。

原因：

- 应用边界清晰。
- CI/CD 独立。
- 测试和诊断可以按 appId 追踪。
- 某个应用失败不阻塞其他应用代码分支。
- 归档时能准确汇总每个应用的分支、部署产物、测试和诊断。

## 3. 代码生成阶段

代码生成先在本地 workspace 修改，不立刻 commit，不立刻 push。

流程：

```text
checkout branch
  -> AI 修改 workspace
  -> 生成 changed-files.json
  -> 单元测试
  -> 自动修复
  -> 生成 code-review-summary
  -> 测试环境发布前代码审核
```

在 `pre-deploy-code-review` 通过之前，代码只存在于本地 workspace。

## 4. 测试环境发布前代码审核

固定人工确认门：

```text
pre-deploy-code-review
```

审核内容：

```text
需求 ID
应用
分支
base branch
变更文件列表
核心 diff 摘要
新增或修改接口
数据库 / 配置变更
单元测试结果
CI 预检查结果
风险点
Agent 自评
是否建议发布到测试环境
```

审核通过后才允许：

```text
trigger pipeline
deploy test env
```

## 5. Commit 处理

MVP 不把 commit 作为流程必填动作。

允许两种实现：

```text
workspace 模式
  代码保留在本地 workspace 或临时工作区
  CI/runtime 从 workspace snapshot、patch 或临时包构建

feature branch 模式
  代码推到 feature branch
  CI/runtime 从 feature branch 构建
```

无论哪种实现，集成环境事实都写入：

```text
RequirementDeploymentSet
```

如果底层工具自然产生 commit，则可以记录到：

```text
sourceSnapshot
```

但不要求 commit message 作为主契约。

## 6. Push 与 CI 触发

首次 CI 和测试环境部署包含在 `pre-deploy-code-review` 审核中。

审核通过后：

```text
trigger pipeline
  -> watch pipeline
  -> record buildId / imageTag / imageDigest
  -> resolve test environment
  -> write RequirementDeploymentSet
```

失败后自动修复：

```text
如果 autoFixAllowed = true 且风险低
  -> rerun pipeline
  -> append next RequirementDeploymentSet

如果高风险 / UNKNOWN / 低置信度
  -> 异常人工确认门
```

## 7. BranchGroup

多应用需求需要一个 branch group。

```ts
type BranchGroup = {
  requirementId: string;
  runId: string;
  branches: AppBranchRef[];
};

type AppBranchRef = {
  appId: string;
  repoRef: string;
  branchName: string;
  baseBranch: string;
  localPath?: string;
  sourceSnapshot?: string;
  buildId?: string;
  imageTag?: string;
  imageDigest?: string;
  status:
    | 'created'
    | 'modified'
    | 'tested'
    | 'review-waiting'
    | 'review-approved'
    | 'ci-running'
    | 'ready'
    | 'failed';
};
```

## 8. LifecycleState 集成

`LifecycleState` 中每个 `AppDeliveryState` 记录：

```ts
type AppDeliveryState = {
  appId: string;
  appName: string;
  repoRef?: string;
  projectRoot?: string;
  branchName?: string;
  baseBranch?: string;
  sourceSnapshot?: string;
  buildId?: string;
  imageTag?: string;
  imageDigest?: string;
  status: AppDeliveryStatus;
  changedFiles: string[];
  artifactIds: string[];
  ciRunIds: string[];
  environmentIds: string[];
  testRunIds: string[];
  diagnosisIds: string[];
  traceIds: string[];
};
```

## 9. 产物

代码阶段至少产出：

```text
artifacts/<appId>/changed-files.json
artifacts/<appId>/code-preview-manifest.json
artifacts/<appId>/code-review-summary.md
artifacts/<appId>/deployment-set.json
```

注册为：

```text
code-change
code-review
deployment-set
```

## 10. 自动修复边界

自动修复只允许在失败归因明确且低风险时执行。

允许：

```text
CODE_BUG 且小范围改动
TEST_SCRIPT_BUG 且只改本次生成测试脚本
DATA_SETUP_FAILED 且只影响本次隔离测试数据
CONFIG_ERROR 且只改本次需求私有配置
```

不允许直接自动修改业务代码：

```text
ENVIRONMENT_NOT_READY
DEPENDENCY_UNAVAILABLE
CI_INFRA_FAILURE
DOCKER_RESOURCE_FAILURE
UNKNOWN
```

## 11. 归档

归档时汇总：

```text
appId
repoRef
branchName
baseBranch
sourceSnapshot
buildId
imageTag
imageDigest
pipelineRunId
testRunId
diagnosisId
code-review decision
```

用于：

- 需求归档报告。
- 知识库反哺。
- 后续相似需求检索。
- LangSmith / local trace 追踪。

## 12. MVP 验收标准

1. 每个命中应用都有独立分支。
2. 代码生成后先停留在本地 workspace。
3. `pre-deploy-code-review` 通过后才触发 CI 和部署测试环境。
4. Pipeline run 能关联到 `requirementId`、`runId`、`featureId` 和 `branchName`。
5. 部署完成后能写入 `RequirementDeploymentSet`。
6. 自动修复能重跑 pipeline 并更新部署产物引用。
7. 高风险或 UNKNOWN 修复进入人工确认门。
8. 归档能汇总所有应用分支、部署产物、CI、测试和诊断信息。
