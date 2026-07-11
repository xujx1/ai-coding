# Aftersales Service API Index

> 标准用途：接口测试、E2E 编排、技术方案入口识别。生成依据为 OpenAPI、领域配置 sampleRoutes 和源码静态路由扫描。

- 应用：ecom-aftersales
- 领域：售后域
- 接口数量：14
- 端口：4213

## 接口清单

| 路径 | 方法 | 业务用途 | 测试类型 | 造数/校验提示 |
|------|------|---------|---------|---------------|
| `/health` | GET | 服务健康检查 | 冒烟测试 | 无需业务数据 |
| `/knowledge` | GET | 返回领域知识和依赖事实 | 知识库/影响面验证 | 可直接调用作为领域事实 |
| `/sample` | GET | 返回样例业务对象 | 结果断言 | 可直接调用作为领域事实 |
| `/validate-requirement` | 待确认 | 校验需求是否命中本领域能力或依赖 | 知识库/影响面验证 | 传入需求关键词和目标应用 |
| `/aftersales` | 待确认 | 发布、生效或上架售后域业务对象 | 按场景确认 | 使用本域或上游 fixture |
| `/aftersales/:caseId/approve` | 待确认 | 发布、生效或上架售后域业务对象 | 按场景确认 | 使用本域或上游 fixture |
| `/refunds` | 待确认 | 售后域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/create-refund-case` | POST/PUT/DELETE | 创建或提交售后域业务对象 | 集成/E2E 种子步骤 | 准备aftersales order、refund request、return package最小字段 |
| `/business/list` | GET | 查询售后域业务对象状态 | 结果断言 | 使用本域或上游 fixture |
| `/business/get` | GET | 查询售后域业务对象状态 | 结果断言 | 使用本域或上游 fixture |
| `/business/approve-case` | 待确认 | 售后域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/reject-case` | 待确认 | 售后域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/mark-returned` | 待确认 | 售后域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business` | 待确认 | 售后域业务接口 | 按场景确认 | 使用本域或上游 fixture |

## 测试入口分组

### 种子/写入类接口

- `/business/create-refund-case`：用于创建、发布、提交、支付、删除或状态变更类测试数据。

### 查询/校验类接口

- `/health`：用于断言业务状态、列表结果或健康状态。
- `/knowledge`：用于断言业务状态、列表结果或健康状态。
- `/sample`：用于断言业务状态、列表结果或健康状态。
- `/business/list`：用于断言业务状态、列表结果或健康状态。
- `/business/get`：用于断言业务状态、列表结果或健康状态。

## 跨应用影响提示

- 上游依赖：trade、payment、fulfillment
- 下游消费者：inventory、finance、customer service
- 技术方案和测试用例必须从 `global/gitnexus-graph/impact-map.json` 读取最终影响面。
