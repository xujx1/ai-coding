# ecom 数据地图

> Stage 04 集成测试和造数会读取本文件。表归属、字段含义和清理顺序必须尽量明确。

## 数据实体总览

| 实体 | 所属应用 | 主表 | 关联表 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| 售后 | `ecom-aftersales` | aftersales_cases | payload_json 承载扩展字段 | `refund-aftersales` | confirmed |
| 内容 | `ecom-content` | content_items | payload_json 承载扩展字段 | `catalog-publish` | confirmed |
| 运营后台 | `ecom-console` | 无 | 通过 HTTP 调用目标服务，不持久化业务数据 | `campaign-stock-guard` | confirmed |
| 客服 | `ecom-customer-service` | customer_service_tickets | payload_json 承载扩展字段 | `refund-aftersales` | confirmed |
| 结算 | `ecom-finance` | finance_settlements | payload_json 承载扩展字段 | `settlement-reconcile` | confirmed |
| 履约 | `ecom-fulfillment` | fulfillment_orders | payload_json 承载扩展字段 | `checkout-fulfillment` | confirmed |
| 库存 | `ecom-inventory` | inventory_stocks | payload_json 承载扩展字段 | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 活动库存保护 | `ecom-inventory` | inventory_campaign_protections | payload_json 承载扩展字段 | `campaign-stock-guard` | confirmed |
| 物流 | `ecom-logistics` | logistics_waybills | payload_json 承载扩展字段 | `checkout-fulfillment` | confirmed |
| 营销活动 | `ecom-marketing` | marketing_campaigns | payload_json 承载扩展字段 | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 商家 | `ecom-merchant` | merchant_shops | payload_json 承载扩展字段 | `catalog-publish`, `settlement-reconcile` | confirmed |
| 支付 | `ecom-payment` | payment_orders | payload_json 承载扩展字段 | `checkout-fulfillment`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| 商品 | `ecom-product` | product_skus | payload_json 承载扩展字段 | `catalog-publish`, `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 供应链 | `ecom-supply-chain` | supply_chain_purchase_orders | payload_json 承载扩展字段 | `catalog-publish` | confirmed |
| 订单 | `ecom-trade` | trade_orders | payload_json 承载扩展字段 | `campaign-stock-guard`, `checkout-fulfillment`, `refund-aftersales` | confirmed |
| 用户 | `ecom-user` | user_profiles | payload_json 承载扩展字段 | `checkout-fulfillment` | confirmed |

## ecom-aftersales

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `aftersales_cases` | 售后单、退款金额、原因与审批状态 | `id` | id, order_id, order_line_id, amount_cent, reason, status, payload_json, created_at | `ecom-aftersales` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `aftersales_cases` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `aftersales_cases` | `order_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `aftersales_cases` | `order_line_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `aftersales_cases` | `amount_cent` | `BIGINT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `aftersales_cases` | `reason` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `aftersales_cases` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `aftersales_cases` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `aftersales_cases` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `aftersales_cases` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-refund-case` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-console

### 表清单

`ecom-console` 是运营后台静态页面，不持有持久化业务表。`stockGuardCampaign` 通过 HTTP 调用 `ecom-product`、`ecom-inventory` 和 `ecom-marketing` 完成演示造数、活动创建和活动启用。

### 造数提示

- 不直接写库；通过目标服务接口创建 SKU、设置库存、创建活动和启用活动。
- 集成测试造数以 `integration-test/data-plan.md` 和目标服务 seed SQL 为准。

### 清理提示

- 不直接清理库表；清理动作由 `ecom-marketing`、`ecom-inventory` 和 `ecom-product` 的 cleanup SQL 或接口完成。

## ecom-content

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `content_items` | 商品内容素材绑定、审核与驳回 | `id` | id, author_user_id, sku_id, title, body, status, payload_json, created_at | `ecom-content` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `content_items` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `content_items` | `author_user_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `content_items` | `sku_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `content_items` | `title` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `content_items` | `body` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `content_items` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `content_items` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `content_items` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `content_items` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-post` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-customer-service

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `customer_service_tickets` | 客服工单、用户问题与处理状态 | `id` | id, user_id, type, biz_ref, description, status, payload_json, created_at | `ecom-customer-service` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `customer_service_tickets` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `customer_service_tickets` | `user_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `customer_service_tickets` | `type` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `customer_service_tickets` | `biz_ref` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `customer_service_tickets` | `description` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `customer_service_tickets` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `customer_service_tickets` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `customer_service_tickets` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `customer_service_tickets` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-ticket` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-finance

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `finance_settlements` | 支付结算记录、商家结算周期与结算状态 | `id` | id, payment_id, merchant_id, amount_cent, period, status, payload_json, created_at | `ecom-finance` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `finance_settlements` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `finance_settlements` | `payment_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `finance_settlements` | `merchant_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `finance_settlements` | `amount_cent` | `BIGINT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `finance_settlements` | `period` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `finance_settlements` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `finance_settlements` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `finance_settlements` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `finance_settlements` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/record-payment` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-fulfillment

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `fulfillment_orders` | 履约单、包裹拆分、发货与妥投状态 | `id` | id, order_id, warehouse_id, package_count, status, payload_json, created_at, updated_at | `ecom-fulfillment` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `fulfillment_orders` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `fulfillment_orders` | `order_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `fulfillment_orders` | `warehouse_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `fulfillment_orders` | `package_count` | `INT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `fulfillment_orders` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `fulfillment_orders` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `fulfillment_orders` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `fulfillment_orders` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-fulfillment` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-inventory

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `inventory_stocks` | 库存行、可售数量与预占扣减释放 | `id` | id, sku_id, warehouse_id, quantity, available_quantity, status, payload_json, created_at | `ecom-inventory` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `inventory_stocks` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `inventory_stocks` | `sku_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `inventory_stocks` | `warehouse_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `inventory_stocks` | `quantity` | `INT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `inventory_stocks` | `available_quantity` | `INT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `inventory_stocks` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `inventory_stocks` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `inventory_stocks` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `inventory_stocks` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 活动库存保护表

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `inventory_campaign_protections` | 活动库存保护、活动启用和幂等释放 | `id` | id, campaign_id, sku_id, protected_quantity, status, payload_json, created_at, updated_at | `ecom-inventory` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `inventory_campaign_protections` | `id` | `VARCHAR(128)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 campaignId + skuId 清理 |
| `inventory_campaign_protections` | `campaign_id` | `VARCHAR(64)` | 领域属性 | 按流程输入提供或使用默认值 | 按 campaignId + skuId 清理 |
| `inventory_campaign_protections` | `sku_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 campaignId + skuId 清理 |
| `inventory_campaign_protections` | `protected_quantity` | `INT` | 领域属性 | 按流程输入提供或使用默认值 | 按 campaignId + skuId 清理 |
| `inventory_campaign_protections` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 campaignId + skuId 清理 |
| `inventory_campaign_protections` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 campaignId + skuId 清理 |
| `inventory_campaign_protections` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 campaignId + skuId 清理 |
| `inventory_campaign_protections` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 campaignId + skuId 清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/set-stock` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-logistics

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `logistics_waybills` | 运单创建、承运信息与签收状态 | `id` | id, package_id, carrier, address, status, payload_json, created_at, updated_at | `ecom-logistics` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `logistics_waybills` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `logistics_waybills` | `package_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `logistics_waybills` | `carrier` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `logistics_waybills` | `address` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `logistics_waybills` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `logistics_waybills` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `logistics_waybills` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `logistics_waybills` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-waybill` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-marketing

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `marketing_campaigns` | 营销活动、优惠额度、活动配额与预占核销 | `id` | id, name, sku_id, discount_cent, quota, protected_stock, status, payload_json, created_at | `ecom-marketing` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `marketing_campaigns` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `name` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `sku_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `discount_cent` | `BIGINT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `quota` | `INT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `protected_stock` | `INT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `marketing_campaigns` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-campaign` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-merchant

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `merchant_shops` | 商家店铺资质、审核与店铺资料 | `id` | id, shop_id, merchant_name, qualification_no, shop_name, status, payload_json, created_at | `ecom-merchant` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `merchant_shops` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `merchant_shops` | `shop_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `merchant_shops` | `merchant_name` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `merchant_shops` | `qualification_no` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `merchant_shops` | `shop_name` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `merchant_shops` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `merchant_shops` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `merchant_shops` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `merchant_shops` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-merchant` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-payment

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `payment_orders` | 支付单创建、支付成功标记与退款支付记录 | `id` | id, order_id, amount_cent, channel, status, payload_json, created_at, updated_at | `ecom-payment` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `payment_orders` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `payment_orders` | `order_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `payment_orders` | `amount_cent` | `BIGINT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `payment_orders` | `channel` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `payment_orders` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `payment_orders` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `payment_orders` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `payment_orders` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-payment` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-product

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `product_skus` | 商品 SKU 与售卖状态管理 | `id` | id, spu_id, title, category_id, brand_id, price_cent, saleable, status | `ecom-product` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `product_skus` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `spu_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `title` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `category_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `brand_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `price_cent` | `BIGINT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `saleable` | `BOOLEAN` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `product_skus` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-sku` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-supply-chain

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `supply_chain_purchase_orders` | 采购单、质检与补货计划 | `id` | id, supplier_id, sku_id, quantity, quality_check_id, status, payload_json, created_at | `ecom-supply-chain` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `supply_chain_purchase_orders` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `supply_chain_purchase_orders` | `supplier_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `supply_chain_purchase_orders` | `sku_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `supply_chain_purchase_orders` | `quantity` | `INT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `supply_chain_purchase_orders` | `quality_check_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `supply_chain_purchase_orders` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `supply_chain_purchase_orders` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `supply_chain_purchase_orders` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `supply_chain_purchase_orders` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-purchase-order` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-trade

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `trade_orders` | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | `id` | id, user_id, sku_id, quantity, pay_amount_cent, promotion_reservation_id, stock_reservation_id, status | `ecom-trade` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `trade_orders` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `user_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `sku_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `quantity` | `INT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `pay_amount_cent` | `BIGINT` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `promotion_reservation_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `stock_reservation_id` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `trade_orders` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-order` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。

## ecom-user

### 表清单

| 表 | 业务含义 | 主键 | 关键字段 | 写入方 | 读取方 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `user_profiles` | 用户资料、会员等级与收货地址管理 | `id` | id, mobile, member_level, address, tags, status, payload_json, created_at | `ecom-user` | 本应用接口、交易编排或集成测试 | confirmed |

### 字段口径

| 表 | 字段 | 类型 | 业务含义 | 造数要求 | 清理要求 |
| --- | --- | --- | --- | --- | --- |
| `user_profiles` | `id` | `VARCHAR(64)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `user_profiles` | `mobile` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `user_profiles` | `member_level` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `user_profiles` | `address` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `user_profiles` | `tags` | `VARCHAR(255)` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `user_profiles` | `status` | `VARCHAR(32)` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `user_profiles` | `payload_json` | `JSON` | 业务键/状态/扩展载荷 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `user_profiles` | `created_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |
| `user_profiles` | `updated_at` | `TIMESTAMP` | 领域属性 | 按流程输入提供或使用默认值 | 按 id/业务键清理 |

### 造数提示

- 最小可用数据：通过 `HTTP /business/create-user` 或 Dubbo `create(Map)` 创建业务记录。
- 关联顺序：按 `flows.md` 的流程节点顺序创建上游数据。
- 唯一键/幂等键：业务 id 字段；全局 requestId 待确认。
- 环境差异：demo 使用本地 schema.sql 和 HTTP/Dubbo 端口，真实环境 schema/catalog 待确认。

### 清理提示

- 清理业务键：id、orderId、skuId、campaignId、stockId、paymentId 等测试业务键。
- 清理顺序：先清理依赖子流程数据，再清理主交易/商品/用户数据。
- 风险：共享基础数据不可直接删除，必要时软删或使用测试前缀。
