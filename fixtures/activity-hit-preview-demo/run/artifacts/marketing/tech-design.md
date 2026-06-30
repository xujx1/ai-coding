# marketing 技术方案

## 1. 项目根目录
- `/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing`
- 项目形态为 Maven 单模块 Spring Boot 2.7 + MyBatis 后端，当前对外 REST 入口仅见 `web/controller/CouponController.java` 的 `/api/coupon/use`，预览能力需要补一个新的只读查询接口。
- 本期在 `marketing` 侧只实现用户运行侧命中预览能力，供 `marketing-admin` 调用；不实现管理台页面、管理配置侧聚合、多活动最优优惠、订单实付试算、批量预览和审批/上线流程改造。

## 2. 影响范围
- `web/controller`：新增运行侧预览 Controller，沿用 `RpcResult` 和 `GlobalExceptionHandler` 的统一响应/异常格式，对 `marketing-admin` 暴露只读查询接口。
- `api/dto`：新增运行侧预览请求和响应 DTO，补齐 `regionCode`、`scopeType`、`productId`、`skuId`、`operator`、命中列表、未命中原因码、同步诊断字段；不建议直接复用 `QueryScopeRequest`，因为它只覆盖基础 scope 查询，不包含预览结果展示和诊断口径。
- `application/service`：新增独立的运行侧预览服务，复用现有 `ProductService.queryActivitiesByScope` 的分表查询思路、`ShardingRouter` 的路由能力、`ScopeKeyGenerator` 的 scopeKey 算法和 `LocalCache` 的黑名单过滤，但把结果拼装、活动信息补齐和未命中原因归因从 `ProductService` 中隔离出来，避免影响正式核销链路。
- `infrastructure/mapper`：扩展 `ScopeActivityMapper` 读取运行时活动命中明细和非 ONLINE 状态明细，按需要补 `ActivityMapper` 的批量查询或状态查询能力；若要求运行侧返回逐活动的商品/SKU命中条件，则还要读取 `ActivityScopeMapper` 做补充映射。
- `resources/mapper`：`ScopeActivityMapper.xml` 需要补只读 SQL；`schema.sql` / `schema-mysql.sql` 原则上不新增表和字段，继续复用现有 `t_scope_act_00` 到 `t_scope_act_15`、`t_activity`、`t_sync_event_log`、`t_idempotency_record`、`t_operation_audit_log`。
- `test`：补服务级单测、Controller 契约测试和 H2 集成测试，覆盖 SKU 优先、商品维度、区域隔离、黑名单过滤、同步未生效和空结果场景。
- 不涉及前端改造；该项目的实现面为 `backend + contract + e2e`，与澄清 MRD 的归属一致。

## 3. 主要改动文件候选
- `src/main/java/com/ump/marketing/web/controller/RuntimePreviewController.java`：新增运行侧命中预览 HTTP 入口，建议提供 `POST /api/runtime-preview/query`。
- `src/main/java/com/ump/marketing/application/service/RuntimePreviewService.java`：新增预览应用服务，负责参数归一化、scopeKey 计算、分表查询、黑名单过滤、结果拼装和未命中诊断。
- `src/main/java/com/ump/marketing/api/dto/RuntimePreviewRequest.java`：新增请求 DTO，承接 `regionCode`、`scopeType`、`productId`、`skuId`、`operator` 等字段，并明确 `skuId` 非空时按 SKU 维度预览。
- `src/main/java/com/ump/marketing/api/dto/RuntimePreviewResponse.java`：新增响应 DTO，包含 `hit`、`matchedDimension`、`activities`、`missReasonCodes`、`syncHints` 等字段。
- `src/main/java/com/ump/marketing/api/dto/RuntimePreviewHitDTO.java`：新增命中活动展示 DTO，返回活动 ID、活动名称、状态、玩法类型、优惠门槛、优惠值、区域、scopeKey 和命中维度。
- `src/main/java/com/ump/marketing/api/enums/ScopeType.java`：补商品维度常量或补一个归一化映射，统一管理端与运行端对“商品维度 / SKU 维度”字符串的理解，避免同条件生成不同 scopeKey。
- `src/main/java/com/ump/marketing/domain/service/ScopeKeyGenerator.java`：如需兼容商品维度别名，可在这里集中处理 scopeType 归一化，保证 `marketing-admin` 和 `marketing` 的计算口径一致。
- `src/main/java/com/ump/marketing/application/service/ProductService.java`：可抽出已有 `queryActivitiesByScope` 的通用读取逻辑，避免新服务重复实现分表查询和黑名单过滤。
- `src/main/java/com/ump/marketing/infrastructure/mapper/ScopeActivityMapper.java`：新增按 scopeKey 查询全部状态、按多个 activityId 查询或按 scopeKey 查询最近同步明细的 Mapper 方法。
- `src/main/resources/mapper/ScopeActivityMapper.xml`：补充上述查询 SQL，继续基于 `t_scope_act_${tableSuffix}` 动态分表。
- `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java`：按首版复杂度可继续逐条 `selectByActivityId` 补齐活动名称和状态；若命中列表可能较长，建议补 `selectByActivityIds` 避免 N+1。
- `src/main/java/com/ump/marketing/infrastructure/mapper/SyncEventLogMapper.java`：如需输出“同步未完成 / DLQ 待处理”诊断，补按 `aggregateId`、`regionCode`、`eventType` 读取最近同步日志的方法。
- `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityScopeMapper.java`：如果运行侧结果必须返回逐活动的商品或 SKU 命中条件，补按 `scopeKey` 或 `activityId` 的只读查询，用于从本地镜像绑定表补齐展示字段。
- `src/test/java/com/ump/marketing/application/service/RuntimePreviewServiceTest.java`：新增服务单测。
- `src/test/java/com/ump/marketing/integration/RuntimePreviewIntegrationTest.java`：新增 H2 集成测试，复用 `BaseIntegrationTest` 的 Spring 上下文和区域初始化。
- `src/test/java/com/ump/marketing/web/controller/RuntimePreviewControllerTest.java`：新增接口契约测试，验证请求校验和统一错误响应。

## 4. 接口 / 数据 / 配置影响
- 建议新增运行侧接口 `POST /api/runtime-preview/query`，返回类型保持 `RpcResult<RuntimePreviewResponse>`，供 `marketing-admin` 聚合后展示双侧结果。
- 请求字段建议包含 `requestId`、`regionCode`、`operator`、`scopeType`、`productId`、`skuId`；如果仍复用 `BaseRequest`，建议只做格式校验而不写入 `t_idempotency_record`，避免查询接口产生额外持久化写流量。
- 查询规则按澄清 MRD 固定为：`skuId` 非空时按 SKU 维度计算 scopeKey；`skuId` 为空时按商品维度计算 scopeKey；本期不在 `marketing` 侧 silently 混合配置侧候选活动。
- 运行侧命中主数据来源为 `t_scope_act_00` 到 `t_scope_act_15`；表路由继续使用 `ShardingRouter.routeScopeActTable(regionCode, scopeKey)`，命中判断仍以运行表的 ONLINE 数据为准。
- 结果展示字段中，`activityId`、`toolType`、优惠门槛、优惠值、`regionCode` 可直接来自 `t_scope_act_xx`；`activityName`、活动当前状态可通过 `t_activity` 补齐。
- 当前 `t_scope_act_xx` 只保存 `scope_key`，不保存原始 `productId` / `skuId`；如果页面要求运行侧逐活动回显命中商品或 SKU 条件，需要额外读取 `t_activity_scope` 镜像表，或在响应中明确该字段为“本次查询条件”。
- 未命中时建议返回结构化原因码而不是系统异常，例如 `NO_RUNTIME_MATCH`、`RUNTIME_NOT_ONLINE`、`FORCE_OFFLINE_BLACKLISTED`、`SYNC_PENDING_OR_DLQ`；这些原因只代表运行侧观察结果，真正的双侧差异解释由 `marketing-admin` 展示层承接。
- 若需要暴露“同步未完成”提示，可基于 `t_sync_event_log` 最近一条相关事件的 `consume_status`、`error_message`、`retry_count` 推导提示文案，不新增 Kafka topic 和同步链路。
- 默认不改 `application.yml`、端口、健康检查和数据源配置；本期重点是新增只读查询接口和只读 SQL。

## 5. 实施步骤
1. 定义 `RuntimePreviewRequest`、`RuntimePreviewResponse`、`RuntimePreviewHitDTO` 等契约，固定商品维度与 SKU 维度的输入口径，并在 DTO 或领域辅助方法中完成基础参数校验。
2. 在 `ScopeType` 或独立归一化方法中明确商品维度与 SKU 维度的常量映射，保证 `marketing-admin` 和 `marketing` 依据同一 `scopeType` 生成相同的 scopeKey。
3. 新增 `RuntimePreviewService`，封装 `scopeKey` 计算、分表路由、`ScopeActivityMapper` 查询、`LocalCache` 黑名单过滤和 `RpcResult` 结果组装。
4. 扩展 `ScopeActivityMapper` / `ScopeActivityMapper.xml`，在保留现有 `selectActiveByScopeKey` 的同时补一个“查询指定 scopeKey 全量状态”的只读 SQL，用于区分“完全无数据”和“有数据但未 ONLINE”。
5. 在结果拼装阶段补活动详情读取；首版可复用 `ActivityMapper.selectByActivityId` 逐条补齐 `activityName` 和状态，若后续压测发现放大，再补批量查询方法。
6. 如果产品要求运行侧结果中逐活动显示命中商品或 SKU 条件，则补 `ActivityScopeMapper` 只读查询，把 `scopeKey` 与 `productId` / `skuId` 建立映射；如果不要求逐活动回显，则在响应中直接回传本次查询维度和输入值。
7. 如需同步诊断，补 `SyncEventLogMapper` 最近事件查询逻辑，在“无 ONLINE 结果”时附加 `SYNC_PENDING_OR_DLQ` 之类的诊断码，但不把同步异常升级成系统错误。
8. 新增 `RuntimePreviewController` 暴露 `POST /api/runtime-preview/query`，走统一异常处理和 `RpcResult` 契约；不修改 `CouponController` 现有核销入口。
9. 完成单元测试、Controller 契约测试和 H2 集成测试，并与 `marketing-admin` 按最终请求/响应结构联调双侧预览页面。

## 6. 测试策略
- 单元测试：覆盖 `scopeType` 归一化、`skuId` 非空时的 SKU 优先规则、商品维度 scopeKey 生成、黑名单过滤、未命中原因归因和响应组装。
- 服务测试：模拟 `ScopeActivityMapper`、`ActivityMapper`、`SyncEventLogMapper` 返回值，验证命中列表排序、空结果、运行表存在非 ONLINE 状态、同步待重试和黑名单场景。
- Controller 契约测试：使用 `MockMvc` 或同等方式验证请求参数缺失、非法 body、正常响应结构以及 `GlobalExceptionHandler` 的 `INVALID_ARGUMENT` 返回。
- H2 集成测试：新增 `RuntimePreviewIntegrationTest`，直接写入 `t_scope_act_xx`、`t_activity`、`t_sync_event_log`，覆盖单商品预览、单 SKU 预览、区域隔离、强制下线黑名单和同步延迟提示。
- 回归测试：复跑现有 `ActivityLifecycleIntegrationTest`、`ProductScopeIntegrationTest`、`RegionIsolationIntegrationTest`，确认新增查询接口没有破坏活动生命周期、商品绑定和分表查询既有行为。
- 联调验证：与 `marketing-admin` 对齐请求字段名、`scopeType` 常量、原因码和返回字段最小集合，确保管理端无需二次猜测运行侧口径。

## 7. 风险与回滚
- `scopeType` 口径风险最高：当前代码枚举只看到 `ALL`、`CATEGORY`、`SKU_LIST`，而 MRD 需要明确“单商品 / 单 SKU”预览；如果两端使用不同商品维度字符串，会直接导致 scopeKey 不一致、预览假未命中。需要在接口契约和单测里先锁死这一点。
- 运行表字段缺口风险：`t_scope_act_xx` 没有 `activityName`、`productId`、`skuId`，因此结果展示必然依赖 `t_activity` 或 `t_activity_scope` 的补充读取；如果后续确认本项目不再维护这些镜像数据，则要把命中条件展示回退到管理端聚合层处理。
- 一致性风险：配置侧先命中、运行侧暂时无命中属于预期场景，常见原因是活动未上线、Kafka/Canal 同步未消费或 DLQ 待重试；接口必须把它当正常业务结果返回，而不是 5xx。
- 性能风险：单次预览虽然是单商品/单 SKU，但仍可能命中多个活动；如果逐条查询 `t_activity` 造成 N+1，可在第二步补批量查询 SQL。首版先保证正确性，再按联调数据量优化。
- 兼容性风险：本期新增的是只读接口，不能影响 `CouponController` 的核销路径、`ProductService` 的绑定流程和现有活动生命周期服务；实现上应优先新增类和只读 SQL，避免修改正式交易或同步主流程。
- 回滚策略：默认不做 schema 变更，回滚时只需下线 `RuntimePreviewController` 的路由或让 `marketing-admin` 停止调用新接口即可；若补了只读 SQL，也不需要数据回滚。
- 若联调中发现运行侧诊断口径不足，可以先保留“命中列表 + 空结果”最小版接口，把“同步未完成 / 非 ONLINE 原因码”降级为后续增强，不阻塞本期主链路交付。