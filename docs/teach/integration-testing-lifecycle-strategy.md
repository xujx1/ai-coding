# 集成环境测试与造数策略

## 1. 结论

`ai-testing` 在 `ai-coding` 中不负责单元测试。

单元测试属于 `ai-coding` 的代码生成和 TDD 闭环：

```text
技术方案
  -> 代码生成
  -> 单元测试
  -> 本地自动修复
  -> CI 构建
```

`ai-testing` 的定位是集成环境测试能力，负责在需求涉及的所有应用部署到测试环境后，完成跨应用测试策略、测试用例、造数、执行、报告和失败证据收集。

## 2. 能力边界

### 2.1 ai-coding 负责

- 根据技术方案生成代码。
- 生成或补齐单元测试。
- 执行本地单元测试和基础验证。
- 根据单测失败做低风险自动修复。
- 在测试环境发布前触发代码审核。

### 2.2 harness-runtime 负责

- 构建应用。
- 执行 CI。
- 部署测试环境。
- 返回 `pipelineRunId`、`environmentId`、服务地址和运行日志引用。

### 2.3 ai-testing 负责

- 根据 PRD、技术方案、代码变更和 fanout 结果生成集成测试策略。
- 覆盖本次需求改动的所有应用，以及只需要回归验证的影响应用。
- 生成跨应用测试用例。
- 生成造数计划。
- 生成测试数据准备、校验和清理脚本。
- 在测试环境执行 API / E2E / 回归测试。
- 输出测试报告、证据和失败上下文。

### 2.4 ai-ops 负责

- 对测试失败、部署失败、CI 失败做归因。
- 采集 Harness、Docker、应用日志、APM、trace 和 metrics。
- 输出结构化失败分类和修复建议。

`ai-testing` 只发现和描述失败，不直接判断根因是否是代码 bug、环境问题、数据问题或测试脚本问题。根因判断交给 ops 能力。

## 3. 测试范围

集成测试范围来自 MRD fanout 的确认结果：

```text
primaryApps
  本次需求主要改造应用，必须部署和重点验证

secondaryApps
  被调用、依赖或受业务流程影响的应用，按影响路径验证

testOnlyApps
  不改代码，但需要回归、联调或兼容性验证的应用
```

对于一个领域内 100 多个应用的情况，`ai-testing` 不应全量无差别跑测试，而是基于 fanout 结果和知识库证据生成分层测试计划：

```text
P0: 主链路跨应用集成测试
P1: 改动应用接口和状态流测试
P2: 二级依赖应用兼容性测试
P3: testOnlyApps 回归抽样或关键用例验证
```

## 4. 执行流程

```text
fanout confirmed
  -> tech-design approved
  -> code generated
  -> unit-test passed
  -> ci-build passed
  -> pre-deploy-code-review approved
  -> environment-plan
  -> harness deploy test environment
  -> integration-test-strategy
  -> data-plan
  -> test-case-generate
  -> test-script-generate
  -> wait environment healthy
  -> data-setup
  -> integration-test-execute
  -> data-validation
  -> data-cleanup
  -> test-report
  -> if failed: ops failure classification
```

核心原则：

- 单元测试不过，不进入集成测试。
- 测试环境发布前代码审核不过，不进入集成测试。
- 测试环境不健康，不执行集成测试，转入 ops 环境诊断。
- 集成测试失败后先归因，再决定修代码、修测试、修数据、修配置、重跑或人工确认。

## 5. 输入产物

`ai-testing` 的输入必须带 `requirementId` 和 `runId`：

```text
MRD
PRD
技术方案
fanoutDecision
primaryApps / secondaryApps / testOnlyApps
changedFiles
pipelineRunId
deploymentSetId
buildId / imageTag / imageDigest
environmentId
EnvironmentRef
EnvironmentPlan
api-index
db-schema
dependency-map
GitNexus graph
业务术语和关键流程知识
```

这些输入来自 `ai-coding` 生命周期状态和知识库，不由 `ai-testing` 自己重新发现全局上下文。

`EnvironmentPlan` 负责说明哪些应用部署本需求分支版本、哪些应用复用测试环境稳定版本、哪些应用只做回归验证。详细策略见 `docs/teach/test-environment-deployment-scope-strategy.md`。

## 6. 输出产物

建议产物目录：

```text
artifacts/<requirementId>/<runId>/testing/
  integration-test-strategy.md
  cross-app-test-plan.md
  integration-test-cases.json
  data-plan.json
  data-setup-scripts/
  test-scripts/
  test-report.md
  test-evidence/
  cleanup-report.md
```

所有输出都注册到 `LifecycleState.artifacts`，测试执行引用写入 `LifecycleState.testRuns`。

## 7. DataPlan 契约

造数必须结构化，不建议只输出自然语言说明。

```ts
type DataPlan = {
  requirementId: string;
  runId: string;
  environmentId: string;
  apps: string[];
  setupSteps: DataStep[];
  validationSteps: DataStep[];
  cleanupSteps: DataStep[];
  riskLevel: 'low' | 'medium' | 'high';
  requiresApproval: boolean;
};

type DataStep = {
  id: string;
  appId: string;
  target: 'api' | 'db' | 'queue' | 'cache' | 'file' | 'mock';
  action: string;
  inputRef?: string;
  outputRef?: string;
  rollbackRef?: string;
  idempotent: boolean;
};
```

造数计划必须回答：

- 需要哪些基础数据？
- 通过 API、DB、消息、mock 还是配置完成？
- 每一步是否幂等？
- 如何校验造数成功？
- 如何清理或回滚？
- 是否会影响共享测试环境中的其他人？

## 8. 造数安全策略

默认允许自动执行：

- 独立测试环境。
- 本需求独占 namespace / tenant / account。
- 幂等 setup。
- 有 cleanup。
- 只写入本次需求隔离数据。
- 直写测试数据库，但必须限定在测试环境和本次需求隔离数据范围内。

测试数据库直写规则：

- 只允许连接测试库。
- 禁止连接生产或准生产库。
- 写入数据必须带 `requirementId`、`runId`、`environmentId` 或独立 tenant / namespace。
- 必须有 validation step。
- 必须有 cleanup 或 rollback step。
- SQL / migration / seed 脚本必须作为 `data-setup-scripts` 产物登记。
- cleanup 失败必须写入测试报告和归档风险。

需要异常人工确认：

- 修改共享测试库中的公共配置。
- 覆盖存量测试数据。
- 删除数据。
- 修改账号、权限、支付、库存、额度等高风险数据。
- 跨多个应用直接写共享库。
- cleanup 不可靠。

异常确认门类型：

```text
data-mutation-approval
```

## 9. TestRun 契约

```ts
type IntegrationTestRun = {
  testRunId: string;
  requirementId: string;
  runId: string;
  environmentId: string;
  scope: {
    primaryApps: string[];
    secondaryApps: string[];
    testOnlyApps: string[];
  };
  dataPlanRef: string;
  testCaseRef: string;
  scriptRefs: string[];
  status: 'pending' | 'running' | 'passed' | 'failed' | 'blocked';
  startedAt?: string;
  completedAt?: string;
  reportRef?: string;
  evidenceRefs: string[];
  failedCaseIds: string[];
};
```

`testRunId` 必须能反查：

- 使用了哪个环境。
- 测的是哪些应用。
- 对应哪组部署产物。
- 使用了哪份造数计划。
- 失败时哪些日志和证据需要交给 ops 归因。

## 10. 知识库关系

`ai-testing` 依赖知识库生成测试，但不拥有知识库更新。

读取：

- `global/business-glossary.md`
- `global/app-domain-map.json`
- `global/dependency-map.json`
- `apps/<appId>/app-knowledge-base/api-index.md`
- `apps/<appId>/app-knowledge-base/db-schema.md`
- `apps/<appId>/app-knowledge-base/03_核心流程与逻辑层.md`
- `apps/<appId>/app-knowledge-base/gitnexus/`

写回：

- 测试报告进入 lifecycle artifacts。
- 测试发现的新流程、新接口依赖、造数坑点、环境约束，在归档阶段由 `ai-coding` 提取 knowledge delta。
- GitNexus 图谱如因测试或诊断发现真实调用链不一致，也在归档或知识库刷新阶段更新。

## 11. MVP 范围

第一版只做必要能力：

- 从 fanout 结果生成跨应用测试计划。
- 从 API、DB schema 和 GitNexus graph 生成集成测试用例。
- 生成结构化 `data-plan.json`。
- 支持 API 造数和 API 测试优先。
- 接收 Harness 测试环境地址。
- 输出 `test-report.md` 和失败证据。
- 失败时调用 ops 做归因。

暂不做：

- 完整测试平台 UI。
- 全量测试资产管理。
- 生产压测。
- 复杂录制回放。
- 自动修改生产或准生产数据。

## 12. 当前决策

- `ai-coding` 已经负责单元测试，`ai-testing` 不重复建设单元测试能力。
- `ai-testing` 是集成环境测试能力。
- 集成测试必须覆盖本次需求涉及的所有改动应用和受影响应用。
- 造数是 `ai-testing` 的核心能力之一，必须有计划、校验和清理。
- 造数默认只允许在隔离测试环境自动执行；高风险共享数据变更必须人工确认。
- 失败归因交给 ops，`ai-testing` 提供测试报告和证据。
