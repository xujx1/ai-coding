# marketing-admin 技术方案

## 1. 项目根目录
- 项目根目录：`/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin`
- 技术形态：单 Maven 模块 Spring Boot 2.7 应用，后端接口与静态前端同仓。
- 现有前端入口位于 `src/main/resources/static/`，当前首页由 [src/main/resources/static/index.html](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/resources/static/index.html:1)、[src/main/resources/static/app.js](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/resources/static/app.js:1)、[src/main/resources/static/styles.css](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/resources/static/styles.css:1) 组成。
- 现有后端主干包结构已具备 `api`、`application`、`infrastructure`、`web` 四层，适合按现有分层新增预览能力。

## 2. 影响范围
- 前端：在现有静态管理台首页新增“活动命中预览”入口和结果区，不新增独立前端工程，优先在 `app.js` 中扩展单页交互。
- 管理端接口：新增预览聚合接口，对运营暴露单次查询能力，负责参数校验、管理配置侧查询、运行侧调用、差异提示聚合。
- 管理配置侧查询：基于 `t_activity` 与 `t_activity_scope` 生成管理侧命中结果，补齐活动名称、状态、玩法、优惠核心字段、区域、命中条件。
- 运行侧结果消费：不复用本项目现有 `/api/product/queryByScope` 作为最终口径，按 MRD 边界新增一个运行侧客户端，消费 `marketing` 提供的正式运行态预览接口。
- 展示契约：新增双侧结果、空状态、排查提示和差异说明 DTO，供页面一次性渲染。
- 配置：新增运行侧服务地址与超时配置；不改数据库 schema。
- 测试：新增控制器测试、服务单测、H2 集成测试，以及运行侧客户端的桩实现验证。

## 3. 主要改动文件候选
- 复用现有控制器与服务边界：
- [src/main/java/com/ump/marketing/web/controller/ProductController.java](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/java/com/ump/marketing/web/controller/ProductController.java:1)
- [src/main/java/com/ump/marketing/application/service/ProductService.java](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/java/com/ump/marketing/application/service/ProductService.java:1)
- [src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java:1)
- [src/main/java/com/ump/marketing/infrastructure/mapper/ActivityScopeMapper.java](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/java/com/ump/marketing/infrastructure/mapper/ActivityScopeMapper.java:1)
- [src/main/resources/mapper/ScopeActivityMapper.xml](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/resources/mapper/ScopeActivityMapper.xml:1)
- 新增管理台预览接口与聚合服务：
- `src/main/java/com/ump/marketing/web/controller/PreviewController.java`
- `src/main/java/com/ump/marketing/application/service/PreviewService.java`
- 新增请求/响应 DTO：
- `src/main/java/com/ump/marketing/api/dto/PreviewQueryRequest.java`
- `src/main/java/com/ump/marketing/api/dto/PreviewResponseDTO.java`
- `src/main/java/com/ump/marketing/api/dto/PreviewSideResultDTO.java`
- `src/main/java/com/ump/marketing/api/dto/PreviewActivityDTO.java`
- `src/main/java/com/ump/marketing/api/dto/PreviewHintDTO.java`
- 新增管理配置侧查询能力：
- `src/main/java/com/ump/marketing/infrastructure/mapper/PreviewQueryMapper.java`
- `src/main/resources/mapper/PreviewQueryMapper.xml`
- 说明：这里建议新建独立 Mapper，而不是继续堆叠到 `ActivityMapper` / `ActivityScopeMapper` 注解 SQL 中，因为预览查询需要 SKU 优先、商品维度回退、活动与绑定关系联表、状态排序，XML 更适合表达动态条件。
- 新增运行侧客户端与配置：
- `src/main/java/com/ump/marketing/infrastructure/client/MarketingRuntimePreviewClient.java`
- `src/main/java/com/ump/marketing/infrastructure/client/dto/RuntimePreviewRequest.java`
- `src/main/java/com/ump/marketing/infrastructure/client/dto/RuntimePreviewResponse.java`
- `src/main/java/com/ump/marketing/infrastructure/config/PreviewRuntimeConfig.java`
- `src/main/java/com/ump/marketing/infrastructure/config/PreviewRuntimeProperties.java`
- 前端页面改造：
- [src/main/resources/static/index.html](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/resources/static/index.html:1)
- [src/main/resources/static/app.js](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/resources/static/app.js:1)
- [src/main/resources/static/styles.css](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/main/resources/static/styles.css:1)
- 测试文件候选：
- `src/test/java/com/ump/marketing/web/controller/PreviewControllerTest.java`
- `src/test/java/com/ump/marketing/application/service/PreviewServiceTest.java`
- `src/test/java/com/ump/marketing/integration/ActivityPreviewIntegrationTest.java`
- 如运行侧客户端需要隔离验证，可增加 `src/test/java/com/ump/marketing/infrastructure/client/MarketingRuntimePreviewClientTest.java`

## 4. 接口 / 数据 / 配置影响
- 新增管理台聚合接口：`POST /api/preview/activity-hit`
- 请求建议复用 `BaseRequest` 公共字段：`requestId`、`caller`、`operator`、`regionCode`、`idempotencyKey`、`timestampMs`
- 请求业务字段建议包含：`productId`、`skuId`、`scopeType`
- 请求校验规则：
- `regionCode`、`operator`、`idempotencyKey` 必填，沿用现有 `BaseRequest` + `RuleValidator.validateRegionCode()` 校验模式。
- `productId` 必填，`skuId` 可选。
- `skuId` 非空时按 SKU 维度优先，管理侧查询和运行侧请求都以 SKU 为主；`skuId` 为空时按商品维度查询。
- `scopeType` 建议作为可选过滤条件，只用于缩小候选活动；若业务后续定义与现有表中 `scope_type` 语义不一致，应在契约中显式区分“查询维度”和“活动配置范围类型”。
- 响应建议为单次聚合结果：
- `managementResult`：管理配置侧是否命中、命中活动列表、空状态提示、排查建议。
- `runtimeResult`：运行侧是否命中、命中活动列表、运行侧原始状态或原因口径。
- `diffHints`：双侧差异说明，例如“管理侧命中但运行侧未命中，可能未上线、同步延迟或运行侧未生效”。
- `querySummary`：回显本次查询条件，便于页面展示和日志排查。
- 命中活动最小展示字段建议统一到 `PreviewActivityDTO`：`activityId`、`activityName`、`status`、`toolType`、`thresholdAmount`、`discountAmount`、`discountRate`、`maxDiscount`、`couponTemplateId`、`regionCode`、`productId`、`skuId`、`scopeType`、`sourceSide`。
- 管理配置侧数据来源：
- 主表使用 `t_activity`，读取 `activity_name`、`status`、`tool_type`、`threshold_amount`、`discount_amount`、`discount_rate`、`max_discount`、`coupon_template_id`、`region_code`。
- 绑定关系使用 `t_activity_scope`，读取 `product_id`、`sku_id`、`scope_type`、`activity_id`，并过滤 `is_deleted = 0`。
- 推荐查询逻辑：SKU 查询时优先匹配 `sku_id = ?`；商品查询时匹配 `product_id = ?`；都需要按 `region_code` 过滤，并关联活动的 `is_deleted = 0`。
- 运行侧数据来源：
- 正式口径由 `marketing` 项目接口返回，`marketing-admin` 只消费其命中结果与原因说明。
- 本项目现有 `ProductService.queryActivitiesByScope()` 和 `t_scope_act_${tableSuffix}` 仅适合作为内部历史实现或测试桩，不建议作为本期对运营暴露的正式“用户运行侧”答案，因为其当前字段不足以稳定提供活动名称与明确原因口径。
- 数据库影响：
- 不新增表、不新增字段、不修改现有 DDL。
- 需要新增联表查询 SQL 或 Mapper XML，但不涉及 schema 变更。
- 配置影响：
- 在 `application.yml` / `application-test.yml` 中新增运行侧服务配置，例如 `preview.runtime.base-url`、`preview.runtime.connect-timeout-ms`、`preview.runtime.read-timeout-ms`。
- `test` profile 需要提供本地假地址或以 `@MockBean` / stub client 覆盖，避免集成测试依赖外部 `marketing` 进程。
- 日志与异常：
- 预览未命中属于正常业务结果，不返回系统异常。
- 运行侧调用失败时，建议管理侧结果仍可返回，`runtimeResult` 标记为不可用，并附加“运行侧暂不可达”的提示；避免因为下游抖动让整个页面完全不可用。

## 5. 实施步骤
1. 新增 `PreviewQueryRequest`、`PreviewResponseDTO` 等接口契约，固定请求字段、双侧结果结构、排查提示字段和最小活动展示字段。
2. 新增 `PreviewController` 与 `PreviewService`，把参数校验、SKU 优先选择、查询编排、差异提示生成收口到单一服务，不污染现有 `ActivityService` / `ProductService` 生命周期逻辑。
3. 新增管理配置侧查询 Mapper，使用 `t_activity` + `t_activity_scope` 生成管理侧命中结果；SKU 非空时先查 SKU 绑定，再按需要补充商品级绑定规则，排序时优先展示 `ONLINE`、`APPROVED`、`PAUSED` 等更接近生效状态的活动。
4. 新增运行侧客户端与配置类，调用 `marketing` 提供的运行态预览接口；客户端只做协议转换和错误封装，不在客户端内实现命中规则。
5. 在 `PreviewService` 中实现双侧聚合逻辑：
- 管理侧有命中、运行侧无命中时输出同步延迟、未上线、运行侧未生效等提示。
- 双侧都未命中时输出商品未绑定、区域不一致、配置未生效等通用排查方向。
- 运行侧超时或失败时保留管理侧结果，并给出“运行侧结果暂不可用”的降级说明。
6. 改造静态首页，在现有 `app.js` 中新增“活动命中预览”导航、表单、结果卡片和空状态区；结果区至少分为“管理配置侧”“用户运行侧”“差异提示”三块。
7. 调整 `styles.css`，补齐双栏结果卡片、空状态、命中列表、差异提示和移动端折叠样式，确保桌面端与移动端都能加载和查看结果。
8. 补充测试：控制器校验、服务分支、H2 管理侧查询、运行侧客户端桩、前端手工联调。
9. 联调完成后，如 `marketing` 契约字段名或错误口径与预期不一致，只调整客户端适配层和 DTO 映射，避免反复侵入页面与聚合服务。

## 6. 测试策略
- 控制器测试：新增 `PreviewControllerTest`，沿用现有 [src/test/java/com/ump/marketing/web/controller/ActivityControllerTest.java](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/test/java/com/ump/marketing/web/controller/ActivityControllerTest.java:1) 的 MockMvc 风格，覆盖必填校验、SKU 优先请求、下游失败时的响应结构。
- 服务单测：新增 `PreviewServiceTest`，mock 管理侧 Mapper 和运行侧客户端，覆盖以下分支：
- SKU 命中且商品命中同时存在时，只按 SKU 维度为主输出。
- 管理侧命中、运行侧未命中，生成差异提示。
- 双侧都未命中，返回空状态与排查建议。
- 运行侧超时或异常，返回管理侧结果和降级提示。
- 管理侧查询集成测试：新增 `ActivityPreviewIntegrationTest`，基于现有 [src/test/java/com/ump/marketing/integration/BaseIntegrationTest.java](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing-admin/src/test/java/com/ump/marketing/integration/BaseIntegrationTest.java:1) 的 H2 基座，插入活动与范围绑定，验证 `t_activity` + `t_activity_scope` 查询结果正确。
- 运行侧消费测试：对客户端做适配层测试，验证请求体、超时处理、异常映射和返回 DTO 解析；集成测试中使用 stub client 替代真实 HTTP 调用。
- 页面联调测试：本地启动 `mvn spring-boot:run -Dspring-boot.run.profiles=test` 后，在浏览器校验以下场景：
- 输入商品 ID 且不填 SKU，能得到商品维度结果。
- 输入 SKU 后，页面明确展示按 SKU 维度预览。
- 命中时展示活动核心字段，未命中时展示空状态与排查提示。
- 管理侧与运行侧结果不一致时，差异提示可见。
- 回归关注点：不能影响现有活动创建、商品绑定、生命周期操作和 `/api/product/queryByScope` 既有行为。

## 7. 风险与回滚
- 风险：`marketing` 运行侧预览接口的路径、字段、错误码和原因口径当前未在本仓代码中体现，属于外部契约依赖。
- 应对：把外部依赖封装在 `MarketingRuntimePreviewClient` 中，聚合层只依赖内部 DTO；契约变化时只改适配层。
- 风险：当前本项目已有 `ProductService.queryActivitiesByScope()`，团队容易误把它当正式运行态答案，但其字段口径不足且与 MRD 归属不一致。
- 应对：在方案和代码命名上明确“runtime client”为正式来源，现有本地 scope 查询仅作内部能力或测试桩。
- 风险：预览输入里的“活动范围类型”与表中 `scope_type` 的业务语义可能不完全一致。
- 应对：将 `scopeType` 先设计为可选过滤字段，并在接口注释和联调文档里标明最终语义；若联调发现不一致，优先调整 DTO 命名和映射，不改表结构。
- 风险：管理侧与运行侧天然存在最终一致性差异，运营可能把差异误判为系统错误。
- 应对：页面默认把“未命中”和“结果不一致”定义为正常业务结果，并提供明确排查提示，不直接抛系统异常。
- 风险：运行侧不可达时，若接口整体失败，会降低页面可用性。
- 应对：预览接口支持部分降级，优先保证管理配置侧结果可看；同时记录告警日志，便于排查下游服务状态。
- 回滚策略：
- 后端回滚时只需下线 `PreviewController` 新接口或在网关层禁用该入口，不影响现有活动管理主流程。
- 前端回滚时可隐藏预览入口和结果区，保留既有活动设置页面。
- 由于不涉及数据库 schema 变更，回滚不需要 DDL 逆操作；新增配置项删除后恢复默认启动即可。