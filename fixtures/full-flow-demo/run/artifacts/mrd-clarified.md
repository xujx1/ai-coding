# MRD Clarification

## Feature Inventory

### 1. 活动软删除接口
- 功能名：新增活动删除接口 `POST /api/activity/delete`
- 业务域：活动管理
- 来源摘要：MRD 明确要求为运营侧补齐删除入口，按 `activityId + regionCode` 软删除活动，不新增前端页面。
- 验收摘要：传入 `requestId`、`idempotencyKey`、`activityId`、`regionCode`、`operator` 可完成删除调用；活动不存在返回 `RESOURCE_NOT_FOUND`；成功返回 `SUCCESS`。

### 2. 删除状态校验与错误口径
- 功能名：按活动状态控制是否允许删除
- 业务域：活动生命周期治理
- 来源摘要：仅 `DRAFT`、`REJECTED`、`TERMINATED` 可删除；`PENDING_APPROVAL`、`APPROVED`、`ONLINE`、`PAUSED` 不可删除；错误信息需包含当前状态。
- 验收摘要：`ONLINE` 等非允许状态调用接口返回 `ILLEGAL_STATE`，且错误消息包含当前活动状态。

### 3. 软删除数据落库
- 功能名：复用 `t_activity.is_deleted` 实现软删除
- 业务域：活动主数据管理
- 来源摘要：删除成功后更新 `is_deleted = 1`、`updated_at`、`updated_by`、`version`，不做物理删除，不删除关联券模板、券实例、商品绑定、订单占用记录。
- 验收摘要：`DRAFT`、`REJECTED`、`TERMINATED` 活动删除后数据库 `is_deleted = 1`，`version` 自增，后续现有查询逻辑不可再查到该活动。

### 4. 删除接口幂等控制
- 功能名：基于 `idempotencyKey` 的重复请求防重
- 业务域：接口可靠性治理
- 来源摘要：相同 `idempotencyKey` 且请求体相同重复提交，返回首次处理结果；相同 `idempotencyKey` 但请求体不同，返回幂等冲突。
- 验收摘要：重复提交同一删除请求返回相同处理结果；冲突请求返回明确幂等冲突结果。

### 5. 删除审计日志
- 功能名：记录活动删除审计轨迹
- 业务域：审计合规 / 运维追溯
- 来源摘要：删除成功后写审计日志，字段包含 `operationType=DELETE_ACTIVITY`、`aggregateType=Activity`、`aggregateId`、`regionCode`、`beforeJson`、`afterJson`。
- 验收摘要：删除成功后存在 `DELETE_ACTIVITY` 审计日志，并能反映删除前后活动快照。

### 6. 基础测试覆盖
- 功能名：补充删除能力测试
- 业务域：质量保障
- 来源摘要：MRD 明确要求增加基础测试覆盖，验收标准包括三类可删状态、至少一类不可删状态、查询不可见、审计写入、幂等结果及项目测试通过。
- 验收摘要：项目测试通过，覆盖成功删除、非法状态、活动不存在、幂等重复提交等核心场景。

## Project Ownership

- 活动软删除接口：`project`。理由：MRD 指定新增 `ActivityController`、`DeleteActivityRequest`、`ActivityService.deleteActivity`、`ActivityMapper.softDelete`，均属于单体后端服务范围。
- 删除状态校验与错误口径：`project`。理由：状态机校验与接口返回码由活动服务实现。
- 软删除数据落库：`project`。理由：直接操作 `t_activity` 表与 Mapper 更新语句，属于活动服务持久层。
- 删除接口幂等控制：`project`。理由：MRD 要求在服务流程中执行幂等校验与完成标记；未指向独立外部系统实现。
- 删除审计日志：`project` 为业务发起方。若审计日志底层已有公共组件或外部审计系统，则 `project` 负责调用，不负责重建该能力。
- 基础测试覆盖：`project`。理由：manifest 仅存在 `project` Maven 工程及其测试目录。

## Implementation Boundaries

- 本期实现归属 `project` 后端服务，核心边界是为现有活动管理补齐删除入口与服务端业务逻辑，不涉及新增前端页面。
- 数据边界仅限活动主表软删除：更新 `t_activity` 的删除标记与审计字段，不物理删除记录，不级联处理券模板、券实例、商品绑定、订单占用等关联数据。
- 生命周期边界已由 MRD 指定：仅 `DRAFT`、`REJECTED`、`TERMINATED` 允许删除，其余列举状态全部拦截。
- 查询可见性边界依赖现有查询逻辑已按 `is_deleted = 0` 过滤；本期只消费该既有查询约束，不扩展新的查询协议。
- 审计与幂等若底层已有通用组件，本期由 `project` 作为消费方接入；MRD 未要求新建独立审计系统或幂等基础设施。
- 本期不包含批量删除、回收站、恢复能力、物理清理任务，也不变更对外管理边界到关联业务对象。

## Clarification Questions

无需澄清。

## Clarified Decisions

- 默认只有单个实施项目 `project`，因此控制器、服务、持久层、测试均路由到该 Maven 工程。
- 默认删除接口为后端管理接口，不新增页面，也不要求前端交互改造。
- 默认活动唯一定位键为 `activityId + regionCode`，若活动不存在则返回 `RESOURCE_NOT_FOUND`，不区分“已软删除”和“从未存在”的对外口径。
- 默认软删除只影响活动自身可见性，不影响任何关联券、商品、订单占用等下游数据状态。
- 默认成功删除后，依赖现有 `is_deleted = 0` 查询过滤实现“查不到”活动，无需额外新增隐藏逻辑。
- 默认 `updated_by` 取请求中的 `operator`，`updated_at` 取服务端当前时间，`version` 按 MRD 自增 1。
- 默认测试至少覆盖：三类允许删除状态、至少一类禁止删除状态、活动不存在、重复相同请求幂等返回、删除后查询不可见、审计日志写入。
- 用户已确认幂等冲突按推荐默认决策处理：沿用项目既有统一错误码与消息模板；若现状无统一标准，则在 `project` 内为该接口补充明确且可测试的幂等冲突返回口径，并以接口验收可校验为准。
- 用户已确认审计日志按推荐默认决策处理：优先写入现有审计能力或公共审计组件；若不存在独立审计底座，则由 `project` 在现有可用数据载体中完成审计记录落点，但不在本期新建独立审计系统。