# Feature 与集成环境部署产物绑定策略

## 1. 结论

集成环境阶段不做正式提交、合并 master 或 release commit 管理。

主线关联对象是：

```text
requirementId / featureId
  -> branchName
  -> pipelineRunId
  -> buildId / imageTag / imageDigest
  -> environmentId
  -> testRunId
```

`commitSha` 不作为主索引。它只作为 CI 或 Git 工具顺手记录的可选溯源字段。

核心目标不是管理代码发布版本，而是回答：

```text
这次需求在集成环境实际部署了哪些应用？
每个应用部署的是哪个构建产物？
测试报告对应的是哪组部署产物？
失败诊断应该看哪次 pipeline、哪个 image、哪个环境？
```

## 2. 为什么不以 commit 为主

当前阶段是集成环境验证，不是正式合入 master。

如果把 commit 当主线，会带来不必要的复杂度：

- 代码可能仍在本地 workspace 或 feature 分支迭代。
- 一个需求可能多次生成、修复、重跑，不需要每次都变成正式版本管理事件。
- 测试关心的是实际部署产物，而不是 Git 指针本身。
- 对于稳定版本应用，可能拿不到本次需求 commit，只能拿到环境中的 image tag 或 build version。

所以 MVP 不做 commit 管理。真正需要锁定的是“集成环境执行事实”。

## 3. RequirementDeploymentSet

建议引入 `RequirementDeploymentSet`：

```ts
type RequirementDeploymentSet = {
  id: string;
  requirementId: string;
  runId: string;
  featureId: string;
  apps: AppDeploymentRef[];
  status: 'draft' | 'ready-for-deploy' | 'deployed' | 'tested' | 'archived';
  createdAt: string;
  updatedAt: string;
};

type AppDeploymentRef = {
  appId: string;
  role: 'primary' | 'secondary' | 'test-only';
  repoRef?: string;
  branchName?: string;
  pipelineRunId?: string;
  buildId?: string;
  imageTag?: string;
  imageDigest?: string;
  environmentId?: string;
  sourceSnapshot?: string;
  versionSource: 'requirement-branch' | 'stable-version' | 'mock' | 'not-required';
  deployStatus: 'not-required' | 'pending' | 'deployed' | 'failed' | 'skipped';
  reason: string;
};
```

字段说明：

```text
featureId
  需求特性主线，通常等同或派生自 requirementId。

branchName
  本次需求的工作分支，用于代码生成、CI 和部署。

pipelineRunId
  本次构建或部署流水线执行。

buildId / imageTag / imageDigest
  集成环境实际部署产物。

environmentId
  部署到哪个测试或集成环境。

sourceSnapshot
  可选溯源字段，可以是 commitSha、workspace patch hash、tarball hash 或 generated code snapshot id。
```

## 4. 生命周期规则

```text
需求澄清 / 技术方案阶段
  只需要 requirementId、featureId、branchName、影响应用范围。

代码生成阶段
  记录 branchName、changedFiles、code-review-summary。
  不要求立刻 commit。

CI / 部署阶段
  记录 pipelineRunId、buildId、imageTag 或 imageDigest。
  如果底层 CI 能拿到 commitSha，可以写入 sourceSnapshot。

集成测试阶段
  TestRun 必须引用 RequirementDeploymentSet。
  测试报告以 deploymentSetId、environmentId、testRunId 为主索引。

失败诊断阶段
  ops 根据 deploymentSetId 找到 pipeline、image、环境和日志。

归档阶段
  归档所有 RequirementDeploymentSet，而不是只保留最后一次部署结果。
```

## 5. 与 EnvironmentPlan 的关系

`EnvironmentPlan` 决定“应该怎么部署”：

```text
primaryApps 部署需求分支版本
secondaryApps 默认复用稳定版本，必要时部署需求版本
testOnlyApps 不部署新版本
```

`RequirementDeploymentSet` 记录“实际部署了什么”：

```text
marketing-admin -> feature branch build image A
marketing-api   -> feature branch build image B
user-center     -> stable test image C
payment         -> testOnly stable image D
```

所以关系是：

```text
EnvironmentPlan
  -> harness/internal runtime 执行部署
  -> RequirementDeploymentSet
  -> ai-testing 执行集成测试
```

## 6. 与 TestRun / OpsDiagnosis 的关系

`TestRun` 必须引用：

```text
deploymentSetId
environmentId
testRunId
```

`OpsDiagnosis` 必须引用：

```text
deploymentSetId
pipelineRunId
environmentId
failedCaseIds
evidenceRefs
```

这样即使没有 commit，也能定位失败发生在哪组部署产物上。

## 7. MVP 产物

第一版只需要一个 JSON 文件：

```text
artifacts/<requirementId>/<runId>/deployment/deployment-set.json
```

示例：

```json
{
  "id": "deployset_req_20260710_001",
  "requirementId": "req_20260710_activity_hit_preview",
  "runId": "PDRbY_AI59",
  "featureId": "req_20260710_activity_hit_preview",
  "status": "deployed",
  "apps": [
    {
      "appId": "marketing-admin",
      "role": "primary",
      "branchName": "feature/req_20260710_activity_hit_preview/marketing-admin",
      "pipelineRunId": "pipe_001",
      "buildId": "build_001",
      "imageTag": "marketing-admin:req_20260710_activity_hit_preview-PDRbY_AI59",
      "environmentId": "env_it_001",
      "versionSource": "requirement-branch",
      "deployStatus": "deployed",
      "reason": "primary app changed by requirement"
    },
    {
      "appId": "user-center",
      "role": "test-only",
      "imageTag": "user-center:test-stable",
      "environmentId": "env_it_001",
      "versionSource": "stable-version",
      "deployStatus": "not-required",
      "reason": "only regression coverage required"
    }
  ],
  "createdAt": "2026-07-10T20:00:00+08:00",
  "updatedAt": "2026-07-10T20:30:00+08:00"
}
```

## 8. 当前决策

- 集成环境阶段不做正式 commit 管理。
- `featureId` 和 `branchName` 是需求代码工作主线。
- `buildId`、`imageTag`、`imageDigest` 是集成环境执行事实。
- `commitSha` 只作为可选 `sourceSnapshot`，不作为流程必填字段。
- 测试、诊断、归档都引用 `RequirementDeploymentSet`。
- 修复重跑必须追加新的 `RequirementDeploymentSet`，不能覆盖失败时的部署事实。
