# ecom 跨应用契约

> 本文件只记录跨应用契约。单应用内部方法不放入本文件，除非它是对外入口。

## 契约总览

| 契约 | 类型 | 提供方 | 消费方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `com.ecommerce.aftersales.api.AftersalesDubboService` | rpc | `ecom-aftersales` | `ecom-trade` | `refund-aftersales` | confirmed |
| `com.ecommerce.content.api.ContentDubboService` | rpc | `ecom-content` | `ecom-trade` | `catalog-publish` | confirmed |
| `com.ecommerce.customerservice.api.CustomerServiceDubboService` | rpc | `ecom-customer-service` | `ecom-trade` | `refund-aftersales` | confirmed |
| `com.ecommerce.finance.api.FinanceDubboService` | rpc | `ecom-finance` | `ecom-trade` | `settlement-reconcile` | confirmed |
| `com.ecommerce.fulfillment.api.FulfillmentDubboService` | rpc | `ecom-fulfillment` | `ecom-trade` | `checkout-fulfillment` | confirmed |
| `com.ecommerce.inventory.api.InventoryDubboService` | rpc | `ecom-inventory` | `ecom-trade` | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| `com.ecommerce.logistics.api.LogisticsDubboService` | rpc | `ecom-logistics` | `ecom-trade` | `checkout-fulfillment` | confirmed |
| `com.ecommerce.marketing.api.MarketingDubboService` | rpc | `ecom-marketing` | `ecom-trade` | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| `com.ecommerce.merchant.api.MerchantDubboService` | rpc | `ecom-merchant` | `ecom-trade` | `catalog-publish`, `settlement-reconcile` | confirmed |
| `com.ecommerce.payment.api.PaymentDubboService` | rpc | `ecom-payment` | `ecom-trade` | `checkout-fulfillment`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `com.ecommerce.product.api.ProductDubboService` | rpc | `ecom-product` | `ecom-trade` | `catalog-publish`, `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| `com.ecommerce.supplychain.api.SupplyChainDubboService` | rpc | `ecom-supply-chain` | `ecom-trade` | `catalog-publish` | confirmed |
| `com.ecommerce.trade.api.TradeDubboService` | rpc | `ecom-trade` | `ecom-trade` | `campaign-stock-guard`, `checkout-fulfillment`, `refund-aftersales` | confirmed |
| `com.ecommerce.user.api.UserDubboService` | rpc | `ecom-user` | `ecom-trade` | `checkout-fulfillment` | confirmed |

## RPC / HTTP

### `com.ecommerce.aftersales.api.AftersalesDubboService`

- 类型：rpc
- 提供方：`ecom-aftersales`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-aftersales/src/main/java/com/ecommerce/aftersales/api/AftersalesDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：售后单、退款金额、原因与审批状态
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.content.api.ContentDubboService`

- 类型：rpc
- 提供方：`ecom-content`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-content/src/main/java/com/ecommerce/content/api/ContentDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：商品内容素材绑定、审核与驳回
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.customerservice.api.CustomerServiceDubboService`

- 类型：rpc
- 提供方：`ecom-customer-service`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-customer-service/src/main/java/com/ecommerce/customerservice/api/CustomerServiceDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：客服工单、用户问题与处理状态
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.finance.api.FinanceDubboService`

- 类型：rpc
- 提供方：`ecom-finance`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-finance/src/main/java/com/ecommerce/finance/api/FinanceDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：支付结算记录、商家结算周期与结算状态
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.fulfillment.api.FulfillmentDubboService`

- 类型：rpc
- 提供方：`ecom-fulfillment`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-fulfillment/src/main/java/com/ecommerce/fulfillment/api/FulfillmentDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：履约单、包裹拆分、发货与妥投状态
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.inventory.api.InventoryDubboService`

- 类型：rpc
- 提供方：`ecom-inventory`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-inventory/src/main/java/com/ecommerce/inventory/api/InventoryDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：库存行、可售数量与活动库存保护、幂等释放
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.logistics.api.LogisticsDubboService`

- 类型：rpc
- 提供方：`ecom-logistics`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-logistics/src/main/java/com/ecommerce/logistics/api/LogisticsDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：运单创建、承运信息与签收状态
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.marketing.api.MarketingDubboService`

- 类型：rpc
- 提供方：`ecom-marketing`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-marketing/src/main/java/com/ecommerce/marketing/api/MarketingDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：营销活动、优惠额度、活动配额、库存保护编排与核销
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.merchant.api.MerchantDubboService`

- 类型：rpc
- 提供方：`ecom-merchant`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-merchant/src/main/java/com/ecommerce/merchant/api/MerchantDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：商家店铺资质、审核与店铺资料
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.payment.api.PaymentDubboService`

- 类型：rpc
- 提供方：`ecom-payment`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-payment/src/main/java/com/ecommerce/payment/api/PaymentDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：支付单创建、支付成功标记与退款支付记录
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.product.api.ProductDubboService`

- 类型：rpc
- 提供方：`ecom-product`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-product/src/main/java/com/ecommerce/product/api/ProductDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：商品 SKU 与售卖状态管理，`get` 兼容 `skuId`
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.supplychain.api.SupplyChainDubboService`

- 类型：rpc
- 提供方：`ecom-supply-chain`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-supply-chain/src/main/java/com/ecommerce/supplychain/api/SupplyChainDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：采购单、质检与补货计划
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.trade.api.TradeDubboService`

- 类型：rpc
- 提供方：`ecom-trade`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-trade/src/main/java/com/ecommerce/trade/api/TradeDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

### `com.ecommerce.user.api.UserDubboService`

- 类型：rpc
- 提供方：`ecom-user`
- 消费方：`ecom-trade` 或 demo client
- 路径/接口：`ecom-user/src/main/java/com/ecommerce/user/api/UserDubboService.java`
- 方法：`create, transition, get, list, knowledge`
- 业务语义：用户资料、会员等级与收货地址管理
- 证据等级：confirmed

| 字段 | 方向 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|------|----------|------------|
| input | 请求 | Map<String,Object> | 是 | 业务创建参数或状态流转参数 | 新增字段需可空或有默认值 |
| id/action | 请求 | String | 部分方法必填 | 业务主键与状态动作 | 不可破坏已有 action 名称 |
| result | 响应 | Map<String,Object> | 是 | 业务记录快照 | 新增字段向后兼容 |

## MQ

### `待确认`

- 生产方：待确认
- 消费方：待确认
- 消息语义：当前代码未检测到 MQ topic 或消费者
- 幂等键：待确认
- 证据等级：inferred

| 字段 | 类型 | 必填 | 业务含义 | 兼容性要求 |
|------|------|------|----------|------------|
| 待确认 | 待确认 | 待确认 | 待确认 | 待确认 |

## 数据契约

| 表/实体 | 拥有应用 | 读写方 | 关键字段 | 兼容性要求 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| aftersales_cases | `ecom-aftersales` | 本应用写，交易/测试通过接口读写 | id, order_id, order_line_id, amount_cent, reason | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| content_items | `ecom-content` | 本应用写，交易/测试通过接口读写 | id, author_user_id, sku_id, title, body | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| customer_service_tickets | `ecom-customer-service` | 本应用写，交易/测试通过接口读写 | id, user_id, type, biz_ref, description | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| finance_settlements | `ecom-finance` | 本应用写，交易/测试通过接口读写 | id, payment_id, merchant_id, amount_cent, period | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| fulfillment_orders | `ecom-fulfillment` | 本应用写，交易/测试通过接口读写 | id, order_id, warehouse_id, package_count, status | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| inventory_stocks | `ecom-inventory` | 本应用写，交易/测试通过接口读写 | id, sku_id, warehouse_id, quantity, available_quantity | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| inventory_campaign_protections | `ecom-inventory` | 本应用写，交易/测试通过接口读写 | id, campaign_id, sku_id, protected_quantity, status | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| logistics_waybills | `ecom-logistics` | 本应用写，交易/测试通过接口读写 | id, package_id, carrier, address, status | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| marketing_campaigns | `ecom-marketing` | 本应用写，交易/测试通过接口读写 | id, name, sku_id, discount_cent, quota, protected_stock | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| merchant_shops | `ecom-merchant` | 本应用写，交易/测试通过接口读写 | id, shop_id, merchant_name, qualification_no, shop_name | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| payment_orders | `ecom-payment` | 本应用写，交易/测试通过接口读写 | id, order_id, amount_cent, channel, status | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| product_skus | `ecom-product` | 本应用写，交易/测试通过接口读写 | id, spu_id, title, category_id, brand_id | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| supply_chain_purchase_orders | `ecom-supply-chain` | 本应用写，交易/测试通过接口读写 | id, supplier_id, sku_id, quantity, quality_check_id | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| trade_orders | `ecom-trade` | 本应用写，交易/测试通过接口读写 | id, user_id, sku_id, quantity, pay_amount_cent | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |
| user_profiles | `ecom-user` | 本应用写，交易/测试通过接口读写 | id, mobile, member_level, address, tags | 新增字段可空或提供默认值；主键和业务键不可破坏 | confirmed |

## 发布顺序

- 先发布提供方兼容字段，再发布消费方使用新字段。
- `ecom-trade` 编排依赖下游 URL 和接口方法，新增 action 需先在下游发布。
- schema 变更先加字段后改代码，删除字段需完成所有消费方迁移。
