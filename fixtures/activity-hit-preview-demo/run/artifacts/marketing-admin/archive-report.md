# marketing-admin 归档报告

## 1. 需求摘要
本次流水线围绕 `marketing-admin` 的“活动命中预览”能力展开，目标是在现有 Spring Boot 2.7 单模块项目中新增一个管理台预览入口，支持按商品或 SKU 维度查询活动命中结果，并同时展示管理配置侧、用户运行侧和差异提示，便于运营快速排查命中差异。

PRD：未找到 `artifacts/prd.md`。

## 2. 技术方案
技术方案来源：流水线输入中的《marketing-admin 技术方案》与《marketing-admin 开发任务清单》。

核心设计点：
- 在现有静态单页中扩展“活动命中预览”入口，不拆分独立前端工程。
- 新增 `POST /api/preview/activity-hit` 聚合接口。
- 管理配置侧基于 `t_activity` + `t_activity_scope` 联表查询。
- 运行侧通过独立 client 消费 `marketing` 的正式预览接口。
- 配置项新增 `preview.runtime.*`，不修改数据库 schema。
- 结果层统一为双侧结果、空状态提示和差异说明 DTO。

## 3. 文件变更
### 已修改/新增的项目文件
- `src/main/java/com/ump/marketing/api/dto/PreviewActivityDTO.java` - modified
- `src/main/java/com/ump/marketing/api/dto/PreviewHintDTO.java` - modified
- `src/main/java/com/ump/marketing/api/dto/PreviewQueryRequest.java` - modified
- `src/main/java/com/ump/marketing/api/dto/PreviewResponseDTO.java` - modified
- `src/main/java/com/ump/marketing/api/dto/PreviewSideResultDTO.java` - modified
- `src/main/java/com/ump/marketing/application/service/PreviewService.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/client/dto/RuntimePreviewRequest.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/client/dto/RuntimePreviewResponse.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/client/MarketingRuntimePreviewClient.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/client/PreviewRuntimeClientException.java` - added
- `src/main/java/com/ump/marketing/infrastructure/config/PreviewRuntimeConfig.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/config/PreviewRuntimeProperties.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/mapper/PreviewQueryMapper.java` - modified
- `src/main/java/com/ump/marketing/web/controller/PreviewController.java` - modified
- `src/main/resources/application-test.yml` - modified
- `src/main/resources/application.yml` - modified
- `src/main/resources/mapper/PreviewQueryMapper.xml` - modified
- `src/main/resources/static/app.js` - modified
- `src/main/resources/static/styles.css` - modified

### 变更范围概括
- 新增预览接口与聚合服务。
- 新增管理侧查询 mapper 与 XML。
- 新增运行侧 client、配置和异常封装。
- 改造静态首页交互和样式。
- 补充测试环境配置。

## 4. 实现内容
### 后端
- 新增 `PreviewController` 暴露 `POST /api/preview/activity-hit`。
- 新增 `PreviewService` 负责编排参数校验、SKU 优先判断、管理侧查询、运行侧调用和差异提示生成。
- 新增 `PreviewQueryMapper` 与 `PreviewQueryMapper.xml`，实现 `t_activity` 与 `t_activity_scope` 的联表查询和动态筛选。
- 新增 `MarketingRuntimePreviewClient` 作为运行侧预览接口适配层。
- 新增 `PreviewRuntimeConfig` 与 `PreviewRuntimeProperties`，完成运行侧地址与超时配置绑定。
- 新增 `PreviewRuntimeClientException` 用于封装运行侧调用异常。

### 前端
- 在现有单页中新增“活动命中预览”导航、表单、管理侧结果区、运行侧结果区、差异提示区与空状态区。
- 更新 `app.js`，支持预览请求构造、响应渲染与 SKU / 商品维度展示。
- 更新 `styles.css`，补齐双栏结果卡片、空状态和移动端布局。

### 配置
- 在 `application.yml` 和 `application-test.yml` 中补齐 `preview.runtime.*` 配置。
- 保持数据库 schema 不变，仅通过查询层扩展能力。

## 5. 测试结果
### Maven 测试
- 执行结果：成功
- 命令：`mvn test`
- 退出码：`0`
- 测试类数量：`17`
- 测试用例总数：`89`
- 通过：`89`
- 失败：`0`
- 错误：`0`
- 跳过：`0`
- 通过率：`100%`
- 总耗时：`5.788s`

### 覆盖率
- 未生成 JaCoCo XML，未采集行、分支、方法和类覆盖率。
- 当前仅能确认 Maven 单测全绿，无法给出精确覆盖率数值。

### 测试文件
测试文件清单见 `artifacts/marketing-admin/test-file-list.md`。

## 6. 代码评审结果
评审结论：`WARN`。

说明：自动代码评审在超时阈值内未稳定返回完整报告，流水线基于已完成实现编译结果生成了兜底评审产物。当前已知的归档风险主要来自后续人工复核不足，而不是已确认的阻塞缺陷。

评审关注范围：
- `src/main/java/com/ump/marketing/application/service/PreviewService.java`
- `src/main/resources/mapper/PreviewQueryMapper.xml`

## 7. 已知问题与限制
- 外部运行侧 `marketing` 接口契约未在本仓完整固化，当前通过 client 适配层隔离，后续若字段或错误口径变化，需要调整适配层。
- 当前测试未产出 JaCoCo 覆盖率报告，无法给出精确覆盖率门禁结论。
- 代码评审为 `WARN`，说明仍建议在联调或人工验收中复核 `PreviewService` 与 SQL 口径。
- 运行侧不可达时采用降级返回，保留管理侧结果，这意味着页面可用性优先，但也会出现“部分结果不可用”的业务态。

## 8. 残余工作
- 联调 `marketing` 运行侧正式预览接口，确认路径、字段、错误码和原因口径。
- 如有需要，补充 `PreviewControllerTest`、`PreviewServiceTest`、`ActivityPreviewIntegrationTest`、`MarketingRuntimePreviewClientTest` 的覆盖边界说明或扩展用例。
- 若后续启用覆盖率门禁，需要补充 JaCoCo 配置与报告产物。
- 在浏览器中对商品维度、SKU 维度、命中、未命中、降级和差异提示进行一次完整人工验收。

## 9. 交付产物
- 变更清单：`artifacts/marketing-admin/changed-files.json`
- 测试报告：`artifacts/marketing-admin/test-report.md`
- 测试文件清单：`artifacts/marketing-admin/test-file-list.md`
- 归档报告：`artifacts/marketing-admin/archive-report.md`

## 10. 流水线执行指标
### 总览
- Run ID：`PDRbY_AI59`
- 项目：`marketing-admin`
- 节点数量：`8`
- 工具调用总数：`1804`
- 工具调用累计耗时：`8m 22s`
- Token 消耗：输入 `11353337` / 输出 `124593` / 合计 `11477930`

### 节点指标
| 节点 | 状态 | 节点耗时 | 失败/重试次数 | Agent 数 | 工具调用次数 | 工具累计耗时 | 工具失败次数 | 输入 Token | 输出 Token | Token 合计 |
|------|------|----------|---------------|---------|--------------|--------------|--------------|------------|------------|------------|
| Upload / Init | completed | 11ms | 0 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| 需求拆解 | completed | 3m 23s | 0 | 2 | 6 | 13ms | 0 | 22010 | 2289 | 24299 |
| 实施方案 | completed | 6m 54s | 0 | 1 | 83 | 368ms | 0 | 563009 | 4939 | 567948 |
| SPEC生成 | completed | 7m 59s | 0 | 2 | 121 | 1.1s | 4 | 392083 | 6356 | 398439 |
| Java Impl | completed | 6m 51s | 5 | 21 | 871 | 4m 9s | 9 | 6050943 | 54713 | 6105656 |
| Test Code Generate | completed | 12.2s | 5 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| 跨应用测试 | completed | 25ms | 0 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| Archive | running | 1m 27s | 0 | 0 | 21 | 285ms | 1 | 0 | 0 | 0 |

### 工具耗时明细
| 节点 | 工具 | 调用次数 | 累计耗时 | 失败次数 |
|------|------|----------|----------|----------|
| mrd-render | read_file | 2 | 4ms | 0 |
| mrd-render | glob | 1 | 2ms | 0 |
| mrd-render | write_file | 3 | 7ms | 0 |
| implementation-plan | read_file | 58 | 274ms | 0 |
| implementation-plan | glob | 6 | 36ms | 0 |
| implementation-plan | grep | 15 | 50ms | 0 |
| implementation-plan | write_file | 2 | 6ms | 0 |
| implementation-plan | review_artifact | 2 | 2ms | 0 |
| spec-generate | read_file | 85 | 730ms | 4 |
| spec-generate | glob | 11 | 199ms | 0 |
| spec-generate | grep | 20 | 155ms | 0 |
| spec-generate | write_file | 4 | 14ms | 0 |
| spec-generate | review_artifact | 1 | 1ms | 0 |
| java-impl | glob | 49 | 532ms | 0 |
| java-impl | read_file | 649 | 4.2s | 3 |
| java-impl | grep | 62 | 192ms | 0 |
| java-impl | write_file | 21 | 206ms | 0 |
| java-impl | edit_file | 71 | 618ms | 2 |
| java-impl | maven_compile | 19 | 4m 3s | 4 |
| backend-test | read_file | 435 | 2.7s | 1 |
| backend-test | glob | 83 | 902ms | 0 |
| backend-test | grep | 59 | 279ms | 0 |
| backend-test | write_file | 8 | 9ms | 0 |
| backend-test | edit_file | 6 | 11ms | 0 |
| backend-test | maven_compile | 7 | 21.4s | 0 |
| backend-test | maven_test | 20 | 3m 42s | 2 |
| frontend-impl | glob | 10 | 270ms | 0 |
| frontend-impl | read_file | 61 | 548ms | 0 |
| frontend-impl | grep | 4 | 31ms | 0 |
| frontend-impl | edit_file | 6 | 12ms | 0 |
| frontend-impl | write_file | 2 | 3ms | 0 |
| frontend-impl | maven_compile | 1 | 3.1s | 0 |
| archive | glob | 2 | 49ms | 0 |
| archive | read_file | 18 | 228ms | 1 |
| archive | write_file | 1 | 8ms | 0 |

### 失败与重试汇总
- 总失败/重试次数：见节点指标中的“失败/重试次数”和“工具失败次数”。
- 归档节点工具失败次数：`1`。
- 其余节点失败集中在实现与测试阶段的自动化工具调用，不影响最终测试结论。

## 11. 结论
本次 `marketing-admin` 归档已完成。项目实现了活动命中预览的后端聚合能力、运行侧适配、前端展示和配置接入；单元测试已通过，当前主要残余风险是运行侧外部契约联调与覆盖率产物缺失。

## 流水线执行指标

- Run ID：PDRbY_AI59
- 项目：marketing-admin
- 节点数量：8
- 工具调用总数：1809
- 工具调用累计耗时：8m 22s
- Token 消耗：输入 11427868 / 输出 126781 / 合计 11554649

| 节点 | 状态 | 节点耗时 | 失败/重试次数 | Agent 数 | 工具调用次数 | 工具累计耗时 | 工具失败次数 | 输入 Token | 输出 Token | Token 合计 |
|------|------|----------|---------------|---------|--------------|--------------|--------------|------------|------------|------------|
| Upload / Init | completed | 11ms | 0 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| 需求拆解 | completed | 3m 23s | 0 | 2 | 6 | 13ms | 0 | 22010 | 2289 | 24299 |
| 实施方案 | completed | 6m 54s | 0 | 1 | 83 | 368ms | 0 | 563009 | 4939 | 567948 |
| SPEC生成 | completed | 7m 59s | 0 | 2 | 121 | 1.1s | 4 | 392083 | 6356 | 398439 |
| Java Impl | completed | 6m 51s | 5 | 21 | 871 | 4m 9s | 9 | 6050943 | 54713 | 6105656 |
| Test Code Generate | completed | 12.2s | 5 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| 跨应用测试 | completed | 25ms | 0 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| Archive | running | 2m 40s | 0 | 1 | 26 | 299ms | 1 | 74531 | 2188 | 76719 |

### 工具耗时明细

| 节点 | 工具 | 调用次数 | 累计耗时 | 失败次数 |
|------|------|----------|----------|----------|
| mrd-render | read_file | 2 | 4ms | 0 |
| mrd-render | glob | 1 | 2ms | 0 |
| mrd-render | write_file | 3 | 7ms | 0 |
| implementation-plan | read_file | 58 | 274ms | 0 |
| implementation-plan | glob | 6 | 36ms | 0 |
| implementation-plan | grep | 15 | 50ms | 0 |
| implementation-plan | write_file | 2 | 6ms | 0 |
| implementation-plan | review_artifact | 2 | 2ms | 0 |
| spec-generate | read_file | 85 | 730ms | 4 |
| spec-generate | glob | 11 | 199ms | 0 |
| spec-generate | grep | 20 | 155ms | 0 |
| spec-generate | write_file | 4 | 14ms | 0 |
| spec-generate | review_artifact | 1 | 1ms | 0 |
| java-impl | glob | 49 | 532ms | 0 |
| java-impl | read_file | 649 | 4.2s | 3 |
| java-impl | grep | 62 | 192ms | 0 |
| java-impl | write_file | 21 | 206ms | 0 |
| java-impl | edit_file | 71 | 618ms | 2 |
| java-impl | maven_compile | 19 | 4m 3s | 4 |
| backend-test | read_file | 435 | 2.7s | 1 |
| backend-test | glob | 83 | 902ms | 0 |
| backend-test | grep | 59 | 279ms | 0 |
| backend-test | write_file | 8 | 9ms | 0 |
| backend-test | edit_file | 6 | 11ms | 0 |
| backend-test | maven_compile | 7 | 21.4s | 0 |
| backend-test | maven_test | 20 | 3m 42s | 2 |
| frontend-impl | glob | 10 | 270ms | 0 |
| frontend-impl | read_file | 61 | 548ms | 0 |
| frontend-impl | grep | 4 | 31ms | 0 |
| frontend-impl | edit_file | 6 | 12ms | 0 |
| frontend-impl | write_file | 2 | 3ms | 0 |
| frontend-impl | maven_compile | 1 | 3.1s | 0 |
| archive | glob | 2 | 49ms | 0 |
| archive | read_file | 21 | 234ms | 1 |
| archive | write_file | 2 | 15ms | 0 |
| archive | review_artifact | 1 | 1ms | 0 |
