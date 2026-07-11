# Trade Service API Index

> 标准用途：接口测试、E2E 编排、技术方案入口识别。生成依据为 OpenAPI、领域配置 sampleRoutes 和源码静态路由扫描。

- 应用：ecom-trade
- 领域：交易域
- 接口数量：17
- 端口：4211

## 接口清单

| 路径 | 方法 | 业务用途 | 测试类型 | 造数/校验提示 |
|------|------|---------|---------|---------------|
| `/health` | GET | 服务健康检查 | 冒烟测试 | 无需业务数据 |
| `/knowledge` | GET | 返回领域知识和依赖事实 | 知识库/影响面验证 | 可直接调用作为领域事实 |
| `/sample` | GET | 返回样例业务对象 | 结果断言 | 可直接调用作为领域事实 |
| `/validate-requirement` | 待确认 | 校验需求是否命中本领域能力或依赖 | 知识库/影响面验证 | 传入需求关键词和目标应用 |
| `/carts/:userId` | 待确认 | 交易域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/orders` | POST/PUT/DELETE | 交易域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/orders/:orderId/state` | POST/PUT/DELETE | 交易域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/create-order` | POST/PUT/DELETE | 创建或提交交易域业务对象 | 集成/E2E 种子步骤 | 准备cart、order、order line最小字段 |
| `/business/demo-checkout` | 待确认 | 交易域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/demo-cancel` | POST/PUT/DELETE | 删除、取消或失效交易域业务对象 | 集成/E2E 种子步骤 | 先创建可删除/可取消对象，再执行清理 |
| `/business/demo-full-chain` | 待确认 | 交易域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/list` | GET | 查询交易域业务对象状态 | 结果断言 | 使用本域或上游 fixture |
| `/business/get` | GET | 查询交易域业务对象状态 | 结果断言 | 使用本域或上游 fixture |
| `/business/confirm-paid` | 待确认 | 交易域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/cancel-order` | POST/PUT/DELETE | 删除、取消或失效交易域业务对象 | 集成/E2E 种子步骤 | 先创建可删除/可取消对象，再执行清理 |
| `/business/complete-order` | POST/PUT/DELETE | 交易域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business` | 待确认 | 交易域业务接口 | 按场景确认 | 使用本域或上游 fixture |

## 测试入口分组

### 种子/写入类接口

- `/orders`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/orders/:orderId/state`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/create-order`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/demo-cancel`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/cancel-order`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/complete-order`：用于创建、发布、提交、支付、删除或状态变更类测试数据。

### 查询/校验类接口

- `/health`：用于断言业务状态、列表结果或健康状态。
- `/knowledge`：用于断言业务状态、列表结果或健康状态。
- `/sample`：用于断言业务状态、列表结果或健康状态。
- `/business/list`：用于断言业务状态、列表结果或健康状态。
- `/business/get`：用于断言业务状态、列表结果或健康状态。

## 跨应用影响提示

- 上游依赖：product、user、marketing、inventory
- 下游消费者：payment、fulfillment、aftersales、finance
- 技术方案和测试用例必须从 `global/gitnexus-graph/impact-map.json` 读取最终影响面。
