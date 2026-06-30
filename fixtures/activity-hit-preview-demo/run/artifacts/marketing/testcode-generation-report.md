# marketing 测试代码生成报告

Expanded the existing runtime preview test suite in two places; no production code changed.

- [ScopeKeyGeneratorTest](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing/src/test/java/com/ump/marketing/domain/ScopeKeyGeneratorTest.java:63) now covers preview `scopeType` alias normalization (`spu`, `product-id`, `sku-list`, `sku_id`) and rejection of unsupported values with the expected `IllegalArgumentException`.
- [RuntimePreviewControllerTest](/Users/xu/IdeaProjects/ai-coding/runtime-projects/runs/PDRbY_AI59/workspace/project/marketing/src/test/java/com/ump/marketing/web/controller/RuntimePreviewControllerTest.java:122) now covers `POST /api/runtime-preview/query` with invalid `scopeType`, asserting the `RpcResult` error contract (`success=false`, `code=40001`, expected message, `requestId` preserved).

Verification completed in `marketing` with `mvn compile -DskipTests=true`, targeted `mvn -Dtest=RuntimePreviewServiceTest,RuntimePreviewControllerTest,RuntimePreviewIntegrationTest test`, and full `mvn test`. Surefire summaries are: `RuntimePreviewServiceTest` 7/0/0/0, `RuntimePreviewControllerTest` 6/0/0/0, `RuntimePreviewIntegrationTest` 4/0/0/0, and `ScopeKeyGeneratorTest` 11/0/0/0, with no skips or failures.