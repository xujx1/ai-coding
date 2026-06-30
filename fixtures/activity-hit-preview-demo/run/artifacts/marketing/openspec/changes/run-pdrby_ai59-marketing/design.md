# marketing Design Notes

## Context
marketing 技术方案 1. 项目根目录 /Users/xu/IdeaProjects/aicoding/runtimeprojects/runs/PDRbYAI59/workspace/project/marketing 项目形态为 Maven 单模块 Spring Boot 2.7 + MyBatis 后端，当前对外 REST 入口仅见 web/controller/CouponController.java 的 /api/coupon/use，预览能力需要补一个新的只读查询接口。 本期在 marketing 侧只实现用户运行侧命中预览能力，供 marketingadmin 调用；不实现管理台页面、管理配置侧聚合、多活动最优优惠、订单实付试算、批量预览和审批/上线流程改造。 2. 影响范围 web/controller：新增运行侧预览 Controller，沿用 RpcResult 和 GlobalExceptionHandler 的统一响应/异常格式，对 marketingadmin 暴露只读查询接口。 api/dto：新增运行侧预览请求和响应 DTO，补齐 regionCode、scopeType、productId、skuId、operator、命中列表、未命中原因码、同步诊断字段；不建议直接复用 QueryScopeRequest，因为它只覆盖基础 scope 查询，不包含预览结果展示和诊断口径。 application/service：新增独立的运行侧预览服务，复用现有 ProductService.queryActivitiesByScope 的分表查询思路、ShardingRouter 的路由能力、ScopeKeyGenerator 的 scopeKey 算法和 LocalCache 的黑名单过滤，但把结果拼装、活动信息补齐和未命中原因归因从 Pro...

## Execution Model
- `spec-generate` creates this OpenSpec change from project-scoped task artifacts.
- `java-impl` consumes development tasks and marks development checkboxes complete after code changes.
- `testcode-generate` consumes test tasks and marks test checkboxes complete after test generation and Maven execution.

## Node Contracts
- Dynamic execution nodes use the registered planner node contracts for required inputs, produced artifacts, and task completion updates.