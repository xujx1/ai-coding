# Inventory Service API Index

> 标准用途：接口测试、E2E 编排、技术方案入口识别。生成依据为 OpenAPI、领域配置 sampleRoutes 和源码静态路由扫描。

- 应用：ecom-inventory
- 领域：库存域
- 接口数量：15
- 端口：4215

## 接口清单

| 路径 | 方法 | 业务用途 | 测试类型 | 造数/校验提示 |
|------|------|---------|---------|---------------|
| `/health` | GET | 服务健康检查 | 冒烟测试 | 无需业务数据 |
| `/knowledge` | GET | 返回领域知识和依赖事实 | 知识库/影响面验证 | 可直接调用作为领域事实 |
| `/sample` | GET | 返回样例业务对象 | 结果断言 | 可直接调用作为领域事实 |
| `/validate-requirement` | 待确认 | 校验需求是否命中本领域能力或依赖 | 知识库/影响面验证 | 传入需求关键词和目标应用 |
| `/stocks/:skuId` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/reservations` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/reservations/:reservationId/release` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/set-stock` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/list` | GET | 查询库存域业务对象状态 | 结果断言 | 使用本域或上游 fixture |
| `/business/get` | GET | 查询库存域业务对象状态 | 结果断言 | 使用本域或上游 fixture |
| `/business/reserve-stock` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/release-reservation` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/deduct-reservation` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/return-stock` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business` | 待确认 | 库存域业务接口 | 按场景确认 | 使用本域或上游 fixture |

## 测试入口分组

### 种子/写入类接口

- 未发现显式种子接口，造数需使用数据库或上游接口。

### 查询/校验类接口

- `/health`：用于断言业务状态、列表结果或健康状态。
- `/knowledge`：用于断言业务状态、列表结果或健康状态。
- `/sample`：用于断言业务状态、列表结果或健康状态。
- `/business/list`：用于断言业务状态、列表结果或健康状态。
- `/business/get`：用于断言业务状态、列表结果或健康状态。

## 跨应用影响提示

- 上游依赖：product、trade、aftersales
- 下游消费者：fulfillment、supply chain
- 技术方案和测试用例必须从 `global/gitnexus-graph/impact-map.json` 读取最终影响面。
