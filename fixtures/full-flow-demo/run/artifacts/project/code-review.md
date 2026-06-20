# 代码评审报告

## 1. 评审结论
- 结果：`WARN`
- 阻断问题数量：0
- 警告问题数量：1
- 建议数量：1

## 2. 阻断问题
- 无。

## 3. 警告问题
- 文件：`src/main/java/com/ump/marketing/web/controller/GlobalExceptionHandler.java:27`
  - 问题：`GlobalExceptionHandler` 试图通过 `request.getAttribute("requestId")` 回填响应中的 `requestId`，但本次评审范围内未看到任何过滤器、拦截器或控制器代码在请求进入时设置该属性，`extractRequestId` 大概率始终返回 `null`。
  - 影响：删除接口在 `@Valid` 校验失败、请求体缺失或 `IllegalArgumentException` 场景下，返回体中的 `requestId` 会丢失，和 PRD 中“统一返回 `requestId`”的口径不一致，问题排查与幂等请求关联会变差。
  - 修复建议：在进入 Controller 前统一解析并写入 `requestId` 到 `HttpServletRequest` 属性，或在异常处理器里直接从请求体/请求头中提取；如果做不到，应明确该类异常场景下不保证返回 `requestId`，避免产生伪一致性。
  - 回退节点：`java-impl`

## 4. 建议
- 文件：`src/main/java/com/ump/marketing/application/service/ActivityService.java:667`
  - `deleteActivity` 已有 `@Valid` 入参校验，同时又保留了 `validateDeleteRequest` 的手工校验，存在两套校验路径。建议统一为一套机制，避免后续字段规则调整时出现 Controller 与 Service 行为不一致。

## 5. 总体说明
- 本次按 `changed-files manifest` 与 `code-preview manifest` 读取了 5 个变更文件，并补充核对了删除链路依赖的 `ActivityMapper`、`IdempotencyService`、`AuditService`、`RpcResult`、`ErrorCode`。
- 在本次变更范围内，未发现 Quality Gates 中的阻断项：未见 SQL 注入、资源泄漏、线程池误用、非 public 事务、事务内 RPC/HTTP 调用、硬编码密钥、吞异常、明显空指针风险、Redis 无 TTL、`SELECT *` 新增问题。
- 删除主流程整体满足软删除、状态约束、幂等预占与完成、审计记录等核心口径；当前主要风险在于参数校验异常场景下的 `requestId` 回传不稳定。
- 未运行测试，结论基于清单与代码预览静态审查。

结果：WARN