# MRD Clarification

## Feature Inventory
{{feature_lines}}

## Project Ownership
{{ownership_lines}}

## Implementation Boundaries
- 当前基于 artifacts/mrd.md 推断业务边界。
- 未检测到上传代码项目时，后续实施方案需要用户补充实际仓库/服务名映射。
- 不在兜底逻辑中假定具体系统、业务域或项目归属；无法确认的归属必须进入澄清问题。
{{failed_output}}

## Clarification Questions
### 项目归属
1. 请确认每个功能点最终落地到哪个上传项目文件夹或外部系统。
2. 请确认是否存在跨项目协作、只消费不实现、或由外部系统提供的能力。

### 字段口径
1. 请确认活动、券模板、商品、限购、订单占用等字段以哪个代码仓或 schema 文件作为 SSOT。

### 接口边界
1. 请确认需求中涉及的服务、模块、接口、事件或任务分别属于哪个项目或外部依赖。

### 数据一致性
1. 请确认 B/C 同步、Kafka DLQ、补偿和对账的最终 SLA 与责任系统。

### 验收标准
1. 请确认性能、合规、多语言、多币种、离线报表等验收指标是否作为 V1 必须交付项。

## Clarified Decisions
- MRD Render 的 artifacts/mrd.md 作为业务事实来源，本节点不重复展示全文。
- 下游实施方案应使用 Feature Inventory、Project Ownership 和 Implementation Boundaries 做任务拆分。
- 在用户未补充实际项目文件夹前，所有项目归属都是业务系统级推断，不视为最终代码项目映射。
