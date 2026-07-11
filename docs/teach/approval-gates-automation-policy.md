# 人工确认门与自动化边界方案

## 1. 结论

MVP 固定人工确认门保留三道：

```text
1. 需求澄清确认
2. 技术方案确认
3. 测试环境发布前代码审核
```

除这三道固定确认门外，其他环节默认自动推进。只有触发高风险、权限、环境或失败不确定等异常条件时，才进入异常人工确认门。

MVP 不单独做审批系统，直接复用 `ai-coding` 现有 session / event / confirmation gate UI。人工确认门本质上是 `NodeRun.status = waiting_approval` 加一条 `ApprovalGateRef`，确认结果由 `ai-coding` 写入 `LifecycleState` 和 `EventLog`。

目标是避免两种极端：

- 每一步都人工确认，导致自动化价值很低。
- 全程无确认，导致代码、环境、数据和执行权限风险不可控。

## 2. 固定人工确认门

### 2.1 需求澄清确认

位置：

```text
MRD 上传
  -> MRD 解析
  -> 需求澄清
  -> 需求澄清确认
  -> PRD / 需求拆解
```

目的：

- 确认需求范围。
- 确认应用归属。
- 确认包含项和不包含项。
- 确认关键业务规则。
- 确认未决问题是否已补齐。

确认内容：

```text
需求背景
业务目标
用户路径
应用归属
包含范围
排除范围
风险和待确认项
```

### 2.2 技术方案确认

位置：

```text
PRD / 需求拆解
  -> 技术方案生成
  -> 技术方案确认
  -> 代码生成
```

目的：

- 确认改造点准确。
- 确认接口、数据模型、状态流和依赖系统设计合理。
- 确认兼容性、灰度、回滚和测试策略。
- 避免 Agent 在错误设计上直接生成代码。

确认内容：

```text
应用改造范围
接口变化
数据模型变化
核心流程
依赖系统
兼容策略
测试策略
发布和回滚策略
风险点
```

### 2.3 测试环境发布前代码审核

位置：

```text
代码生成
  -> 单元测试
  -> 自动修复
  -> CI 构建
  -> 测试环境发布前代码审核
  -> 部署测试环境
  -> 自动化测试
```

MVP 中的“发布”指发布到测试环境，不是生产发布。

不建议在代码刚生成完成后立即强制审核，因为此时可能还是半成品。更合理的是在单测、自动修复和基础 CI 之后，部署测试环境之前进行审核。

目的：

- 确认实际代码变更和技术方案一致。
- 确认变更风险可接受。
- 确认可以进入测试环境。
- 防止未经审查的代码直接部署。

确认内容：

```text
需求 ID
应用
分支
deploymentSetId
buildId / imageTag / imageDigest
变更文件列表
核心 diff 摘要
新增或修改接口
数据库 / 配置变更
单元测试结果
CI 结果
风险点
Agent 自评
是否建议发布到测试环境
```

## 3. 默认自动推进环节

以下环节默认自动执行，不固定卡人工：

```text
MRD 解析
项目 manifest 扫描
应用 fanout 初判
代码读取 / grep / dependency scan
PRD 草稿生成
需求拆解生成
代码生成
单元测试
低风险自动修复
CI 状态查询
CI 日志采集
测试环境部署状态查询
测试策略生成
测试用例生成
自动化脚本生成
测试执行
Docker 只读日志采集
测试环境应用日志采集
失败分类
诊断报告生成
归档草稿生成
```

## 4. 异常人工确认门

异常确认门默认不出现，只有触发条件满足时才出现。

建议触发条件：

```text
high-risk-command
large-code-change
shared-environment-deploy
data-mutation
unknown-failure
production-action
permission-escalation
destructive-operation
```

### 4.1 高风险命令

触发示例：

```text
docker exec
docker rm
docker stop
rm -rf
数据库写操作
修改网络 / volume / 镜像
```

### 4.2 大范围代码变更

触发示例：

```text
变更文件数超过阈值
删除大量代码
修改核心框架代码
修改鉴权、支付、库存、结算等高风险模块
```

### 4.3 共享环境部署

触发示例：

```text
部署目标不是临时 preview 环境
会影响其他测试人员
会覆盖共享测试数据
```

### 4.4 数据变更或造数

触发示例：

```text
写共享数据库
清理测试数据
批量生成数据
修改配置中心
```

普通测试数据库直写不默认触发异常确认。只有出现以下情况才触发：

```text
写共享公共数据
覆盖存量测试数据
删除数据
cleanup 不可靠
涉及账号、权限、支付、资金、库存、额度等高风险数据
```

### 4.5 失败原因未知

当失败分类是 `UNKNOWN`，或诊断置信度低于阈值时，必须人工确认后再决定是否修复、重跑或跳过。

## 5. ApprovalGate 契约

```ts
type ApprovalGateRef = {
  id: string;
  requirementId: string;
  runId: string;
  appId?: string;
  nodeRunId: string;
  gateType: ApprovalGateType;
  status: 'waiting' | 'approved' | 'rejected' | 'changes_requested' | 'expired';
  title: string;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  options: ApprovalOption[];
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  feedback?: string;
  decisionReason?: string;
  relatedArtifactIds: string[];
  traceId?: string;
};

type ApprovalOption =
  | 'approve'
  | 'reject'
  | 'request_changes'
  | 'manual_override';

type ApprovalGateType =
  | 'requirement-clarification'
  | 'tech-design'
  | 'pre-deploy-code-review'
  | 'high-risk-command'
  | 'large-code-change'
  | 'shared-environment-deploy'
  | 'data-mutation'
  | 'unknown-failure'
  | 'production-action'
  | 'permission-escalation'
  | 'destructive-operation';
```

## 6. ApprovalPolicy

```ts
type ApprovalPolicy = {
  fixedGates: ApprovalGateType[];
  conditionalGates: ApprovalGateType[];
  thresholds: {
    largeCodeChangeFileCount: number;
    lowDiagnosisConfidence: number;
  };
};
```

默认配置：

```ts
const defaultApprovalPolicy: ApprovalPolicy = {
  fixedGates: [
    'requirement-clarification',
    'tech-design',
    'pre-deploy-code-review',
  ],
  conditionalGates: [
    'high-risk-command',
    'large-code-change',
    'shared-environment-deploy',
    'data-mutation',
    'unknown-failure',
    'production-action',
    'permission-escalation',
    'destructive-operation',
  ],
  thresholds: {
    largeCodeChangeFileCount: 20,
    lowDiagnosisConfidence: 0.65,
  },
};
```

## 7. Workflow 位置

Full lifecycle workflow 建议：

```text
mrd-upload
  -> mrd-clarify
  -> requirement-clarification-gate
  -> prd-generate
  -> tech-design
  -> tech-design-gate
  -> code-generate
  -> unit-test
  -> autofix
  -> ci-build
  -> pre-deploy-code-review-gate
  -> deploy-test-env
  -> testing-generate
  -> testing-execute
  -> failure-diagnosis
  -> fix-and-rerun
  -> archive
```

## 8. UI 展示要求

MVP 不新增独立审批系统，直接复用 `ai-coding` 现有 session / event / confirmation gate UI。

确认页面不应该只展示“通过 / 拒绝”。建议在现有 session 页面中按三块展示：

```text
左侧：生命周期 timeline
中间：当前审核内容
右侧：关联产物、风险项、证据和 Agent 建议
```

至少展示：

```text
确认类型
需求 ID
应用
当前阶段
摘要
风险等级
相关产物
Agent 建议
可选操作
```

操作：

```text
Approve
Reject
Request Changes
Manual Override
```

动作语义：

```text
Approve
  继续执行下一节点

Reject
  终止当前 workflow 或回退到指定阶段

Request Changes
  带反馈回到上一个生成节点

Manual Override
  页面先不做权限控制，必须记录原因
```

MVP 权限模型：

```text
页面先不做权限控制。
当前 session 用户可以执行 Approve / Reject / Request Changes / Manual Override。
所有动作必须记录 resolvedBy、decisionReason、feedback、decidedAt。
后续再接入角色、管理员和审批权限。
```

固定确认门展示重点：

```text
需求澄清确认
  fanoutDecision
  unresolvedTerms
  primaryApps / secondaryApps / testOnlyApps
  澄清问题答案

技术方案确认
  PRD
  AppChangePlan
  API / DB / 核心流程改动
  测试策略
  风险点

测试环境发布前代码审核
  changedFiles
  code-review-summary
  单元测试结果
  CI 预检查结果
  EnvironmentPlan
  是否允许进入集成环境
```

异常确认门展示重点：

```text
FailureClassification
DiagnosisReport
EvidenceManifest
confidence
suggestedAction
risk reason
FixCycle if exists
```

异常确认门允许用户选择：

```text
人工修复
允许低风险自动修复
重跑
终止
```

## 9. Trace 与审计

每次确认门都必须写：

- lifecycle-state。
- EventLog。
- TraceRef。
- relatedArtifactIds。
- resolvedBy / decisionReason。

LangSmith metadata 应包含：

```json
{
  "requirementId": "req_20260710_activity_hit_preview",
  "runId": "PDRbY_AI59",
  "appId": "marketing-admin",
  "workflowId": "full-lifecycle",
  "nodeId": "pre-deploy-code-review-gate",
  "gateType": "pre-deploy-code-review"
}
```

## 10. 第一版验收标准

1. 需求澄清阶段会生成固定确认门。
2. 技术方案阶段会生成固定确认门。
3. 测试环境部署前会生成代码审核确认门。
4. 其他普通节点默认自动推进。
5. 高风险命令会触发异常确认门。
6. `UNKNOWN` 失败分类会触发异常确认门。
7. 每个确认门都写入 `lifecycle-state.json`。
8. 每个确认结果都能在事件流和 trace 中追踪。
