# project 测试代码生成报告

Updated tests in [ActivityServiceTest.java](/private/tmp/ai-coding-real-marketing-confirm-flow-4301/runs/XOjoDRmUAx/workspace/project/src/test/java/com/ump/marketing/application/service/ActivityServiceTest.java) and [ActivityControllerTest.java](/private/tmp/ai-coding-real-marketing-confirm-flow-4301/runs/XOjoDRmUAx/workspace/project/src/test/java/com/ump/marketing/web/controller/ActivityControllerTest.java).

`ActivityControllerTest` now matches the current implementation: it registers [GlobalExceptionHandler.java](/private/tmp/ai-coding-real-marketing-confirm-flow-4301/runs/XOjoDRmUAx/workspace/project/src/main/java/com/ump/marketing/web/controller/GlobalExceptionHandler.java), verifies controller pass-through for success / illegal state / not found / idempotency conflict, and checks `@Valid` failure paths for missing `activityId`, `regionCode`, `idempotencyKey`, `operator`, and missing body without invoking `ActivityService`. `ActivityServiceTest` was extended with a `null` request case to cover the current manual validation branch in `deleteActivity`.

Changed test files:
- [src/test/java/com/ump/marketing/application/service/ActivityServiceTest.java](/private/tmp/ai-coding-real-marketing-confirm-flow-4301/runs/XOjoDRmUAx/workspace/project/src/test/java/com/ump/marketing/application/service/ActivityServiceTest.java)
- [src/test/java/com/ump/marketing/web/controller/ActivityControllerTest.java](/private/tmp/ai-coding-real-marketing-confirm-flow-4301/runs/XOjoDRmUAx/workspace/project/src/test/java/com/ump/marketing/web/controller/ActivityControllerTest.java)

Verification result:
- `mvn compile -DskipTests=true`: passed
- `mvn test-compile -DskipTests=true`: passed

I did not run `mvn test`; only compile and test-compile verification were executed as requested by the tooling requirement.