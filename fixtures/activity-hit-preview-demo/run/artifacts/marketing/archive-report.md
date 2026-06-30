# marketing Archive Report

## 1. 需求摘要
- 本期目标是在 `marketing` 侧新增运行侧命中预览只读接口，供 `marketing-admin` 调用。
- 需求边界保持收敛：不改管理台页面，不改活动审批/上线流程，不改正式核销链路。
- 接口契约采用 `POST /api/runtime-preview/query`，返回 `RpcResult<RuntimePreviewResponse>`，并沿用现有统一异常处理口径。

## 2. 技术方案
- 技术方案文件：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/tech-design.md](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/tech-design.md)
- 方案核心是新增 `RuntimePreviewController`、`RuntimePreviewService` 和对应 DTO，复用 `ScopeKeyGenerator`、`ShardingRouter`、`LocalCache`、`ScopeActivityMapper` 等现有能力。
- 运行侧预览以只读查询为主，补充活动详情、黑名单过滤、同步诊断和未命中原因码，避免影响交易链路。

## 3. 变更文件
### 3.1 业务代码
- `src/main/java/com/ump/marketing/api/dto/RuntimePreviewHitDTO.java` - modified
- `src/main/java/com/ump/marketing/api/dto/RuntimePreviewRequest.java` - modified
- `src/main/java/com/ump/marketing/api/dto/RuntimePreviewResponse.java` - modified
- `src/main/java/com/ump/marketing/api/enums/ScopeType.java` - modified
- `src/main/java/com/ump/marketing/application/service/ProductService.java` - modified
- `src/main/java/com/ump/marketing/application/service/RuntimePreviewService.java` - added
- `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityMapper.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/mapper/ActivityScopeMapper.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/mapper/ScopeActivityMapper.java` - modified
- `src/main/java/com/ump/marketing/infrastructure/mapper/SyncEventLogMapper.java` - modified
- `src/main/java/com/ump/marketing/web/controller/CouponController.java` - modified
- `src/main/java/com/ump/marketing/web/controller/GlobalExceptionHandler.java` - modified
- `src/main/java/com/ump/marketing/web/controller/RuntimePreviewController.java` - modified
- `src/main/resources/mapper/ScopeActivityMapper.xml` - modified

### 3.2 测试代码
- `src/test/java/com/ump/marketing/application/service/ActivityServiceTest.java`
- `src/test/java/com/ump/marketing/application/service/RuntimePreviewServiceTest.java`
- `src/test/java/com/ump/marketing/domain/ActivityStateMachineTest.java`
- `src/test/java/com/ump/marketing/domain/CouponStateMachineTest.java`
- `src/test/java/com/ump/marketing/domain/OrderOccupyTest.java`
- `src/test/java/com/ump/marketing/domain/RuleValidatorTest.java`
- `src/test/java/com/ump/marketing/domain/ScopeKeyGeneratorTest.java`
- `src/test/java/com/ump/marketing/integration/ActivityLifecycleIntegrationTest.java`
- `src/test/java/com/ump/marketing/integration/BaseIntegrationTest.java`
- `src/test/java/com/ump/marketing/integration/CouponLifecycleIntegrationTest.java`
- `src/test/java/com/ump/marketing/integration/DlqIntegrationTest.java`
- `src/test/java/com/ump/marketing/integration/ProductScopeIntegrationTest.java`
- `src/test/java/com/ump/marketing/integration/QuotaIntegrationTest.java`
- `src/test/java/com/ump/marketing/integration/RegionIsolationIntegrationTest.java`
- `src/test/java/com/ump/marketing/integration/RuntimePreviewIntegrationTest.java`
- `src/test/java/com/ump/marketing/web/controller/RuntimePreviewControllerTest.java`

### 3.3 产物清单
- `artifacts/marketing/changed-files.json`
- `artifacts/marketing/test-file-list.md`
- `artifacts/marketing/test-report.md`
- `artifacts/marketing/code-review.md`
- `artifacts/marketing/review-findings.json`
- `artifacts/marketing/surefire-summary.json`
- `artifacts/marketing/openspec/changes/run-pdrby_ai59-marketing/design.md`
- `artifacts/marketing/openspec/changes/run-pdrby_ai59-marketing/proposal.md`
- `artifacts/marketing/openspec/changes/run-pdrby_ai59-marketing/specs/marketing/spec.md`
- `artifacts/marketing/openspec/changes/run-pdrby_ai59-marketing/tasks.md`

## 4. 实现结果
- 新增运行侧命中预览入口，支持按商品维度或 SKU 维度查询命中活动。
- 新增独立的预览服务，封装 scopeKey 计算、运行表查询、黑名单过滤、活动详情补齐和同步诊断逻辑。
- 扩展 mapper 和 XML，只读查询能力覆盖运行表全状态、活动详情、活动绑定和同步事件日志。
- 保持原有 `/api/coupon/use` 核销接口不变，避免对交易链路产生回归影响。
- 补齐请求校验、统一错误返回和预览结果 DTO，便于 `marketing-admin` 直接消费。

## 5. 代码评审结果
- 评审文件：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/code-review.md](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/code-review.md)
- 结论：`WARN`
- 说明：自动代码评审在超时阈值内未稳定返回完整报告，流水线生成了兜底评审产物。
- 复核建议：后续归档或人工验收时，重新检查 `RuntimePreviewController` 相关细节。

## 6. 测试结果
- 测试报告：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/test-report.md](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/test-report.md)
- Surefire 汇总：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/surefire-summary.json](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/surefire-summary.json)
- 结果：`15` 个测试类，`74` 个用例，`74` 通过，`0` 失败，`0` 错误，`0` 跳过。
- 结论：`mvn test` 成功，测试通过率 `100%`，当前未发现回归失败。
- 备注：未生成 JaCoCo XML，因此本次未提供覆盖率数据。

## 7. 已知问题与限制
- 代码评审结论是 `WARN`，不是阻塞，但仍建议人工复核 `RuntimePreviewController` 和相关契约。
- 当前测试报告未生成 JaCoCo 覆盖率 XML，无法给出行/分支覆盖率。
- 归档节点记录到的部分 Maven 输出存在前后状态差异，但最终测试汇总显示成功，且 `surefire-summary.json` 与 `test-report.md` 一致。
- 运行侧预览依赖现有运行表和活动镜像数据，若上游同步不足，可能出现业务可接受的空结果或诊断提示。

## 8. 残余工作
- 与 `marketing-admin` 对齐最终请求字段、原因码和返回字段展示口径。
- 如后续压测发现活动详情补齐存在 N+1 风险，再考虑进一步批量查询优化。
- 如需覆盖率门禁，补充 JaCoCo 配置或增量覆盖率脚本。
- 对 `WARN` 评审项做一次人工复核。

## 9. 下一步建议
1. 进行一次端到端联调，确认 `POST /api/runtime-preview/query` 的请求和返回字段能被 `marketing-admin` 直接消费。
2. 补一轮人工代码审查，重点看 `RuntimePreviewController`、`RuntimePreviewService` 和异常处理分支。
3. 若需要质量门禁，接入 JaCoCo 覆盖率输出并把覆盖率纳入后续归档报告。

## 10. 流水线执行指标
### 10.1 总览
- Run ID：`PDRbY_AI59`
- 项目：`marketing`
- 节点数量：`8`
- 工具调用总数：`1809`
- 工具调用累计耗时：`8m 22s`
- Token 消耗：输入 `10677294` / 输出 `111925` / 合计 `10789219`

### 10.2 节点执行摘要
| 节点 | 状态 | 节点耗时 | 失败/重试次数 | Agent 数 | 工具调用次数 | 工具累计耗时 | 工具失败次数 | 输入 Token | 输出 Token | Token 合计 |
|------|------|----------|---------------|---------|--------------|--------------|--------------|------------|------------|------------|
| Upload / Init | completed | 11ms | 0 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| 需求拆解 | completed | 3m 23s | 0 | 2 | 6 | 13ms | 0 | 22010 | 2289 | 24299 |
| 实施方案 | completed | 6m 54s | 0 | 1 | 83 | 368ms | 0 | 532108 | 5116 | 537224 |
| SPEC生成 | completed | 7m 59s | 0 | 2 | 121 | 1.1s | 4 | 617860 | 7228 | 625088 |
| Java Impl | completed | 6m 51s | 5 | 21 | 871 | 4m 9s | 9 | 4406235 | 51903 | 4458138 |
| Test Code Generate | completed | 17.3s | 5 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| 跨应用测试 | completed | 69ms | 0 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| Archive | running | 64ms | 0 | 2 | 26 | 299ms | 1 | 106687 | 3508 | 110195 |

### 10.3 工具耗时明细
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

### 10.4 失败与重试统计
| 节点 | 失败/重试次数 |
|------|---------------|
| Upload / Init | 0 |
| 需求拆解 | 0 |
| 实施方案 | 0 |
| SPEC生成 | 0 |
| Java Impl | 5 |
| Test Code Generate | 5 |
| 跨应用测试 | 0 |
| Archive | 0 |

## 11. 交付物引用
- 需求与实现依据：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/tech-design.md](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/tech-design.md)
- 变更清单：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/changed-files.json](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/changed-files.json)
- 测试文件清单：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/test-file-list.md](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/test-file-list.md)
- 测试报告：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/test-report.md](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/test-report.md)
- 代码评审：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/code-review.md](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/code-review.md)
- 评审结论：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/review-findings.json](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/review-findings.json)
- Surefire 汇总：[/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/surefire-summary.json](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/artifacts/marketing/surefire-summary.json)

## 流水线执行指标

- Run ID：PDRbY_AI59
- 项目：marketing
- 节点数量：8
- 工具调用总数：1820
- 工具调用累计耗时：8m 22s
- Token 消耗：输入 10780120 / 输出 115170 / 合计 10895290

| 节点 | 状态 | 节点耗时 | 失败/重试次数 | Agent 数 | 工具调用次数 | 工具累计耗时 | 工具失败次数 | 输入 Token | 输出 Token | Token 合计 |
|------|------|----------|---------------|---------|--------------|--------------|--------------|------------|------------|------------|
| Upload / Init | completed | 11ms | 0 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| 需求拆解 | completed | 3m 23s | 0 | 2 | 6 | 13ms | 0 | 22010 | 2289 | 24299 |
| 实施方案 | completed | 6m 54s | 0 | 1 | 83 | 368ms | 0 | 532108 | 5116 | 537224 |
| SPEC生成 | completed | 7m 59s | 0 | 2 | 121 | 1.1s | 4 | 617860 | 7228 | 625088 |
| Java Impl | completed | 6m 51s | 5 | 21 | 871 | 4m 9s | 9 | 4406235 | 51903 | 4458138 |
| Test Code Generate | completed | 17.3s | 5 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| 跨应用测试 | completed | 69ms | 0 | 0 | 0 | 0ms | 0 | 0 | 0 | 0 |
| Archive | running | 1m 54s | 0 | 3 | 37 | 553ms | 1 | 209513 | 6753 | 216266 |

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
| archive | glob | 4 | 99ms | 0 |
| archive | read_file | 28 | 410ms | 1 |
| archive | write_file | 3 | 43ms | 0 |
| archive | review_artifact | 2 | 1ms | 0 |
