# marketing-admin 测试任务清单

## Phase 1: 测试结构与依赖梳理
- [ ] 对齐 `pom.xml` 现有 `spring-boot-starter-test`、`junit-jupiter`、`mockito-junit-jupiter` 与 Surefire `**/*Test.java` 规则，确认 `PreviewControllerTest`、`PreviewServiceTest`、`ActivityPreviewIntegrationTest`、`MarketingRuntimePreviewClientTest` 可直接纳入现有测试编排；仅在 `MarketingRuntimePreviewClientTest` 无法完成 HTTP 桩验证时再补最小测试依赖。
- [ ] 在 `src/test/resources/application.yml` 或 `src/main/resources/application-test.yml` 为 `PreviewRuntimeProperties` 增加 `preview.runtime.base-url`、`preview.runtime.connect-timeout-ms`、`preview.runtime.read-timeout-ms` 的测试值，保证 `ActivityPreviewIntegrationTest` 与 `MarketingRuntimePreviewClientTest` 不访问外部 `marketing` 进程。
- [ ] 新建 `src/test/java/com/ump/marketing/web/controller/PreviewControllerTest.java`，沿用 `ActivityControllerTest` 的 `MockMvcBuilders.standaloneSetup` 与 `GlobalExceptionHandler` 结构验证 `PreviewController` 的接口契约。
- [ ] 新建 `src/test/java/com/ump/marketing/application/service/PreviewServiceTest.java`，沿用 `ActivityServiceTest` 的 `MockitoExtension` 结构隔离 `PreviewService` 对 `PreviewQueryMapper`、`MarketingRuntimePreviewClient` 与差异提示组装逻辑的分支覆盖。
- [ ] 新建 `src/test/java/com/ump/marketing/integration/ActivityPreviewIntegrationTest.java` 并继承 `BaseIntegrationTest`，复用 `schema.sql`、H2 数据源、区域注册与 Spring 容器验证 `PreviewQueryMapper`、`PreviewService` 的集成行为。
- [ ] 视 `MarketingRuntimePreviewClient` 的实现方式新建 `src/test/java/com/ump/marketing/infrastructure/client/MarketingRuntimePreviewClientTest.java`，为运行侧协议转换保留独立适配层测试，不把外部契约断言混入 `PreviewServiceTest`。

## Phase 2: 单元测试用例生成
- [ ] 在 `PreviewControllerTest.java` 覆盖 `POST /api/preview/activity-hit` 成功场景，mock `PreviewService` 返回包含 `managementResult`、`runtimeResult`、`diffHints`、`querySummary` 的 `PreviewResponseDTO`，断言 `RpcResult` 的 `code`、`success`、`requestId` 与结果主字段透传正确。
- [ ] 在 `PreviewControllerTest.java` 覆盖 `productId`、`regionCode`、`operator`、`idempotencyKey` 缺失以及请求体缺失场景，断言 `ErrorCode.INVALID_ARGUMENT` 与 `GlobalExceptionHandler` 返回消息，并校验 `PreviewService` 未被调用。
- [ ] 在 `PreviewControllerTest.java` 使用 `ArgumentCaptor` 校验 `PreviewController` 接收到 `skuId` 非空请求时完整透传 `productId`、`skuId`、`scopeType`、`regionCode` 与 `operator`，为 SKU 优先链路保留接口级断言。
- [ ] 在 `PreviewServiceTest.java` 覆盖 `PreviewQueryRequest.skuId` 非空场景，mock `PreviewQueryMapper` 与 `MarketingRuntimePreviewClient` 返回商品级和 SKU 级候选数据，断言 `PreviewService` 只按 SKU 维度主路径生成双侧结果。
- [ ] 在 `PreviewServiceTest.java` 覆盖 `PreviewQueryRequest.skuId` 为空场景，断言 `PreviewService` 按商品维度查询管理配置侧并向 `MarketingRuntimePreviewClient` 发送不含 `skuId` 的运行侧请求。
- [ ] 在 `PreviewServiceTest.java` 覆盖 `PreviewQueryRequest.scopeType` 作为可选过滤条件的场景，断言 `scopeType` 仅缩小候选活动，不改变 `productId` / `skuId` 的查询优先级与 `querySummary` 回显内容。

## Phase 3: Mock 与测试数据准备
- [ ] 在 `PreviewServiceTest.java` mock `PreviewQueryMapper` 与 `MarketingRuntimePreviewClient` 返回双侧命中数据，断言 `PreviewResponseDTO.managementResult`、`runtimeResult`、`querySummary` 与 `PreviewActivityDTO.sourceSide` 正确映射 `activityId`、`activityName`、`status`、`toolType`、`thresholdAmount`、`discountAmount`、`discountRate`、`maxDiscount`、`couponTemplateId`、`regionCode`、`productId`、`skuId`、`scopeType`。
- [ ] 在 `PreviewServiceTest.java` 构造“管理配置侧命中、用户运行侧未命中”的 mock 数据，断言 `diffHints` 至少包含同步延迟、未上线或运行侧未生效方向，且 `managementResult` 不因运行侧未命中被清空。
- [ ] 在 `PreviewServiceTest.java` 构造“双侧都未命中”的 mock 数据，断言 `managementResult`、`runtimeResult` 返回空结果但保持成功响应，并生成商品未绑定、区域不一致或配置未生效等排查提示。
- [ ] 在 `ActivityPreviewIntegrationTest.java` 使用 H2 向 `t_activity` 与 `t_activity_scope` 插入同区域的商品级、SKU 级、已删除和跨区域数据，验证 `PreviewQueryMapper` 只返回 `is_deleted = 0`、`region_code` 匹配且符合 `productId` / `skuId` 条件的记录。
- [ ] 在 `ActivityPreviewIntegrationTest.java` 准备 `ONLINE`、`APPROVED`、`PAUSED` 等不同状态活动数据，验证 `PreviewQueryMapper` 或 `PreviewService` 输出顺序优先展示更接近生效状态的活动，并保留活动核心优惠字段。
- [ ] 在 `MarketingRuntimePreviewClientTest.java` 通过可控 stub HTTP 响应或可替换客户端 mock 验证 `MarketingRuntimePreviewClient` 发送的请求体包含 `regionCode`、`operator`、`productId`、`skuId`、`scopeType`，并能把运行侧返回解析到 `RuntimePreviewResponse` 与内部 DTO。

## Phase 4: 异常路径与回归覆盖
- [ ] 在 `PreviewServiceTest.java` 覆盖 `MarketingRuntimePreviewClient` 超时、连接失败和非成功响应场景，断言 `PreviewService` 保留管理配置侧结果、将 `runtimeResult` 标记为不可用并补充“运行侧暂不可达”提示，而不是返回系统异常。
- [ ] 在 `PreviewControllerTest.java` 覆盖运行侧降级响应透传场景，断言 `POST /api/preview/activity-hit` 仍返回 `200` 与成功结构，且 `runtimeResult`、`diffHints` 中包含降级说明。
- [ ] 在 `ActivityPreviewIntegrationTest.java` 覆盖 `scopeType` 过滤、区域不匹配、`t_activity_scope.is_deleted = 1`、`t_activity.is_deleted = 1` 与无命中数据场景，验证管理配置侧查询不会把无效绑定或跨区域活动误判为命中。
- [ ] 复跑 `src/test/java/com/ump/marketing/integration/ProductScopeIntegrationTest.java`，确认新增 `PreviewQueryMapper`、`PreviewService`、`MarketingRuntimePreviewClient` 不影响既有 `/api/product/queryByScope` 的商品绑定与运行态范围查询行为。
- [ ] 复跑 `src/test/java/com/ump/marketing/web/controller/ActivityControllerTest.java` 与 `src/test/java/com/ump/marketing/integration/ActivityLifecycleIntegrationTest.java`，确认新增预览接口与配置不影响活动删除接口、生命周期流转和现有 `GlobalExceptionHandler` 行为。

## Phase 5: Maven 执行与报告校验
- [ ] 执行 `mvn test -Dtest=PreviewControllerTest,PreviewServiceTest,ActivityPreviewIntegrationTest,MarketingRuntimePreviewClientTest`，确认新增预览测试类在本地独立运行通过；若客户端测试类命名有调整，同步修正命令中的测试类列表。
- [ ] 执行 `mvn test -Dtest=ActivityControllerTest,ActivityServiceTest,ProductScopeIntegrationTest,ActivityLifecycleIntegrationTest`，校验 `PreviewController`、`PreviewService`、`PreviewQueryMapper` 引入后既有控制器、服务和集成测试回归通过。
- [ ] 执行 `mvn test`，检查 `target/surefire-reports` 中 `PreviewControllerTest`、`PreviewServiceTest`、`ActivityPreviewIntegrationTest`、`MarketingRuntimePreviewClientTest` 无失败、无错误，且不存在异常跳过增长。
- [ ] 执行 `mvn spring-boot:run -Dspring-boot.run.profiles=test`，结合 `src/main/resources/static/index.html`、`app.js`、`styles.css` 对预览入口做一次本地联调，确认商品维度、SKU 维度、命中结果展示、未命中空状态与双侧差异提示均可加载且不依赖外部 `marketing` 服务。
- [ ] 检查 Maven 控制台与 `target/surefire-reports` 日志，确认不存在 `Connection refused`、外部 `marketing` 调用、H2 schema 初始化失败或 `RuleValidator` 参数校验漏测后，再将该清单同步给后续测试代码生成节点。