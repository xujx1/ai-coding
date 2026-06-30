# marketing 开发任务清单

## Phase 1: 代码结构与现状梳理
- [x] 新增 `src/main/java/com/ump/marketing/web/controller/RuntimePreviewController.java`、`src/main/java/com/ump/marketing/application/service/RuntimePreviewService.java`、`src/main/java/com/ump/marketing/api/dto/RuntimePreviewRequest.java`、`src/main/java/com/ump/marketing/api/dto/RuntimePreviewResponse.java`、`src/main/java/com/ump/marketing/api/dto/RuntimePreviewHitDTO.java` 文件骨架，并保持包路径分别落在 `web/controller`、`application/service`、`api/dto`。
- [x] 修改 `src/main/java/com/ump/marketing/api/enums/ScopeType.java` 和 `src/main/java/com/ump/marketing/domain/service/ScopeKeyGenerator.java`，集中收敛商品维度与 SKU 维度字符串别名，固定 `skuId` 非空优先 SKU、`skuId` 为空按商品维度的 `scopeKey` 生成口径。
- [x] 在 `src/main/java/com/ump/marketing/application/service/ProductService.java` 提取或复用 `queryActivitiesByScope(...)` 的只读公共逻辑，避免 `RuntimePreviewService` 重复实现 `ShardingRouter.routeScopeActTable(...)`、`ScopeKeyGenerator.generateScopeKey(...)` 和 `LocalCache.isMember(...)` 的运行侧查询链路。

## Phase 2: 接口与入参实现
- [x] 新增 `src/main/java/com/ump/marketing/api/dto/RuntimePreviewRequest.java`，不要直接复用 `QueryScopeRequest` 作为预览契约，补齐 `requestId`、`regionCode`、`operator`、`scopeType`、`productId`、`skuId` 字段和查询场景参数校验，禁止查询接口依赖 `idempotencyKey` 落库。
- [x] 新增 `src/main/java/com/ump/marketing/api/dto/RuntimePreviewResponse.java` 和 `src/main/java/com/ump/marketing/api/dto/RuntimePreviewHitDTO.java`，输出 `hit`、`matchedDimension`、`activities`、`missReasonCodes`、`syncHints` 以及 `activityId`、`activityName`、`status`、`toolType`、优惠门槛、优惠值、`regionCode`、`scopeKey` 等最小展示字段。
- [x] 在 `src/main/java/com/ump/marketing/web/controller/RuntimePreviewController.java` 新增 `POST /api/runtime-preview/query` 的 `query(...)` 方法，返回 `RpcResult<RuntimePreviewResponse>`，保持 `src/main/java/com/ump/marketing/web/controller/CouponController.java` 的 `/api/coupon/use` 不变。
- [x] 在 `RuntimePreviewController.query(...)` 为 `RuntimePreviewRequest` 接入 `@Valid` 或等价显式校验，并把 `requestId` 写入 `HttpServletRequest` 属性，保证 `src/main/java/com/ump/marketing/web/controller/GlobalExceptionHandler.java` 能按 `INVALID_ARGUMENT` 返回空 body、字段缺失和非法维度错误。

## Phase 3: 业务逻辑实现
- [x] 新增 `src/main/java/com/ump/marketing/application/service/RuntimePreviewService.java`，采用构造注入 `ScopeActivityMapper`、`ActivityMapper`、`ActivityScopeMapper`、`SyncEventLogMapper`、`ShardingRouter`、`LocalCache`、`ObjectMapper`，实现 `queryRuntimePreview(RuntimePreviewRequest req)` 只读服务入口，并且不要调用 `IdempotencyService` 写入查询幂等记录。
- [x] 在 `RuntimePreviewService.queryRuntimePreview(...)` 先归一化 `scopeType`，再调用 `ScopeKeyGenerator.generateScopeKey(...)` 计算 `scopeKey`，并通过 `matchedDimension` 明确当前返回是商品维度还是 SKU 维度命中结果。
- [x] 在 `RuntimePreviewService.queryRuntimePreview(...)` 基于 `ScopeActivityMapper.selectActiveByScopeKey(...)` 查询 `ONLINE` 运行表记录，对 `blacklist` 命名空间中的 `force_offline:{regionCode}:{activityId}` 做过滤，并把有效命中活动映射成 `RuntimePreviewHitDTO` 列表。
- [x] 在 `RuntimePreviewService.queryRuntimePreview(...)` 使用 `ActivityMapper` 补齐 `activityName`、活动当前 `status`、玩法类型和优惠核心信息，保证响应覆盖 MRD 要求的活动 ID、名称、状态、玩法类型、优惠门槛、优惠值、区域和命中条件口径。
- [x] 在 `RuntimePreviewService.queryRuntimePreview(...)` 处理完全无运行表数据、有全状态记录但无 `ONLINE`、黑名单过滤后为空、同步待消费或 `DLQ` 等场景，返回 `NO_RUNTIME_MATCH`、`RUNTIME_NOT_ONLINE`、`FORCE_OFFLINE_BLACKLISTED`、`SYNC_PENDING_OR_DLQ` 等结构化原因码，并始终使用 `RpcResult.success(...)` 返回业务结果。
- [x] 按最终展示要求决定 `RuntimePreviewResponse.activities[*]` 的命中条件来源：优先通过 `ActivityScopeMapper` 回填逐活动 `productId`、`skuId`、`scopeType`，若运行侧只回显本次查询条件，则在响应结构中固定该口径并与 `marketing-admin` 契约保持一致。

## Phase 4: 数据访问与配置实现
- [x] 修改 `src/main/java/com/ump/marketing/infrastructure/mapper/ScopeActivityMapper.java` 和 `src/main/resources/mapper/ScopeActivityMapper.xml`，新增 `selectAllByScopeKey(...)` 或等价方法按 `scopeKey + regionCode` 读取全部状态记录，并保留 `selectActiveByScopeKey(...)` 作为 `ONLINE` 命中查询。
- [x] 修改 `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java`，新增 `selectByActivityIds(...)` 或等价批量只读方法，一次性加载 `t_activity` 的 `activity_name`、`status`、`tool_type` 和优惠字段，避免 `RuntimePreviewService` 对活动详情逐条查询形成 N+1。
- [x] 修改 `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityScopeMapper.java`，新增按 `scopeKey` 或 `activityId` 的只读查询方法，从 `t_activity_scope` 补齐 `productId`、`skuId`、`scopeType` 等命中条件展示字段。
- [x] 修改 `src/main/java/com/ump/marketing/infrastructure/mapper/SyncEventLogMapper.java`，新增按 `aggregateId`、`regionCode`、`eventType` 倒序读取最近同步事件的方法，用 `consumeStatus`、`retryCount`、`errorMessage` 生成 `syncHints`，不要新增 Kafka topic、表字段或写链路。
- [x] 校验 `src/main/resources/schema.sql`、`src/main/resources/schema-mysql.sql` 和 `src/test/resources/schema.sql` 的 `t_activity`、`t_activity_scope`、`t_scope_act_00` 到 `t_scope_act_15`、`t_sync_event_log` 结构满足只读查询需要；仅在测试 DDL 缺失时补齐，不新增生产表字段和应用配置项。
- [x] 保持 `src/main/resources/application.yml` 与 `src/test/resources/application.yml` 现有数据源、端口和 `mybatis.mapper-locations` 配置不变，只确保新增 Mapper 方法与 XML 能被 MyBatis 正常扫描。

## Phase 5: 编译验证与验收自查
- [x] 运行 `mvn -q -DskipTests compile`，确认 `RuntimePreviewController`、`RuntimePreviewService`、新增 DTO、Mapper 接口和 XML 全量编译通过。
- [x] 运行 `mvn -q -Dtest=ProductScopeIntegrationTest,RegionIsolationIntegrationTest,ScopeKeyGeneratorTest test` 或等价最小回归，确认新增只读接口没有破坏既有分表查询、区域隔离和 `CouponController` 核销路径。
- [x] 用 `POST /api/runtime-preview/query` 自查 `skuId` 非空命中、`skuId` 为空按商品维度命中、区域不一致、运行表非 `ONLINE`、黑名单过滤、同步待消费或 `DLQ`、完全空结果七类场景，确认未命中时返回 `success=true` 且 `missReasonCodes`、`syncHints` 结构完整。
- [x] 对照 `artifacts/mrd-clarified.md` 和 `artifacts/marketing/tech-design.md` 复核响应字段最小集合 `activityId`、`activityName`、`status`、`toolType`、优惠门槛、优惠值、`regionCode`、`scopeKey`、`matchedDimension`、`missReasonCodes`、`syncHints`，确认 `marketing-admin` 可直接消费运行侧结果。