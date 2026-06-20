# project 开发任务清单

## Phase 1: 代码结构与现状梳理
- [x] 核对 `src/main/java/com/ump/marketing/web/controller/ActivityController.java` 中 `POST /api/activity/delete` 是否仅调用 `ActivityService.deleteActivity`，避免新增前端、消息或其他旁路依赖。
- [x] 核对 `src/main/java/com/ump/marketing/api/dto/DeleteActivityRequest.java` 与 `src/main/java/com/ump/marketing/api/dto/BaseRequest.java` 的字段覆盖，确认删除请求已具备 `requestId`、`idempotencyKey`、`activityId`、`regionCode`、`operator`。
- [x] 核对 `src/main/java/com/ump/marketing/application/service/ActivityService.java` 中 `deleteActivity` 的现有实现与 `DELETABLE_STATUSES` 常量，按 PRD 对照允许状态、错误码、幂等、审计和软删除口径。
- [x] 核对 `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java` 中 `selectByActivityId`、`selectForUpdate`、`softDelete` 的查询与更新条件，确认 `is_deleted = 0`、`status`、`version` 已参与删除链路约束。
- [x] 核对 `src/main/java/com/ump/marketing/application/service/IdempotencyService.java`、`src/main/java/com/ump/marketing/application/service/AuditService.java`、`src/main/java/com/ump/marketing/infrastructure/mapper/OperationAuditLogMapper.java` 的复用方式，确认本期不新建幂等或审计基础设施。

## Phase 2: 接口与入参实现
- [x] 修改 `src/main/java/com/ump/marketing/api/dto/DeleteActivityRequest.java`，补齐 `activityId` 的参数校验约束，确保删除请求最少满足 `activityId + regionCode` 唯一定位要求。
- [x] 修改 `src/main/java/com/ump/marketing/api/dto/BaseRequest.java` 或删除请求相关校验逻辑，确保 `requestId`、`idempotencyKey`、`regionCode`、`operator` 对 `POST /api/activity/delete` 为必填且口径与 PRD 一致。
- [x] 修改 `src/main/java/com/ump/marketing/web/controller/ActivityController.java` 中 `delete(@RequestBody DeleteActivityRequest req)` 的入参校验或注解使用方式，确保删除接口统一返回 `RpcResult<Void>`。
- [x] 核对 `src/main/java/com/ump/marketing/api/enums/ErrorCode.java` 是否已存在 `SUCCESS`、`RESOURCE_NOT_FOUND`、`ILLEGAL_STATE`、`IDEMPOTENCY_CONFLICT`，若缺失则按现有统一规范补齐删除接口使用的错误码。

## Phase 3: 业务逻辑实现
- [x] 修改 `src/main/java/com/ump/marketing/application/service/ActivityService.java` 中 `deleteActivity` 主流程，按顺序实现 `regionCode` 校验、`idempotencyKey` 校验、请求指纹生成与 `IdempotencyService.checkAndRecord` 调用。
- [x] 修改 `ActivityService.deleteActivity`，通过 `ActivityMapper.selectByActivityId(activityId, regionCode)` 查询活动，并对不存在或已软删除场景统一返回 `RESOURCE_NOT_FOUND`。
- [x] 修改 `ActivityService.deleteActivity`，仅允许 `DRAFT`、`REJECTED`、`TERMINATED` 进入删除；对 `PENDING_APPROVAL`、`APPROVED`、`ONLINE`、`PAUSED` 返回 `ILLEGAL_STATE`，并在错误信息中拼接当前 `status`。
- [x] 修改 `ActivityService.deleteActivity`，删除成功前保存活动删除前快照，删除成功后构造包含 `is_deleted = 1`、`updated_by = operator`、`updated_at` 变更和 `version` 自增结果的删除后快照。
- [x] 修改 `ActivityService.deleteActivity`，在软删除成功后调用 `AuditService.logStateChange` 写入 `DELETE_ACTIVITY` 审计记录，保持 `aggregateType = Activity`、`aggregateId = activityId`、`regionCode` 和前后快照完整。
- [x] 修改 `ActivityService.deleteActivity`，在业务成功后调用 `IdempotencyService.markCompleted` 持久化首次响应，确保相同 `idempotencyKey` 且请求体一致时可回放首次结果。
- [x] 修改 `ActivityService.deleteActivity`，明确相同 `idempotencyKey` 但不同请求体时沿用 `IdempotencyService` 的 `IDEMPOTENCY_CONFLICT` 返回，不新增额外分支语义。
- [x] 修改 `ActivityService.deleteActivity`，确认删除链路不调用 `SyncEventPublisher`、不下发 Kafka / Canal 删除事件，也不联动 `t_coupon_template`、`t_coupon_inst_*`、`t_scope_act_*`、`t_order_occur_*` 等关联数据。

## Phase 4: 数据访问与配置实现
- [x] 修改 `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java` 中 `softDelete` 的 SQL，确保更新条件包含 `activity_id`、`region_code`、`status`、`version`、`is_deleted = 0`，并执行 `is_deleted = 1`、`version = version + 1`、`updated_at`、`updated_by` 更新。
- [x] 修改 `ActivityService.deleteActivity` 对 `ActivityMapper.softDelete(...)` 返回行数为 `0` 的处理，按并发修改、状态变化或重复删除后的不可见口径返回明确结果，避免误判成功。
- [x] 核对 `src/main/java/com/ump/marketing/infrastructure/mapper/OperationAuditLogMapper.java` 与 `src/main/java/com/ump/marketing/domain/model/OperationAuditLog.java`，确保 `beforeSnapshot` / `afterSnapshot` 与需求中的 `beforeJson` / `afterJson` 保持语义一致。
- [x] 核对 `src/test/resources/schema.sql` 中 `t_activity`、`t_idempotency_record`、`t_operation_audit_log` 表定义，确认删除链路测试所需字段、索引和唯一键已齐备；如缺失则补齐测试初始化 DDL。
- [x] 核对 `pom.xml` 与 `src/test/resources/application.yml`，确认 H2、`spring-boot-starter-test`、Surefire 与测试数据源配置可直接支撑删除链路集成验证，无需新增环境变量或数据源配置。

## Phase 5: 编译验证与验收自查
- [x] 在 `src/test/java/com/ump/marketing/integration/ActivityLifecycleIntegrationTest.java` 或活动相关新增集成测试文件中补齐删除场景验证入口，覆盖 `DRAFT`、`REJECTED`、`TERMINATED` 三类可删状态成功删除。
- [x] 在活动相关集成测试中补齐至少一类不可删状态用例，验证 `ONLINE` 或其他禁止状态返回 `ILLEGAL_STATE`，且错误信息包含当前 `status`。
- [x] 在活动相关集成测试中补齐活动不存在用例，验证返回 `RESOURCE_NOT_FOUND`，且不会写入 `DELETE_ACTIVITY` 审计记录。
- [x] 在活动相关集成测试中补齐相同 `idempotencyKey` + 相同请求体的重复提交用例，验证第二次返回首次结果且不会产生重复软删除或重复审计副作用。
- [x] 在活动相关集成测试中补齐相同 `idempotencyKey` + 不同请求体的冲突用例，验证返回 `IDEMPOTENCY_CONFLICT`。
- [x] 在活动相关集成测试中补齐删除后查询不可见用例，验证 `ActivityMapper.selectByActivityId(activityId, regionCode)` 返回空或等价不可见结果。
- [x] 在活动相关集成测试中补齐审计落库用例，验证 `OperationAuditLogMapper.selectByAggregateId(activityId, regionCode)` 中存在 `operationType = DELETE_ACTIVITY` 且前后快照正确。
- [x] 运行 `mvn test` 完成项目验证，并按 PRD 自查删除接口返回码、软删除字段更新、版本递增、查询不可见、幂等回放和审计落库是否全部满足验收口径。