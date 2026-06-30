# Tasks

## Development
## Phase 1: 代码结构与现状梳理
- [x] 对照 `src/main/java/com/ump/marketing/web/controller/ActivityController.java`、`src/main/java/com/ump/marketing/web/controller/ProductController.java`、`src/main/java/com/ump/marketing/api/dto/BaseRequest.java` 与 `src/main/java/com/ump/marketing/web/controller/GlobalExceptionHandler.java`，确定 `PreviewController.java`、`PreviewQueryRequest.java` 和 `RpcResult<PreviewResponseDTO>` 的接口签名、`@Valid` 校验方式与异常返回口径。
- [x] 对照 `src/main/java/com/ump/marketing/application/service/ProductService.java`、`src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java`、`src/main/java/com/ump/marketing/infrastructure/mapper/ActivityScopeMapper.java` 与 `src/main/resources/mapper/ScopeActivityMapper.xml`，梳理管理配置侧与用户运行侧边界，固定 `PreviewService.java` 只聚合 `t_activity` + `t_activity_scope` 查询结果和 `marketing` 运行侧返回，不复用 `/api/product/queryByScope` 作为正式运行侧答案。
- [x] 对照 `src/main/resources/static/index.html`、`src/main/resources/static/app.js` 与 `src/main/resources/static/styles.css`，确定“活动命中预览”入口、查询表单、双侧结果区和差异提示区在现有单页中的挂载位置，避免影响“活动设置”“范围设置”“生命周期”现有交互。
## Phase 2: 接口与入参实现
- [x] 新增 `src/main/java/com/ump/marketing/api/dto/PreviewQueryRequest.java` 继承 `BaseRequest`，补齐 `productId`、`skuId`、`scopeType` 字段，并通过注解或服务校验保证 `regionCode`、`operator`、`idempotencyKey`、`productId` 必填，`skuId` 可选且可触发 SKU 优先逻辑。
- [x] 新增 `src/main/java/com/ump/marketing/api/dto/PreviewResponseDTO.java`、`src/main/java/com/ump/marketing/api/dto/PreviewSideResultDTO.java`、`src/main/java/com/ump/marketing/api/dto/PreviewActivityDTO.java`、`src/main/java/com/ump/marketing/api/dto/PreviewHintDTO.java`，统一 `managementResult`、`runtimeResult`、`diffHints`、`querySummary` 与活动最小展示字段 `activityId`、`activityName`、`status`、`toolType`、`thresholdAmount`、`discountAmount`、`discountRate`、`maxDiscount`、`couponTemplateId`、`regionCode`、`productId`、`skuId`、`scopeType`、`sourceSide`。
- [x] 新增 `src/main/java/com/ump/marketing/web/controller/PreviewController.java`，实现 `POST /api/preview/activity-hit`，接收 `@Valid @RequestBody PreviewQueryRequest` 并返回 `RpcResult<PreviewResponseDTO>`，保持与 `GlobalExceptionHandler.java` 一致的参数错误返回口径。
- [x] 在 `src/main/resources/static/app.js` 新增预览请求构造方法，确保页面提交 `/api/preview/activity-hit` 时复用 `requestId`、`caller`、`operator`、`regionCode`、`idempotencyKey`、`timestampMs` 公共字段，并按 `skuId` 是否为空生成商品维度或 SKU 维度请求。
## Phase 3: 业务逻辑实现
- [x] 新增 `src/main/java/com/ump/marketing/application/service/PreviewService.java`，集中实现参数校验、`RuleValidator.validateRegionCode()` 调用、SKU 优先决策、管理侧查询编排、运行侧调用和 `RpcResult<PreviewResponseDTO>` 组装，不侵入 `ActivityService.java` 与 `ProductService.java` 既有生命周期逻辑。
- [x] 在 `PreviewService.java` 中实现 `managementResult` 聚合：`skuId` 非空时优先按 SKU 查询，`skuId` 为空时按 `productId` 查询，并在未命中时返回空状态与“商品未绑定”“区域不一致”“配置未生效”等排查提示。
- [x] 在 `PreviewService.java` 中实现 `runtimeResult` 聚合与降级：调用 `MarketingRuntimePreviewClient.java` 消费 `marketing` 运行侧结果，下游超时或失败时保留管理侧结果并返回“运行侧结果暂不可用”提示，而不是把整次预览处理为系统异常。
- [x] 在 `PreviewService.java` 中生成 `diffHints`，覆盖“管理侧命中但运行侧未命中”“双侧都未命中”“双侧都命中但字段存在差异”等场景，输出同步延迟、未上线、运行侧未生效等说明。
- [x] 修改 `src/main/resources/static/index.html`、`src/main/resources/static/app.js` 与 `src/main/resources/static/styles.css`，新增“活动命中预览”导航、区域/活动范围类型/商品 ID/SKU ID/操作人表单、管理配置侧结果卡片、用户运行侧结果卡片、差异提示区、未命中空状态区和移动端展示逻辑。
- [x] 在 `src/main/resources/static/app.js` 中补齐预览结果渲染，分别展示 `activityId`、`activityName`、`status`、`toolType`、优惠字段、`regionCode`、`productId`、`skuId`、`scopeType` 与 `sourceSide`，并明确标识“按 SKU 维度预览”或“按商品维度预览”。
## Phase 4: 数据访问与配置实现
- [x] 新增 `src/main/java/com/ump/marketing/infrastructure/mapper/PreviewQueryMapper.java` 与 `src/main/resources/mapper/PreviewQueryMapper.xml`，基于 `t_activity` 关联 `t_activity_scope` 实现管理配置侧查询，过滤 `t_activity.is_deleted = 0`、`t_activity_scope.is_deleted = 0`、`region_code` 一致，并支持 `scopeType` 可选过滤。
- [x] 在 `src/main/resources/mapper/PreviewQueryMapper.xml` 中实现 SKU 优先与商品维度回退的动态 SQL，命中字段映射到 `PreviewActivityDTO` 或等效查询投影，并按 `ONLINE`、`APPROVED`、`PAUSED` 等更接近生效状态的顺序排序。
- [x] 新增 `src/main/java/com/ump/marketing/infrastructure/client/MarketingRuntimePreviewClient.java`、`src/main/java/com/ump/marketing/infrastructure/client/dto/RuntimePreviewRequest.java` 与 `src/main/java/com/ump/marketing/infrastructure/client/dto/RuntimePreviewResponse.java`，封装 `marketing` 运行态预览接口的请求/响应适配、异常映射和原因口径转换，不在客户端内实现命中规则。
- [x] 新增 `src/main/java/com/ump/marketing/infrastructure/config/PreviewRuntimeConfig.java` 与 `src/main/java/com/ump/marketing/infrastructure/config/PreviewRuntimeProperties.java`，提供运行侧 HTTP 客户端 Bean 与 `preview.runtime.base-url`、`preview.runtime.connect-timeout-ms`、`preview.runtime.read-timeout-ms` 配置绑定。
- [x] 修改 `src/main/resources/application.yml` 与 `src/main/resources/application-test.yml`，补齐 `preview.runtime.*` 配置；`test` profile 使用本地假地址或可替换桩配置，避免开发自测依赖外部 `marketing` 进程。
- [x] 保持 `src/main/resources/schema.sql` 与 `src/main/resources/schema-mysql.sql` 不做 DDL 变更，仅新增 Mapper XML 和配置，确保本期范围不引入表结构迁移。
## Phase 5: 编译验证与验收自查
- [x] 运行 `mvn -q -DskipTests compile`，校验 `PreviewController.java`、`PreviewService.java`、`PreviewQueryMapper.java`、`MarketingRuntimePreviewClient.java`、`PreviewRuntimeConfig.java` 与新增 DTO/静态资源引用可通过编译。
- [x] 运行 `mvn spring-boot:run -Dspring-boot.run.profiles=test`，在首页手工验证商品维度预览、SKU 维度预览、管理侧命中、运行侧未命中、运行侧不可用降级、双侧差异提示和未命中空状态展示。
- [x] 自查 `POST /api/preview/activity-hit` 的请求字段、返回结构、空结果语义和差异提示与 MRD/技术方案一致，并确认 `POST /api/product/queryByScope`、活动创建、商品绑定、生命周期操作等现有接口行为未被改坏。

## Backend
No backend-specific tasks were identified for this app.

## Frontend
No frontend-specific tasks were identified for this app.

## Contract
- [ ] 新增 `src/main/java/com/ump/marketing/api/dto/PreviewQueryRequest.java` 继承 `BaseRequest`，补齐 `productId`、`skuId`、`scopeType` 字段，并通过注解或服务校验保证 `regionCode`、`operator`、`idempotencyKey`、`productId` 必填，`skuId` 可选且可触发 SKU 优先逻辑。
- [ ] 新增 `src/main/java/com/ump/marketing/api/dto/PreviewResponseDTO.java`、`src/main/java/com/ump/marketing/api/dto/PreviewSideResultDTO.java`、`src/main/java/com/ump/marketing/api/dto/PreviewActivityDTO.java`、`src/main/java/com/ump/marketing/api/dto/PreviewHintDTO.java`，统一 `managementResult`、`runtimeResult`、`diffHints`、`querySummary` 与活动最小展示字段 `activityId`、`activityName`、`status`、`toolType`、`thresholdAmount`、`discountAmount`、`discountRate`、`maxDiscount`、`couponTemplateId`、`regionCode`、`productId`、`skuId`、`scopeType`、`sourceSide`。
- [ ] 新增 `src/main/java/com/ump/marketing/web/controller/PreviewController.java`，实现 `POST /api/preview/activity-hit`，接收 `@Valid @RequestBody PreviewQueryRequest` 并返回 `RpcResult<PreviewResponseDTO>`，保持与 `GlobalExceptionHandler.java` 一致的参数错误返回口径。
- [ ] 在 `src/main/resources/static/app.js` 新增预览请求构造方法，确保页面提交 `/api/preview/activity-hit` 时复用 `requestId`、`caller`、`operator`、`regionCode`、`idempotencyKey`、`timestampMs` 公共字段，并按 `skuId` 是否为空生成商品维度或 SKU 维度请求。

## E2E
No E2E-specific tasks were identified for this app.

## Documentation
No documentation fallback tasks were identified for this app.

## Test
## Phase 1: 测试结构与依赖梳理
- [x] 对齐 `pom.xml` 现有 `spring-boot-starter-test`、`junit-jupiter`、`mockito-junit-jupiter` 与 Surefire `**/*Test.java` 规则，确认 `PreviewControllerTest`、`PreviewServiceTest`、`ActivityPreviewIntegrationTest`、`MarketingRuntimePreviewClientTest` 可直接纳入现有测试编排；仅在 `MarketingRuntimePreviewClientTest` 无法完成 HTTP 桩验证时再补最小测试依赖。
- [x] 在 `src/test/resources/application.yml` 或 `src/main/resources/application-test.yml` 为 `PreviewRuntimeProperties` 增加 `preview.runtime.base-url`、`preview.runtime.connect-timeout-ms`、`preview.runtime.read-timeout-ms` 的测试值，保证 `ActivityPreviewIntegrationTest` 与 `MarketingRuntimePreviewClientTest` 不访问外部 `marketing` 进程。
- [x] 新建 `src/test/java/com/ump/marketing/web/controller/PreviewControllerTest.java`，沿用 `ActivityControllerTest` 的 `MockMvcBuilders.standaloneSetup` 与 `GlobalExceptionHandler` 结构验证 `PreviewController` 的接口契约。
- [x] 新建 `src/test/java/com/ump/marketing/application/service/PreviewServiceTest.java`，沿用 `ActivityServiceTest` 的 `MockitoExtension` 结构隔离 `PreviewService` 对 `PreviewQueryMapper`、`MarketingRuntimePreviewClient` 与差异提示组装逻辑的分支覆盖。
- [x] 新建 `src/test/java/com/ump/marketing/integration/ActivityPreviewIntegrationTest.java` 并继承 `BaseIntegrationTest`，复用 `schema.sql`、H2 数据源、区域注册与 Spring 容器验证 `PreviewQueryMapper`、`PreviewService` 的集成行为。
- [x] 视 `MarketingRuntimePreviewClient` 的实现方式新建 `src/test/java/com/ump/marketing/infrastructure/client/MarketingRuntimePreviewClientTest.java`，为运行侧协议转换保留独立适配层测试，不把外部契约断言混入 `PreviewServiceTest`。
## Phase 2: 单元测试用例生成
- [x] 在 `PreviewControllerTest.java` 覆盖 `POST /api/preview/activity-hit` 成功场景，mock `PreviewService` 返回包含 `managementResult`、`runtimeResult`、`diffHints`、`querySummary` 的 `PreviewResponseDTO`，断言 `RpcResult` 的 `code`、`success`、`requestId` 与结果主字段透传正确。
- [x] 在 `PreviewControllerTest.java` 覆盖 `productId`、`regionCode`、`operator`、`idempotencyKey` 缺失以及请求体缺失场景，断言 `ErrorCode.INVALID_ARGUMENT` 与 `GlobalExceptionHandler` 返回消息，并校验 `PreviewService` 未被调用。
- [x] 在 `PreviewControllerTest.java` 使用 `ArgumentCaptor` 校验 `PreviewController` 接收到 `skuId` 非空请求时完整透传 `productId`、`skuId`、`scopeType`、`regionCode` 与 `operator`，为 SKU 优先链路保留接口级断言。
- [x] 在 `PreviewServiceTest.java` 覆盖 `PreviewQueryRequest.skuId` 非空场景，mock `PreviewQueryMapper` 与 `MarketingRuntimePreviewClient` 返回商品级和 SKU 级候选数据，断言 `PreviewService` 只按 SKU 维度主路径生成双侧结果。
- [x] 在 `PreviewServiceTest.java` 覆盖 `PreviewQueryRequest.skuId` 为空场景，断言 `PreviewService` 按商品维度查询管理配置侧并向 `MarketingRuntimePreviewClient` 发送不含 `skuId` 的运行侧请求。
- [x] 在 `PreviewServiceTest.java` 覆盖 `PreviewQueryRequest.scopeType` 作为可选过滤条件的场景，断言 `scopeType` 仅缩小候选活动，不改变 `productId` / `skuId` 的查询优先级与 `querySummary` 回显内容。
## Phase 3: Mock 与测试数据准备
- [x] 在 `PreviewServiceTest.java` mock `PreviewQueryMapper` 与 `MarketingRuntimePreviewClient` 返回双侧命中数据，断言 `PreviewResponseDTO.managementResult`、`runtimeResult`、`querySummary` 与 `PreviewActivityDTO.sourceSide` 正确映射 `activityId`、`activityName`、`status`、`toolType`、`thresholdAmount`、`discountAmount`、`discountRate`、`maxDiscount`、`couponTemplateId`、`regionCode`、`productId`、`skuId`、`scopeType`。
- [x] 在 `PreviewServiceTest.java` 构造“管理配置侧命中、用户运行侧未命中”的 mock 数据，断言 `diffHints` 至少包含同步延迟、未上线或运行侧未生效方向，且 `managementResult` 不因运行侧未命中被清空。
- [x] 在 `PreviewServiceTest.java` 构造“双侧都未命中”的 mock 数据，断言 `managementResult`、`runtimeResult` 返回空结果但保持成功响应，并生成商品未绑定、区域不一致或配置未生效等排查提示。
- [x] 在 `ActivityPreviewIntegrationTest.java` 使用 H2 向 `t_activity` 与 `t_activity_scope` 插入同区域的商品级、SKU 级、已删除和跨区域数据，验证 `PreviewQueryMapper` 只返回 `is_deleted = 0`、`region_code` 匹配且符合 `productId` / `skuId` 条件的记录。
- [x] 在 `ActivityPreviewIntegrationTest.java` 准备 `ONLINE`、`APPROVED`、`PAUSED` 等不同状态活动数据，验证 `PreviewQueryMapper` 或 `PreviewService` 输出顺序优先展示更接近生效状态的活动，并保留活动核心优惠字段。
- [x] 在 `MarketingRuntimePreviewClientTest.java` 通过可控 stub HTTP 响应或可替换客户端 mock 验证 `MarketingRuntimePreviewClient` 发送的请求体包含 `regionCode`、`operator`、`productId`、`skuId`、`scopeType`，并能把运行侧返回解析到 `RuntimePreviewResponse` 与内部 DTO。
## Phase 4: 异常路径与回归覆盖
- [x] 在 `PreviewServiceTest.java` 覆盖 `MarketingRuntimePreviewClient` 超时、连接失败和非成功响应场景，断言 `PreviewService` 保留管理配置侧结果、将 `runtimeResult` 标记为不可用并补充“运行侧暂不可达”提示，而不是返回系统异常。
- [x] 在 `PreviewControllerTest.java` 覆盖运行侧降级响应透传场景，断言 `POST /api/preview/activity-hit` 仍返回 `200` 与成功结构，且 `runtimeResult`、`diffHints` 中包含降级说明。
- [x] 在 `ActivityPreviewIntegrationTest.java` 覆盖 `scopeType` 过滤、区域不匹配、`t_activity_scope.is_deleted = 1`、`t_activity.is_deleted = 1` 与无命中数据场景，验证管理配置侧查询不会把无效绑定或跨区域活动误判为命中。
- [x] 复跑 `src/test/java/com/ump/marketing/integration/ProductScopeIntegrationTest.java`，确认新增 `PreviewQueryMapper`、`PreviewService`、`MarketingRuntimePreviewClient` 不影响既有 `/api/product/queryByScope` 的商品绑定与运行态范围查询行为。
- [x] 复跑 `src/test/java/com/ump/marketing/web/controller/ActivityControllerTest.java` 与 `src/test/java/com/ump/marketing/integration/ActivityLifecycleIntegrationTest.java`，确认新增预览接口与配置不影响活动删除接口、生命周期流转和现有 `GlobalExceptionHandler` 行为。
## Phase 5: Maven 执行与报告校验
- [x] 执行 `mvn test -Dtest=PreviewControllerTest,PreviewServiceTest,ActivityPreviewIntegrationTest,MarketingRuntimePreviewClientTest`，确认新增预览测试类在本地独立运行通过；若客户端测试类命名有调整，同步修正命令中的测试类列表。
- [x] 执行 `mvn test -Dtest=ActivityControllerTest,ActivityServiceTest,ProductScopeIntegrationTest,ActivityLifecycleIntegrationTest`，校验 `PreviewController`、`PreviewService`、`PreviewQueryMapper` 引入后既有控制器、服务和集成测试回归通过。
- [x] 执行 `mvn test`，检查 `target/surefire-reports` 中 `PreviewControllerTest`、`PreviewServiceTest`、`ActivityPreviewIntegrationTest`、`MarketingRuntimePreviewClientTest` 无失败、无错误，且不存在异常跳过增长。
- [x] 执行 `mvn spring-boot:run -Dspring-boot.run.profiles=test`，结合 `src/main/resources/static/index.html`、`app.js`、`styles.css` 对预览入口做一次本地联调，确认商品维度、SKU 维度、命中结果展示、未命中空状态与双侧差异提示均可加载且不依赖外部 `marketing` 服务。
- [x] 检查 Maven 控制台与 `target/surefire-reports` 日志，确认不存在 `Connection refused`、外部 `marketing` 调用、H2 schema 初始化失败或 `RuleValidator` 参数校验漏测后，再将该清单同步给后续测试代码生成节点。
