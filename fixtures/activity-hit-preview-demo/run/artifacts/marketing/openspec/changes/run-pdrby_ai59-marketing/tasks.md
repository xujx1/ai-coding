# Tasks

## Development
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

## Backend
No backend-specific tasks were identified for this app.

## Frontend
No frontend-specific tasks were identified for this app.

## Contract
- [ ] 新增 `src/main/java/com/ump/marketing/api/dto/RuntimePreviewRequest.java`，不要直接复用 `QueryScopeRequest` 作为预览契约，补齐 `requestId`、`regionCode`、`operator`、`scopeType`、`productId`、`skuId` 字段和查询场景参数校验，禁止查询接口依赖 `idempotencyKey` 落库。
- [ ] 新增 `src/main/java/com/ump/marketing/api/dto/RuntimePreviewResponse.java` 和 `src/main/java/com/ump/marketing/api/dto/RuntimePreviewHitDTO.java`，输出 `hit`、`matchedDimension`、`activities`、`missReasonCodes`、`syncHints` 以及 `activityId`、`activityName`、`status`、`toolType`、优惠门槛、优惠值、`regionCode`、`scopeKey` 等最小展示字段。
- [ ] 在 `src/main/java/com/ump/marketing/web/controller/RuntimePreviewController.java` 新增 `POST /api/runtime-preview/query` 的 `query(...)` 方法，返回 `RpcResult<RuntimePreviewResponse>`，保持 `src/main/java/com/ump/marketing/web/controller/CouponController.java` 的 `/api/coupon/use` 不变。
- [ ] 在 `RuntimePreviewController.query(...)` 为 `RuntimePreviewRequest` 接入 `@Valid` 或等价显式校验，并把 `requestId` 写入 `HttpServletRequest` 属性，保证 `src/main/java/com/ump/marketing/web/controller/GlobalExceptionHandler.java` 能按 `INVALID_ARGUMENT` 返回空 body、字段缺失和非法维度错误。

## E2E
No E2E-specific tasks were identified for this app.

## Documentation
No documentation fallback tasks were identified for this app.

## Test
## Phase 1: 测试结构与依赖梳理
- [x] 在 `src/test/java/com/ump/marketing/application/service/RuntimePreviewServiceTest.java`、`src/test/java/com/ump/marketing/web/controller/RuntimePreviewControllerTest.java`、`src/test/java/com/ump/marketing/integration/RuntimePreviewIntegrationTest.java` 建立测试类骨架，对齐被测 `RuntimePreviewService`、`RuntimePreviewController` 与 `POST /api/runtime-preview/query` 契约。
- [x] 复用 `src/test/java/com/ump/marketing/integration/BaseIntegrationTest.java` 的 Spring Boot + H2 上下文，为 `RuntimePreviewIntegrationTest` 接入 `RegionRouter`、`ShardingRouter`、`LocalCache` 和区域初始化，保证新增集成测试沿用现有区域与分表基座。
- [x] 基于 `pom.xml` 已有 `spring-boot-starter-test`、`junit-jupiter`、`mockito-junit-jupiter` 与 `maven-surefire-plugin`，为 `RuntimePreviewControllerTest` 明确 `MockMvc` 执行方式、为 `RuntimePreviewServiceTest` 明确 Mockito Mock 策略，避免引入额外测试依赖。
- [x] 在 `src/test/java/com/ump/marketing/domain/ScopeKeyGeneratorTest.java` 补充 `ScopeType` 与 `ScopeKeyGenerator.generateScopeKey` 的预览口径用例规划，锁定商品维度与 SKU 维度的 `scopeKey` 一致性，覆盖管理端和运行端同条件同结果要求。
## Phase 2: 单元测试用例生成
- [x] 在 `RuntimePreviewServiceTest` 为 `RuntimePreviewService` 的主查询方法生成 SKU 命中用例，Mock `ScopeActivityMapper`、`ActivityMapper`、`ShardingRouter`、`LocalCache`，断言 `skuId` 非空时优先按 SKU 维度计算 `scopeKey`，返回 `matchedDimension=SKU`、`hit=true`，且命中列表包含 `activityId`、`toolType`、优惠字段和 `regionCode`。
- [x] 在 `RuntimePreviewServiceTest` 为商品维度预览生成用例，Mock `ScopeActivityMapper.selectActiveByScopeKey` 返回 ONLINE 数据，断言 `skuId` 为空时按商品维度查询，`RuntimePreviewResponse.activities` 非空且 `scopeKey` 与 `productId`、`scopeType` 输入一致。
- [x] 在 `RuntimePreviewServiceTest` 为活动详情补齐生成用例，Mock `ActivityMapper.selectByActivityId` 或批量查询方法，断言响应活动项回填 `activityName`、活动状态、优惠门槛、优惠值等展示字段，避免只返回运行表裸数据。
- [x] 在 `RuntimePreviewControllerTest` 为 `POST /api/runtime-preview/query` 正常请求生成契约用例，Mock `RuntimePreviewService`，断言 `RpcResult<RuntimePreviewResponse>` 的 `success`、`code`、`requestId`、`hit`、`activities`、`missReasonCodes` 字段结构满足 `marketing-admin` 聚合展示口径。
- [x] 在 `ScopeKeyGeneratorTest` 为 `ScopeKeyGenerator.generateScopeKey` 增加商品维度与 SKU 维度差异用例，断言相同 `regionCode`、`productId` 下不同 `scopeType` 或 `skuId` 生成不同 `scopeKey`，防止预览出现假未命中。
## Phase 3: Mock 与测试数据准备
- [x] 在 `RuntimePreviewServiceTest` 为黑名单过滤生成用例，Mock `LocalCache.isMember("blacklist", "force_offline:{regionCode}:{activityId}")` 返回 `true`，断言被强制下线活动不会出现在 `activities`，并返回 `FORCE_OFFLINE_BLACKLISTED` 或等效诊断码。
- [x] 在 `RuntimePreviewServiceTest` 为非 ONLINE 运行表数据生成用例，Mock `ScopeActivityMapper` 的全量状态查询方法返回 `APPROVED` 或 `PAUSED` 记录，断言响应 `hit=false` 且 `missReasonCodes` 包含 `RUNTIME_NOT_ONLINE`，不抛系统异常。
- [x] 在 `RuntimePreviewServiceTest` 为同步诊断生成用例，Mock `SyncEventLogMapper` 最近事件查询返回待重试、消费失败或 DLQ 线索，断言 `syncHints` 或 `missReasonCodes` 包含 `SYNC_PENDING_OR_DLQ`，并保持空结果为正常业务响应。
- [x] 在 `RuntimePreviewServiceTest` 为命中条件回显生成分支用例，按实现选择 Mock `ActivityScopeMapper` 或断言直接回传本次查询条件，验证 `productId`、`skuId`、`matchedDimension` 与展示字段口径一致。
- [x] 在 `RuntimePreviewIntegrationTest` 准备 H2 测试数据写入任务，直接向 `t_scope_act_xx`、`t_activity`、`t_activity_scope`、`t_sync_event_log` 装载最小数据集，并通过 `ShardingRouter.routeScopeActTable` 计算目标分表后插入，保证集成测试与真实路由一致。
## Phase 4: 异常路径与回归覆盖
- [x] 在 `RuntimePreviewControllerTest` 为请求校验失败生成用例，覆盖缺失 `regionCode`、缺失 `scopeType`、`productId` 为空、非法 JSON body，断言 `GlobalExceptionHandler` 返回 `INVALID_ARGUMENT` 且错误消息可被管理端直接展示。
- [x] 在 `RuntimePreviewServiceTest` 为完全无运行数据生成用例，Mock `ScopeActivityMapper.selectActiveByScopeKey` 与全量状态查询均为空，断言 `hit=false`、`activities` 为空、`missReasonCodes` 包含 `NO_RUNTIME_MATCH`，满足“未命中属于正常业务结果”的要求。
- [x] 在 `RuntimePreviewIntegrationTest` 为区域隔离生成用例，在 `CN` 与 `US` 分别写入相同 `productId` 的不同活动数据，调用 `RuntimePreviewService` 或 `RuntimePreviewController` 断言仅返回当前 `regionCode` 的命中结果。
- [x] 在 `RuntimePreviewIntegrationTest` 为 SKU 优先与商品维度回退生成用例，准备同商品不同 SKU 的运行表数据，断言 `skuId` 非空时不混用商品维度结果，`skuId` 为空时仅命中商品维度数据。
- [x] 在 `RuntimePreviewIntegrationTest` 为新增只读预览接口补充回归用例，联动校验 `ProductService.queryActivitiesByScope`、`ActivityLifecycleIntegrationTest`、`ProductScopeIntegrationTest`、`RegionIsolationIntegrationTest` 的既有行为未被 `RuntimePreviewService`、`ScopeType` 扩展和只读 SQL 改动破坏。
## Phase 5: Maven 执行与报告校验
- [x] 使用 `mvn -Dtest=RuntimePreviewServiceTest,RuntimePreviewControllerTest,RuntimePreviewIntegrationTest test` 执行新增测试，校验 `RuntimePreviewService`、`RuntimePreviewController` 与 H2 集成场景全部通过。
- [x] 使用 `mvn test` 复跑全量测试，重点确认 `ActivityServiceTest`、`ScopeKeyGeneratorTest`、`ProductScopeIntegrationTest`、`RegionIsolationIntegrationTest` 未因 `ScopeType` 扩展、Mapper 只读 SQL 或新接口注册产生回归失败。
- [x] 校验 `target/surefire-reports` 中 `RuntimePreviewServiceTest`、`RuntimePreviewControllerTest`、`RuntimePreviewIntegrationTest` 的报告，确认不存在跳过用例、序列化断言失败或 `GlobalExceptionHandler` 契约漂移。
- [x] 对照 `artifacts/marketing/tech-design.md` 与澄清 MRD 核对通过结果，确认 SKU 优先、商品维度、区域隔离、黑名单过滤、同步未生效、空结果提示和只读查询契约均有对应测试记录。
