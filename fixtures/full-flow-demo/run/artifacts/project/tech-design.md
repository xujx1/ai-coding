# project 技术方案

## 1. 项目根目录
- 项目根目录：`/private/tmp/ai-coding-real-marketing-confirm-flow-4301/runs/XOjoDRmUAx/workspace/project`
- 构建工具：Maven，单模块 Spring Boot 2.7 + MyBatis 工程。
- 代码分层已成型：`api` 放 DTO / 枚举 / 统一返回，`application` 放应用服务与幂等审计，`infrastructure` 放 Mapper，`web` 放 Controller。
- 本期仅处理 `project` 后端服务，不涉及前端页面、其他仓库或独立中台组件。

## 2. 影响范围
- `web/controller`：活动管理控制器新增或校准删除接口，统一复用现有 `RpcResult` 返回结构。
- `api/dto`：删除请求 DTO 继续作为入参载体，需确认字段完整覆盖 `requestId`、`idempotencyKey`、`activityId`、`regionCode`、`operator`。
- `application/service`：`ActivityService.deleteActivity` 是本期核心，负责区域校验、幂等控制、活动查询、状态校验、软删除、审计写入与结果回放。
- `infrastructure/mapper`：`ActivityMapper` 负责按 `activityId + regionCode` 查询和软删除更新；需要确保更新条件包含 `status`、`version`、`is_deleted = 0`，避免并发误删。
- `application/service/IdempotencyService`：复用现有幂等记录表与响应回放逻辑，不新建基础设施，但需要按删除接口验收口径确认冲突与重复请求行为。
- `application/service/AuditService` 与 `OperationAuditLogMapper`：复用现有审计能力写入删除前后快照，不重建审计底座。
- 测试层：补齐删除成功、非法状态、活动不存在、重复提交、删除后查询不可见、审计写入等集成测试。
- 数据边界仅限 `t_activity` 软删除；不联动 `t_coupon_template`、`t_coupon_inst_*`、`t_scope_act_*`、`t_order_occur_*` 等关联表。

## 3. 主要改动文件候选
- `src/main/java/com/ump/marketing/web/controller/ActivityController.java`
  - 已存在 `POST /api/activity/delete` 入口，需确认仅透传到应用服务，不额外引入前端或异步流程依赖。
- `src/main/java/com/ump/marketing/api/dto/DeleteActivityRequest.java`
  - 当前 DTO 仅声明 `activityId`，其余字段依赖 `BaseRequest` 继承；需核对 `BaseRequest` 已覆盖 `requestId`、`idempotencyKey`、`regionCode`、`operator`，否则需补字段或校验注解。
- `src/main/java/com/ump/marketing/application/service/ActivityService.java`
  - 核心实现文件；需要确认 `deleteActivity` 的返回码、允许状态集合、并发更新处理、审计内容与幂等完成时机符合 MRD。
- `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java`
  - 已存在 `selectByActivityId`、`selectForUpdate`、`softDelete`；本期重点是复用或校准这些方法的查询与更新条件。
- `src/main/java/com/ump/marketing/application/service/IdempotencyService.java`
  - 复用 `checkAndRecord` 与 `markCompleted`；需关注删除失败场景是否符合既有处理中“处理中冲突”与“成功回放”的语义。
- `src/main/java/com/ump/marketing/application/service/AuditService.java`
  - 复用统一审计写入入口，删除成功时写 `DELETE_ACTIVITY`。
- `src/main/java/com/ump/marketing/domain/model/OperationAuditLog.java`
  - 当前模型字段为 `beforeSnapshot` / `afterSnapshot`，需在方案与实现中保持与 MRD 的 `beforeJson` / `afterJson` 语义映射一致。
- `src/main/java/com/ump/marketing/infrastructure/mapper/OperationAuditLogMapper.java`
  - 复用审计表写入与按聚合查询能力，供测试校验删除日志是否落库。
- `src/main/java/com/ump/marketing/infrastructure/mapper/IdempotencyRecordMapper.java`
  - 复用幂等记录落库与状态更新能力，无需新增表。
- `src/test/java/**`
  - 当前预读取上下文未暴露现成删除测试用例，预计需在活动相关集成测试或应用服务测试中新增覆盖。
- `src/test/resources/schema.sql`
  - 复用 H2 测试表结构；若审计表、幂等表已存在则直接使用，若测试初始化缺失相关表定义需一并核对。

## 4. 接口 / 数据 / 配置影响
- 接口影响：新增或正式启用 `POST /api/activity/delete`，请求体口径为 `requestId`、`idempotencyKey`、`activityId`、`regionCode`、`operator`，成功返回 `RpcResult<Void>`。
- 返回码影响：沿用现有 `ErrorCode`，删除成功返回 `SUCCESS`，活动不存在返回 `RESOURCE_NOT_FOUND`，状态不允许删除返回 `ILLEGAL_STATE`，幂等冲突返回 `IDEMPOTENCY_CONFLICT`。
- 业务规则影响：仅 `DRAFT`、`REJECTED`、`TERMINATED` 允许删除；`PENDING_APPROVAL`、`APPROVED`、`ONLINE`、`PAUSED` 统一拦截，错误消息需拼出当前状态。
- 数据影响：复用 `t_activity.is_deleted` 软删除，成功时更新 `is_deleted = 1`、`updated_at`、`updated_by`，并通过 `version = version + 1` 保证乐观锁语义。
- 查询影响：现有 `ActivityMapper.selectByActivityId` 已按 `is_deleted = 0` 过滤；删除后活动会自然从既有查询链路中不可见。
- 幂等影响：复用 `t_idempotency_record`；相同 `idempotencyKey` 且请求体一致返回首次结果，请求体不一致返回冲突。
- 审计影响：复用 `t_operation_audit_log`，写入 `operationType = DELETE_ACTIVITY`、`aggregateType = Activity`、`aggregateId = activityId`、`regionCode` 以及删除前后快照。
- 配置影响：无新增环境变量、无新增中间件配置、无新增数据源；现有 `application.yml` 与测试 H2 配置可继续使用。
- DDL 影响：MRD 结论为不新增表字段；仅依赖现有 `t_activity`、`t_idempotency_record`、`t_operation_audit_log` 结构。

## 5. 实施步骤
1. 核对现有 `DeleteActivityRequest` 继承链，确认删除接口所需公共字段已由 `BaseRequest` 提供，必要时补充参数校验规则，避免接口名已存在但入参不完整。
2. 在 `ActivityService` 中梳理并补齐 `deleteActivity` 主流程：区域校验、幂等预占、按 `activityId + regionCode` 查询活动、活动不存在返回 `RESOURCE_NOT_FOUND`。
3. 在删除主流程中校验当前状态是否属于 `DRAFT`、`REJECTED`、`TERMINATED`；对不允许状态返回 `ILLEGAL_STATE`，并在消息中带出当前状态值。
4. 以活动当前 `status` 与 `version` 调用 `ActivityMapper.softDelete`，更新 `is_deleted`、`updated_at`、`updated_by`；若更新行数为 0，则按并发修改或状态已变化处理，避免重复删除造成脏写。
5. 删除成功后构造删除前后快照，复用 `AuditService.logStateChange` 写入 `DELETE_ACTIVITY` 审计日志；`afterSnapshot` 需要体现 `is_deleted = 1`、版本递增和操作者更新结果。
6. 业务成功后调用 `IdempotencyService.markCompleted` 持久化响应，确保相同删除请求重复提交时能够直接回放首次结果。
7. 复查是否需要发布同步事件；MRD 未要求删除事件外发，如现有链路无硬依赖，本期默认不新增 Kafka / Canal 删除消息，避免扩散改动范围。
8. 补齐测试夹具与用例，覆盖三类可删状态、至少一类不可删状态、活动不存在、相同请求重复提交、删除后查询不可见、审计落库与幂等冲突口径。
9. 在 H2 集成测试环境执行项目测试，确认 `schema.sql` 中幂等表和审计表定义满足删除链路初始化要求。

## 6. 测试策略
- 以 Spring Boot + H2 集成测试为主，优先验证 Controller 到 Mapper 的完整链路，而不是只做局部 Mock 单测。
- 成功场景至少覆盖 3 组活动状态：`DRAFT`、`REJECTED`、`TERMINATED`，分别断言接口成功、`t_activity.is_deleted = 1`、`updated_by` 已更新、`version` 自增。
- 非法状态场景至少覆盖 `ONLINE`，断言返回 `ILLEGAL_STATE`，并校验错误消息包含当前状态字符串。
- 不存在场景断言返回 `RESOURCE_NOT_FOUND`，且不写审计、不更新幂等成功结果。
- 查询不可见场景在删除成功后再次通过 `ActivityMapper.selectByActivityId` 或等价查询读取，断言结果为空。
- 幂等重复提交场景使用相同 `idempotencyKey` 和相同请求体重复调用两次，断言第二次回放首次结果且不会产生额外业务副作用。
- 幂等冲突场景使用相同 `idempotencyKey` 搭配不同 `activityId` 或不同 `regionCode`，断言返回 `IDEMPOTENCY_CONFLICT`。
- 审计场景断言 `t_operation_audit_log` 中存在 `DELETE_ACTIVITY` 记录，且 `aggregateId`、`regionCode`、删除前后快照内容正确。
- 并发与乐观锁场景可在服务测试中模拟旧版本删除或重复删除，断言不会把已变化状态误判为成功。

## 7. 风险与回滚
- 风险：虽然删除入口与 `softDelete` 方法已存在，但当前代码基线未在预读取上下文中展示完整 `deleteActivity` 实现，可能存在“接口已暴露但业务口径未完全符合 MRD”的偏差，需要以实际代码为准逐项对照。
- 风险：`DeleteActivityRequest` 自身只声明了 `activityId`，若 `BaseRequest` 未完整提供 `regionCode`、`operator`、`idempotencyKey` 等字段，会导致接口契约与 MRD 不一致。
- 风险：审计模型字段名为 `beforeSnapshot` / `afterSnapshot`，与需求文档中的 `beforeJson` / `afterJson` 是语义映射关系，测试和文档需要避免按字面误判为缺字段。
- 风险：`IdempotencyService` 对处理中请求直接返回冲突，若删除事务中途失败且未清理记录，可能影响同键重试体验；本期需确认是否接受该既有语义。
- 风险：当前 `selectByActivityId` 已过滤 `is_deleted = 0`，对外无法区分“已删除”和“从未存在”；这与已确认边界一致，但会影响排障可观测性。
- 风险：若测试 `schema.sql` 缺少幂等表或审计表定义，删除链路会在 H2 集成测试阶段失败，需要提前核对。
- 回滚策略：若删除功能上线后出现问题，可通过回滚应用版本关闭删除逻辑；由于本期不做物理删除，已删除数据仍保留在 `t_activity` 中。
- 回滚策略：对误删数据的恢复不属于本期能力，紧急处理只能通过数据库手工将 `is_deleted` 恢复为 `0` 并校正 `updated_at`、`updated_by`、`version`，操作前需结合审计日志确认目标记录。
- 回滚策略：本期无 DDL 变更、无配置新增，回滚不涉及数据库结构回退或中间件配置撤销。