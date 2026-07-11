# 测试环境隔离与部署范围策略

## 1. 结论

需求澄清阶段应该已经知道本次需求影响哪些应用。

但这里得到的是第一版 `FanoutDecision`，它回答的是：

```text
从业务需求看，哪些应用需要改、哪些应用被联动影响、哪些应用只需要测试？
```

它不是最终部署清单。最终测试环境部署范围需要在后续阶段逐步校准：

```text
需求澄清阶段
  -> 确认 FanoutDecision
  -> 得到 primaryApps / secondaryApps / testOnlyApps

技术方案阶段
  -> 校准每个应用的改造方式、接口变化、数据变化和依赖关系
  -> 得到 AppChangePlan

代码生成和 CI 阶段
  -> 根据实际 changedFiles、pipelineRunId、buildId、imageTag、imageDigest 确认可部署产物
  -> 得到 AppBuildRef

测试环境规划阶段
  -> 根据 fanout + 技术方案 + build ref 生成 EnvironmentPlan
```

MVP 默认不为每个需求拉起 100+ 应用的完整独立环境，而是采用：

```text
共享稳定测试环境
  + 本次改动应用按 requirement branch 部署
  + 受影响但不改代码应用复用稳定版本
  + 测试数据按 requirementId / tenant / namespace 隔离
```

## 2. 为什么不能直接把 Fanout 当部署清单

需求澄清阶段能确认影响范围，但还不能完全确认部署范围，原因是：

- 有些 `secondaryApps` 只是调用链受影响，不一定需要部署新版本。
- 有些 `testOnlyApps` 只需要跑回归，不应该触发部署。
- 技术方案可能把原本猜测要改的应用排除掉。
- 代码生成后实际 diff 可能比技术方案更小或更大。
- CI 失败的应用不能进入测试环境。
- 共享测试环境中的稳定版本可能已经满足联调要求。

所以需要把范围分成三类：

```text
Impact Scope
  需求影响范围，由 FanoutDecision 产生

Change Scope
  代码改造范围，由技术方案和代码 diff 产生

Deployment Scope
  测试环境部署范围，由 EnvironmentPlan 产生
```

## 3. 应用角色到部署策略

```text
primaryApps
  默认部署本需求分支版本。
  如果技术方案确认无需改代码，则降级为 secondary 或 testOnly。

secondaryApps
  默认复用共享测试环境稳定版本。
  只有接口契约、配置、联调依赖或版本强耦合要求时，才部署本需求相关版本。

testOnlyApps
  不部署新版本。
  只执行回归、兼容性、关键链路验证。

excludedApps
  不部署、不测试。
  只在归档中保留排除证据。
```

## 4. EnvironmentPlan 契约

```ts
type EnvironmentPlan = {
  requirementId: string;
  runId: string;
  mode: 'shared-overlay' | 'dedicated' | 'local-simulated';
  primaryApps: AppDeployPlan[];
  secondaryApps: AppDeployPlan[];
  testOnlyApps: AppTestOnlyPlan[];
  dataIsolation: DataIsolationPlan;
  environmentRefs: string[];
  risks: EnvironmentRisk[];
  requiresApproval: boolean;
};

type AppDeployPlan = {
  appId: string;
  role: 'primary' | 'secondary';
  repoRef: string;
  branchName?: string;
  sourceSnapshot?: string;
  buildId?: string;
  imageTag?: string;
  imageDigest?: string;
  pipelineRunId?: string;
  deployStrategy: 'requirement-branch' | 'stable-version' | 'rebuild-stable' | 'skip';
  reason: string;
};

type AppTestOnlyPlan = {
  appId: string;
  stableVersionRef?: string;
  testStrategy: 'regression' | 'contract' | 'smoke' | 'critical-path';
  reason: string;
};

type DataIsolationPlan = {
  strategy: 'requirementId' | 'tenant' | 'namespace' | 'database' | 'schema';
  isolationKey: string;
  cleanupRequired: boolean;
  sharedDataTouched: boolean;
};

type EnvironmentRisk = {
  type:
    | 'schema-change'
    | 'shared-data-mutation'
    | 'version-coupling'
    | 'long-running-test'
    | 'resource-pressure'
    | 'environment-unstable';
  level: 'low' | 'medium' | 'high';
  reason: string;
};
```

## 5. 默认模式：shared-overlay

MVP 默认使用 `shared-overlay`：

```text
共享稳定测试环境
  stable apps: 使用测试环境已有稳定版本
  changed apps: 部署本需求分支构建产物
  test data: 使用 requirementId / tenant / namespace 隔离
```

优点：

- 不需要每次拉起全量应用。
- 资源成本低。
- 启动快。
- 适合 100+ 应用领域。
- 能优先跑通需求闭环。

限制：

- 共享环境稳定性会影响测试结果。
- 共享数据污染风险需要控制。
- 跨应用版本强耦合时可能不够准确。

## 6. 何时升级为 dedicated 环境

出现以下情况时，不建议继续使用共享覆盖模式：

- 数据库 schema 大改。
- 中间件、网关、服务发现、鉴权配置大改。
- 多应用必须同时部署新版本才可运行。
- 会污染共享测试数据。
- 需要长时间压测、稳定性测试或容量验证。
- 测试需要独占外部依赖、账号、租户或队列。
- 共享测试环境近期不稳定，ops 判断会影响测试结论。

这类场景生成：

```text
EnvironmentPlan.mode = 'dedicated'
requiresApproval = true
```

## 7. 何时使用 local-simulated

`local-simulated` 只用于早期开发或快速验证：

- 单应用接口 mock。
- 本地容器模拟依赖。
- 不需要真实跨应用链路。
- 不需要真实数据状态。

它不能替代正式集成环境测试。

## 8. 数据隔离策略

优先级：

```text
namespace 隔离
  -> tenant 隔离
  -> requirementId 字段隔离
  -> schema 隔离
  -> database 隔离
```

MVP 推荐：

```text
isolationKey = requirementId
```

造数、测试执行和清理都必须带上：

```text
requirementId
runId
environmentId
testRunId
```

如果必须修改共享数据，则进入异常确认门：

```text
data-mutation-approval
```

测试数据库直写允许作为 DataPlan 的执行方式，但必须满足：

- 数据库属于测试环境。
- 数据有 `requirementId` / `runId` / tenant / namespace 隔离。
- 有 validation。
- 有 cleanup 或 rollback。
- 不覆盖共享公共数据。

## 9. 生命周期位置

```text
mrd-clarify
  -> fanout-recall
  -> fanout-rank
  -> requirement-clarification-gate
  -> prd-generate
  -> tech-design
  -> tech-review-gate
  -> code-generate
  -> unit-test
  -> ci-build
  -> pre-deploy-code-review-gate
  -> environment-plan
  -> harness-deploy
  -> integration-testing-generate
  -> data-setup
  -> testing-execute
```

注意：

- `environment-plan` 必须在测试环境部署前生成。
- `environment-plan` 的输入包含 `FanoutDecision`，但还要结合技术方案、代码 diff 和 CI 结果。
- `harness-deploy` 按 `EnvironmentPlan` 决定哪些应用部署需求分支，哪些应用复用稳定版本。

## 10. 与 ai-testing 的关系

`ai-testing` 读取 `EnvironmentPlan`：

- 决定测试覆盖哪些应用。
- 决定哪些服务地址来自本需求部署版本。
- 决定哪些应用只做回归或契约验证。
- 生成和执行 `DataPlan`。

`ai-testing` 不负责决定部署范围。

部署范围由 `ai-coding` 主控根据 fanout、技术方案、CI 和环境策略统一生成。

## 11. 与 ops 的关系

ops 在两个地方参与：

- 部署前：判断共享测试环境是否健康，是否适合执行本次测试。
- 失败后：采集环境、Docker、Harness、应用日志，判断失败是否由环境问题、版本问题、数据问题或代码问题导致。

如果 ops 判断共享环境不稳定，可以把环境计划从 `shared-overlay` 升级为：

```text
dedicated
```

或阻塞当前测试执行。

## 12. 当前决策

- 需求澄清阶段会确认第一版应用影响范围。
- 该范围是 `FanoutDecision`，不是最终部署清单。
- 测试环境部署范围由 `EnvironmentPlan` 统一表达。
- MVP 默认使用 `shared-overlay`。
- `primaryApps` 默认部署需求分支版本。
- `secondaryApps` 默认复用稳定版本，必要时才部署。
- `testOnlyApps` 不部署新版本，只做测试覆盖。
- 造数必须按 `requirementId`、`runId`、`environmentId`、`testRunId` 可追踪和可清理。
