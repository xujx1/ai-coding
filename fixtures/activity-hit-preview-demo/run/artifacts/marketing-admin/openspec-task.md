# marketing-admin 开发任务清单

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