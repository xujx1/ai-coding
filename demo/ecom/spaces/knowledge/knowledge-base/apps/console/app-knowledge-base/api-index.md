# console API Index

> 标准用途：接口测试、E2E 编排、技术方案入口识别。生成依据为 OpenAPI、领域配置 sampleRoutes 和源码静态路由扫描。

- 应用：console
- 领域：console
- 接口数量：9
- 端口：待确认

## 接口清单

| 路径 | 方法 | 业务用途 | 测试类型 | 造数/校验提示 |
|------|------|---------|---------|---------------|
| `/health` | GET | 服务健康检查 | 冒烟测试 | 无需业务数据 |
| `/business/create-sku` | POST/PUT/DELETE | 创建或提交console业务对象 | 集成/E2E 种子步骤 | 准备console最小字段 |
| `/business/enable-sale` | 待确认 | 发布、生效或上架console业务对象 | 按场景确认 | 使用本域或上游 fixture |
| `/business/create-campaign` | POST/PUT/DELETE | 创建或提交console业务对象 | 集成/E2E 种子步骤 | 准备console最小字段 |
| `/business/enable-campaign` | POST/PUT/DELETE | 发布、生效或上架console业务对象 | 按场景确认 | 使用本域或上游 fixture |
| `/business/delete-campaign` | POST/PUT/DELETE | 删除、取消或失效console业务对象 | 集成/E2E 种子步骤 | 先创建可删除/可取消对象，再执行清理 |
| `/business/demo-checkout` | 待确认 | console业务接口 | 按场景确认 | 使用本域或上游 fixture |
| `/business/demo-cancel` | POST/PUT/DELETE | 删除、取消或失效console业务对象 | 集成/E2E 种子步骤 | 先创建可删除/可取消对象，再执行清理 |
| `/business/demo-full-chain` | 待确认 | console业务接口 | 按场景确认 | 使用本域或上游 fixture |

## 测试入口分组

### 种子/写入类接口

- `/business/create-sku`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/enable-sale`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/create-campaign`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/enable-campaign`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/delete-campaign`：用于创建、发布、提交、支付、删除或状态变更类测试数据。
- `/business/demo-cancel`：用于创建、发布、提交、支付、删除或状态变更类测试数据。

### 查询/校验类接口

- `/health`：用于断言业务状态、列表结果或健康状态。

## 跨应用影响提示

- 上游依赖：无
- 下游消费者：无
- 技术方案和测试用例必须从 `global/gitnexus-graph/impact-map.json` 读取最终影响面。
