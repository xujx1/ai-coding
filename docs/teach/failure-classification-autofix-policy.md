# 失败归因与自动修复边界方案

## 1. 结论

失败归因由迁入 `ai-coding` 后的 `ops` 能力承担，能力来源参考 `/Users/xu/IdeaProjects/ai-ops`。

`ops` 负责：

- 收集证据。
- 分析 CI、部署、测试、运行环境失败。
- 输出失败分类。
- 给出根因候选。
- 给出修复建议和置信度。

`ai-coding` 负责：

- 消费结构化失败归因结果。
- 根据策略决定修代码、修测试、修数据、修配置、重跑、等待环境或进入人工确认。
- 执行后续 workflow。

`ops` 不直接修改代码、不直接重跑 pipeline、不直接执行恢复动作。

修复边界固定为：

```text
ai-ops:
  只做诊断，不直接改代码。

ai-testing:
  只改测试脚本、造数计划、断言配置。

ai-coding:
  只在 ops 归因为 CODE_BUG 且置信度足够时，回流生成代码修复。

harness-runtime:
  只负责重建、重部署、重跑 pipeline。
```

## 2. 分工

```text
ai-testing
  -> 发现测试失败
  -> 输出 test-report、失败用例、断言差异、测试日志
  -> 只允许修复测试脚本、造数计划、断言配置

harness-runtime
  -> 输出 ci-log、deploy-log、pipeline 状态、环境信息、容器信息
  -> 只负责重建、重部署、重跑 pipeline

ops diagnosis
  -> 收集测试报告、CI 日志、部署日志、Docker 日志、应用日志
  -> 判断 failure classification
  -> 输出诊断报告、证据和修复建议
  -> 不直接改代码、不直接改测试、不直接重跑

ai-coding lifecycle
  -> 根据 failure classification 决定下一步
  -> 只有 CODE_BUG 且置信度足够时才回流代码修复
```

## 3. 触发点

以下节点失败后触发失败归因：

```text
ci-build failed
deploy-test-env failed
testing-execute failed
runtime smoke failed
diagnosis confidence too low
```

流程：

```text
失败事件
  -> 收集证据
  -> ops failure classification
  -> 写入 FailureClassification
  -> 写入 diagnosis-report artifact
  -> ai-coding 根据策略推进
```

## 4. 失败分类

```ts
type FailureCategory =
  | 'CODE_BUG'
  | 'TEST_SCRIPT_BUG'
  | 'DATA_SETUP_FAILED'
  | 'ENVIRONMENT_NOT_READY'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'CONFIG_ERROR'
  | 'CI_INFRA_FAILURE'
  | 'DOCKER_RESOURCE_FAILURE'
  | 'UNKNOWN';
```

分类说明：

| 分类 | 说明 | 默认处理 |
| --- | --- | --- |
| `CODE_BUG` | 业务代码问题 | 可回流代码修复 |
| `TEST_SCRIPT_BUG` | 测试脚本或断言问题 | 可回流测试脚本修复 |
| `DATA_SETUP_FAILED` | 造数、清理、校验数据失败 | 可回流造数计划 |
| `ENVIRONMENT_NOT_READY` | 测试环境未启动、不稳定、健康检查失败 | 等待或重建环境 |
| `DEPENDENCY_UNAVAILABLE` | 外部依赖、下游服务不可用 | 等待依赖或人工确认 |
| `CONFIG_ERROR` | 配置、环境变量、端口、连接串等问题 | 低风险私有配置可自动修 |
| `CI_INFRA_FAILURE` | CI 执行底座异常 | 诊断执行底座，不改业务代码 |
| `DOCKER_RESOURCE_FAILURE` | Docker daemon、容器、网络、磁盘、镜像问题 | 诊断容器环境，不改业务代码 |
| `UNKNOWN` | 证据不足或无法判断 | 人工确认 |

## 5. FailureClassification 契约

```ts
type FailureClassification = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  source: 'ci' | 'deploy' | 'test' | 'runtime';
  category: FailureCategory;
  confidence: number;
  evidenceArtifactIds: string[];
  diagnosisArtifactId?: string;
  suggestedAction:
    | 'fix_code'
    | 'fix_test'
    | 'fix_data'
    | 'fix_config'
    | 'rerun'
    | 'wait_environment'
    | 'manual_review';
  autoFixAllowed: boolean;
  reason: string;
  traceId?: string;
  createdAt: string;
};
```

## 6. Evidence 输入

`ops` 归因节点输入不直接读取所有原始上下文，而是读取证据产物。

常见证据：

```text
test-report
failed-test-cases
pytest / playwright logs
ci-log
deploy-log
container logs
docker events
container inspect
application logs
health check result
commit diff summary
changed files
tech-design
```

证据通过 `ArtifactRef` 关联：

```ts
type FailureClassificationInput = {
  requirementId: string;
  runId: string;
  appId?: string;
  source: 'ci' | 'deploy' | 'test' | 'runtime';
  relatedIds: string[];
  evidenceArtifactIds: string[];
};
```

## 7. 决策策略

默认规则：

```text
confidence >= 0.75 且 autoFixAllowed = true
  -> 自动进入对应修复 workflow

CODE_BUG 必须同时满足：
  confidence >= 0.75
  改动范围小
  非高风险业务逻辑
  非跨应用大改
  非 schema 变更

confidence < 0.75
  -> 异常人工确认门

category = UNKNOWN
  -> 异常人工确认门
```

自动修复允许范围：

```text
CODE_BUG
  条件：低风险、小范围、置信度足够
  动作：fix_code

TEST_SCRIPT_BUG
  条件：只修改本次生成的测试脚本或断言配置
  动作：fix_test

DATA_SETUP_FAILED
  条件：只修改本次隔离测试数据的造数计划、校验或清理逻辑
  动作：fix_data

CONFIG_ERROR
  条件：只修改本次需求私有配置或测试环境配置
  动作：fix_config
```

默认不自动修复：

```text
低置信度 CODE_BUG
跨应用大改
schema 变更
共享测试数据变更
权限 / 支付 / 资金 / 库存 / 额度等高风险业务逻辑
ENVIRONMENT_NOT_READY
DEPENDENCY_UNAVAILABLE
CI_INFRA_FAILURE
DOCKER_RESOURCE_FAILURE
UNKNOWN
```

这些优先进入等待、重跑、环境诊断或人工确认，不直接改业务代码。

## 8. FixCycle 契约

每次失败修复都必须记录一个 `FixCycle`。

```ts
type FixCycle = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  failedDeploymentSetId: string;
  failedTestRunId?: string;
  diagnosisId: string;
  failureClassificationId: string;
  fixOwner: 'ai-coding' | 'ai-testing' | 'harness-runtime' | 'manual';
  fixType: 'code' | 'test-script' | 'data-plan' | 'assertion-config' | 'config' | 'environment' | 'manual';
  autoFixAllowed: boolean;
  confidence: number;
  fixArtifactIds: string[];
  nextDeploymentSetId?: string;
  nextTestRunId?: string;
  status: 'planned' | 'applied' | 'rerunning' | 'passed' | 'failed' | 'manual-required';
  reason: string;
  createdAt: string;
};
```

`fixOwner` 必须按分类路由：

```text
TEST_SCRIPT_BUG
  -> ai-testing

DATA_SETUP_FAILED
  -> ai-testing

CONFIG_ERROR 且只影响本需求私有配置
  -> ai-coding 或 harness-runtime

CODE_BUG 且低风险小范围
  -> ai-coding

ENVIRONMENT_NOT_READY / CI_INFRA_FAILURE / DOCKER_RESOURCE_FAILURE
  -> harness-runtime 或 manual

UNKNOWN / 高风险 / 低置信度
  -> manual
```

## 9. DeploymentSet 版本规则

修复后不能覆盖失败时的部署事实。

必须追加新的 `RequirementDeploymentSet`：

```text
RequirementDeploymentSet v1
  -> integration test failed
  -> ops diagnosis
  -> FixCycle created
  -> fix applied
  -> RequirementDeploymentSet v2
  -> rerun integration test
```

规则：

- v1 保留失败证据、测试报告、部署产物和诊断报告。
- v2 记录修复后的新构建产物或新测试脚本 / 造数计划引用。
- `FixCycle.failedDeploymentSetId` 指向 v1。
- `FixCycle.nextDeploymentSetId` 指向 v2。
- 测试报告、ops 诊断和归档都不能只保留最后一次结果，必须保留失败到修复的链路。

## 10. Workflow

```text
testing-execute failed
  -> collect-test-evidence
  -> collect-runtime-evidence
  -> ops-failure-classification
  -> classification-policy-router
      -> fix-code
      -> fix-test
      -> fix-data
      -> fix-config
      -> rerun
      -> wait-environment
      -> manual-review-gate
```

自动修复后：

```text
fix applied
  -> unit-test or test-script validation
  -> rerun pipeline if needed
  -> create next RequirementDeploymentSet
  -> rerun integration testing
  -> append FixCycle result
```

CI / 部署失败：

```text
harness-watch-pipeline failed
  -> collect-ci-logs
  -> collect-docker-evidence
  -> ops-failure-classification
  -> classification-policy-router
```

## 11. 与人工确认门的关系

以下情况触发异常人工确认：

- `category = UNKNOWN`
- `confidence < 0.75`
- `autoFixAllowed = false` 但建议动作涉及修改代码、数据或环境。
- 需要操作共享测试环境。
- 涉及高风险模块。
- 涉及数据写操作。
- 涉及跨应用大改。
- 涉及 schema 变更。
- 涉及共享测试数据变更。
- 涉及权限 / 支付 / 资金 / 库存 / 额度等高风险业务逻辑。
- 涉及 Docker 高风险命令。
- 涉及生产或准生产动作。

人工确认门类型：

```text
unknown-failure
high-risk-command
large-code-change
shared-environment-deploy
data-mutation
production-action
permission-escalation
```

## 12. ops 能力迁移目标

从 `ai-ops` 收敛到 `ai-coding`：

```text
src/ops/
  evidence/
    collectCiLogs.ts
    collectDockerLogs.ts
    collectApplicationLogs.ts
    collectTestEvidence.ts

  failure-classifier/
    classifyFailure.ts
    types.ts
    prompts.ts

  diagnosis/
    buildDiagnosisReport.ts
    rootCauseCandidates.ts
    repairSuggestion.ts

  runbooks/
    similarIncidentSearch.ts
```

不迁入或暂缓：

```text
完整 ai-ops UI
完整工作流编辑器
完整 GitLab OAuth
生产恢复动作执行
复杂 MCP 市场化配置
```

## 13. Trace

失败归因必须接入 LangSmith / local trace。

建议 metadata：

```json
{
  "requirementId": "req_20260710_activity_hit_preview",
  "runId": "PDRbY_AI59",
  "appId": "marketing-admin",
  "workflowId": "full-lifecycle",
  "nodeId": "ops-failure-classification",
  "source": "test",
  "testRunId": "test-run-42",
  "pipelineRunId": "pipeline-run-42"
}
```

## 14. 产物

失败归因至少产出：

```text
failure-classification.json
diagnosis-report.md
evidence-manifest.json
fix-cycle.json
```

并注册为 `ArtifactRef`：

```text
failure-classification
diagnosis-report
fix-cycle
```

## 15. 第一版验收标准

1. 测试失败后能触发 `ops-failure-classification`。
2. CI 失败后能触发 `ops-failure-classification`。
3. 归因结果写入 `FailureClassification`。
4. 归因报告注册为 `diagnosis-report` artifact。
5. `CODE_BUG` 且置信度足够时能进入代码修复 workflow。
6. `TEST_SCRIPT_BUG` 只能进入 ai-testing 的测试脚本或断言配置修复。
7. `DATA_SETUP_FAILED` 只能进入 ai-testing 的造数计划修复。
8. `ENVIRONMENT_NOT_READY` 不会直接修改业务代码。
9. `UNKNOWN`、低置信度 `CODE_BUG`、跨应用大改、schema 变更和共享测试数据变更会进入人工确认门。
10. 每次修复都会生成 `FixCycle`。
11. 修复重跑不会覆盖失败的 `RequirementDeploymentSet`，而是追加下一版。
12. 所有归因证据都能通过 `requirementId` 追踪。
