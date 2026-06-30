# marketing 测试任务清单

## Phase 1: 测试结构与依赖梳理
- [ ] 在 `src/test/java/com/ump/marketing/application/service/RuntimePreviewServiceTest.java`、`src/test/java/com/ump/marketing/web/controller/RuntimePreviewControllerTest.java`、`src/test/java/com/ump/marketing/integration/RuntimePreviewIntegrationTest.java` 建立测试类骨架，对齐被测 `RuntimePreviewService`、`RuntimePreviewController` 与 `POST /api/runtime-preview/query` 契约。
- [ ] 复用 `src/test/java/com/ump/marketing/integration/BaseIntegrationTest.java` 的 Spring Boot + H2 上下文，为 `RuntimePreviewIntegrationTest` 接入 `RegionRouter`、`ShardingRouter`、`LocalCache` 和区域初始化，保证新增集成测试沿用现有区域与分表基座。
- [ ] 基于 `pom.xml` 已有 `spring-boot-starter-test`、`junit-jupiter`、`mockito-junit-jupiter` 与 `maven-surefire-plugin`，为 `RuntimePreviewControllerTest` 明确 `MockMvc` 执行方式、为 `RuntimePreviewServiceTest` 明确 Mockito Mock 策略，避免引入额外测试依赖。
- [ ] 在 `src/test/java/com/ump/marketing/domain/ScopeKeyGeneratorTest.java` 补充 `ScopeType` 与 `ScopeKeyGenerator.generateScopeKey` 的预览口径用例规划，锁定商品维度与 SKU 维度的 `scopeKey` 一致性，覆盖管理端和运行端同条件同结果要求。

## Phase 2: 单元测试用例生成
- [ ] 在 `RuntimePreviewServiceTest` 为 `RuntimePreviewService` 的主查询方法生成 SKU 命中用例，Mock `ScopeActivityMapper`、`ActivityMapper`、`ShardingRouter`、`LocalCache`，断言 `skuId` 非空时优先按 SKU 维度计算 `scopeKey`，返回 `matchedDimension=SKU`、`hit=true`，且命中列表包含 `activityId`、`toolType`、优惠字段和 `regionCode`。
- [ ] 在 `RuntimePreviewServiceTest` 为商品维度预览生成用例，Mock `ScopeActivityMapper.selectActiveByScopeKey` 返回 ONLINE 数据，断言 `skuId` 为空时按商品维度查询，`RuntimePreviewResponse.activities` 非空且 `scopeKey` 与 `productId`、`scopeType` 输入一致。
- [ ] 在 `RuntimePreviewServiceTest` 为活动详情补齐生成用例，Mock `ActivityMapper.selectByActivityId` 或批量查询方法，断言响应活动项回填 `activityName`、活动状态、优惠门槛、优惠值等展示字段，避免只返回运行表裸数据。
- [ ] 在 `RuntimePreviewControllerTest` 为 `POST /api/runtime-preview/query` 正常请求生成契约用例，Mock `RuntimePreviewService`，断言 `RpcResult<RuntimePreviewResponse>` 的 `success`、`code`、`requestId`、`hit`、`activities`、`missReasonCodes` 字段结构满足 `marketing-admin` 聚合展示口径。
- [ ] 在 `ScopeKeyGeneratorTest` 为 `ScopeKeyGenerator.generateScopeKey` 增加商品维度与 SKU 维度差异用例，断言相同 `regionCode`、`productId` 下不同 `scopeType` 或 `skuId` 生成不同 `scopeKey`，防止预览出现假未命中。

## Phase 3: Mock 与测试数据准备
- [ ] 在 `RuntimePreviewServiceTest` 为黑名单过滤生成用例，Mock `LocalCache.isMember("blacklist", "force_offline:{regionCode}:{activityId}")` 返回 `true`，断言被强制下线活动不会出现在 `activities`，并返回 `FORCE_OFFLINE_BLACKLISTED` 或等效诊断码。
- [ ] 在 `RuntimePreviewServiceTest` 为非 ONLINE 运行表数据生成用例，Mock `ScopeActivityMapper` 的全量状态查询方法返回 `APPROVED` 或 `PAUSED` 记录，断言响应 `hit=false` 且 `missReasonCodes` 包含 `RUNTIME_NOT_ONLINE`，不抛系统异常。
- [ ] 在 `RuntimePreviewServiceTest` 为同步诊断生成用例，Mock `SyncEventLogMapper` 最近事件查询返回待重试、消费失败或 DLQ 线索，断言 `syncHints` 或 `missReasonCodes` 包含 `SYNC_PENDING_OR_DLQ`，并保持空结果为正常业务响应。
- [ ] 在 `RuntimePreviewServiceTest` 为命中条件回显生成分支用例，按实现选择 Mock `ActivityScopeMapper` 或断言直接回传本次查询条件，验证 `productId`、`skuId`、`matchedDimension` 与展示字段口径一致。
- [ ] 在 `RuntimePreviewIntegrationTest` 准备 H2 测试数据写入任务，直接向 `t_scope_act_xx`、`t_activity`、`t_activity_scope`、`t_sync_event_log` 装载最小数据集，并通过 `ShardingRouter.routeScopeActTable` 计算目标分表后插入，保证集成测试与真实路由一致。

## Phase 4: 异常路径与回归覆盖
- [ ] 在 `RuntimePreviewControllerTest` 为请求校验失败生成用例，覆盖缺失 `regionCode`、缺失 `scopeType`、`productId` 为空、非法 JSON body，断言 `GlobalExceptionHandler` 返回 `INVALID_ARGUMENT` 且错误消息可被管理端直接展示。
- [ ] 在 `RuntimePreviewServiceTest` 为完全无运行数据生成用例，Mock `ScopeActivityMapper.selectActiveByScopeKey` 与全量状态查询均为空，断言 `hit=false`、`activities` 为空、`missReasonCodes` 包含 `NO_RUNTIME_MATCH`，满足“未命中属于正常业务结果”的要求。
- [ ] 在 `RuntimePreviewIntegrationTest` 为区域隔离生成用例，在 `CN` 与 `US` 分别写入相同 `productId` 的不同活动数据，调用 `RuntimePreviewService` 或 `RuntimePreviewController` 断言仅返回当前 `regionCode` 的命中结果。
- [ ] 在 `RuntimePreviewIntegrationTest` 为 SKU 优先与商品维度回退生成用例，准备同商品不同 SKU 的运行表数据，断言 `skuId` 非空时不混用商品维度结果，`skuId` 为空时仅命中商品维度数据。
- [ ] 在 `RuntimePreviewIntegrationTest` 为新增只读预览接口补充回归用例，联动校验 `ProductService.queryActivitiesByScope`、`ActivityLifecycleIntegrationTest`、`ProductScopeIntegrationTest`、`RegionIsolationIntegrationTest` 的既有行为未被 `RuntimePreviewService`、`ScopeType` 扩展和只读 SQL 改动破坏。

## Phase 5: Maven 执行与报告校验
- [ ] 使用 `mvn -Dtest=RuntimePreviewServiceTest,RuntimePreviewControllerTest,RuntimePreviewIntegrationTest test` 执行新增测试，校验 `RuntimePreviewService`、`RuntimePreviewController` 与 H2 集成场景全部通过。
- [ ] 使用 `mvn test` 复跑全量测试，重点确认 `ActivityServiceTest`、`ScopeKeyGeneratorTest`、`ProductScopeIntegrationTest`、`RegionIsolationIntegrationTest` 未因 `ScopeType` 扩展、Mapper 只读 SQL 或新接口注册产生回归失败。
- [ ] 校验 `target/surefire-reports` 中 `RuntimePreviewServiceTest`、`RuntimePreviewControllerTest`、`RuntimePreviewIntegrationTest` 的报告，确认不存在跳过用例、序列化断言失败或 `GlobalExceptionHandler` 契约漂移。
- [ ] 对照 `artifacts/marketing/tech-design.md` 与澄清 MRD 核对通过结果，确认 SKU 优先、商品维度、区域隔离、黑名单过滤、同步未生效、空结果提示和只读查询契约均有对应测试记录。