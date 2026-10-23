# ecom 领域术语

> 术语必须使用业务语言解释。代码类名、方法名只能作为证据引用，不得作为主体解释。

## 术语总览

| 术语 | 同义词/别名 | 业务含义 | 覆盖应用 | 关联能力 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| 售后 | 售后, aftersales | 售后单、退款金额、原因与审批状态 | `ecom-aftersales` | aftersales-core | `refund-aftersales` | confirmed |
| 内容 | 内容, content | 商品内容素材绑定、审核与驳回 | `ecom-content` | content-core | `catalog-publish` | confirmed |
| 客服 | 客服, customer-service | 客服工单、用户问题与处理状态 | `ecom-customer-service` | customer-service-core | `refund-aftersales` | confirmed |
| 结算 | 结算, finance | 支付结算记录、商家结算周期与结算状态 | `ecom-finance` | finance-core | `settlement-reconcile` | confirmed |
| 履约 | 履约, fulfillment | 履约单、包裹拆分、发货与妥投状态 | `ecom-fulfillment` | fulfillment-core | `checkout-fulfillment` | confirmed |
| 库存 | 库存, inventory | 库存行、可售数量与预占扣减释放 | `ecom-inventory` | inventory-core | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 库存预占 | 库存预占, inventory | 库存行、可售数量与预占扣减释放 | `ecom-inventory` | inventory-core | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 库存扣减 | 库存扣减, inventory | 库存行、可售数量与预占扣减释放 | `ecom-inventory` | inventory-core | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 物流 | 物流, logistics | 运单创建、承运信息与签收状态 | `ecom-logistics` | logistics-core | `checkout-fulfillment` | confirmed |
| 营销活动 | 营销活动, marketing | 营销活动、优惠额度、活动配额与预占核销 | `ecom-marketing` | marketing-core | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 活动预占 | 活动预占, marketing | 营销活动、优惠额度、活动配额与预占核销 | `ecom-marketing` | marketing-core | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 优惠核销 | 优惠核销, marketing | 营销活动、优惠额度、活动配额与预占核销 | `ecom-marketing` | marketing-core | `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 商家 | 商家, merchant | 商家店铺资质、审核与店铺资料 | `ecom-merchant` | merchant-core | `catalog-publish`, `settlement-reconcile` | confirmed |
| 支付 | 支付, payment | 支付单创建、支付成功标记与退款支付记录 | `ecom-payment` | payment-core | `checkout-fulfillment`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| 商品 | 商品, product | 商品 SKU 与售卖状态管理 | `ecom-product` | product-core | `catalog-publish`, `campaign-stock-guard`, `checkout-fulfillment` | confirmed |
| 供应链 | 供应链, supply-chain | 采购单、质检与补货计划 | `ecom-supply-chain` | supply-chain-core | `catalog-publish` | confirmed |
| 订单 | 订单, trade | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | `ecom-trade` | trade-core | `campaign-stock-guard`, `checkout-fulfillment`, `refund-aftersales` | confirmed |
| 交易编排 | 交易编排, trade | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | `ecom-trade` | trade-core | `campaign-stock-guard`, `checkout-fulfillment`, `refund-aftersales` | confirmed |
| 订单支付履约 | 订单支付履约, trade | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | `ecom-trade` | trade-core | `campaign-stock-guard`, `checkout-fulfillment`, `refund-aftersales` | confirmed |
| 用户 | 用户, user | 用户资料、会员等级与收货地址管理 | `ecom-user` | user-core | `checkout-fulfillment` | confirmed |

## 术语覆盖

### 售后

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-aftersales` | 售后单、退款金额、原因与审批状态 | aftersales-core | HTTP /business/create-refund-case, HTTP /business/list, HTTP /business/get, HTTP /business/approve-case | aftersales_cases | confirmed |

### 内容

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-content` | 商品内容素材绑定、审核与驳回 | content-core | HTTP /business/create-post, HTTP /business/list, HTTP /business/get, HTTP /business/bind-product | content_items | confirmed |

### 客服

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-customer-service` | 客服工单、用户问题与处理状态 | customer-service-core | HTTP /business/create-ticket, HTTP /business/list, HTTP /business/get, HTTP /business/assign-ticket | customer_service_tickets | confirmed |

### 结算

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-finance` | 支付结算记录、商家结算周期与结算状态 | finance-core | HTTP /business/record-payment, HTTP /business/list, HTTP /business/get, HTTP /business/create-reconciliation-task | finance_settlements | confirmed |

### 履约

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-fulfillment` | 履约单、包裹拆分、发货与妥投状态 | fulfillment-core | HTTP /business/create-fulfillment, HTTP /business/list, HTTP /business/get, HTTP /business/split-package | fulfillment_orders | confirmed |

### 库存

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-inventory` | 库存行、可售数量与预占扣减释放 | inventory-core | HTTP /business/set-stock, HTTP /business/list, HTTP /business/get, HTTP /business/reserve-stock | inventory_stocks | confirmed |

### 物流

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-logistics` | 运单创建、承运信息与签收状态 | logistics-core | HTTP /business/create-waybill, HTTP /business/list, HTTP /business/get, HTTP /business/mark-picked-up | logistics_waybills | confirmed |

### 营销活动

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-marketing` | 营销活动、优惠额度、活动配额与预占核销 | marketing-core | HTTP /business/create-campaign, HTTP /business/list, HTTP /business/get, HTTP /business/enable-campaign | marketing_campaigns | confirmed |

### 商家

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-merchant` | 商家店铺资质、审核与店铺资料 | merchant-core | HTTP /business/create-merchant, HTTP /business/list, HTTP /business/get, HTTP /business/approve-merchant | merchant_shops | confirmed |

### 支付

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-payment` | 支付单创建、支付成功标记与退款支付记录 | payment-core | HTTP /business/create-payment, HTTP /business/list, HTTP /business/get, HTTP /business/mark-paid | payment_orders | confirmed |

### 商品

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-product` | 商品 SKU 与售卖状态管理 | product-core | HTTP /business/create-sku, HTTP /business/list, HTTP /business/get, HTTP /business/enable-sale | product_skus | confirmed |

### 供应链

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-supply-chain` | 采购单、质检与补货计划 | supply-chain-core | HTTP /business/create-purchase-order, HTTP /business/list, HTTP /business/get, HTTP /business/approve-quality-check | supply_chain_purchase_orders | confirmed |

### 订单

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-trade` | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | trade-core | HTTP /business/create-order, HTTP /business/demo-checkout, HTTP /business/demo-cancel, HTTP /business/demo-full-chain | trade_orders | confirmed |

### 用户

| 应用 | 职责 | 能力 | 入口 | 数据/实体 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-user` | 用户资料、会员等级与收货地址管理 | user-core | HTTP /business/create-user, HTTP /business/list, HTTP /business/get, HTTP /business/add-address | user_profiles | confirmed |

## 术语链路

| 术语 | 流程标识 | 节点顺序 | 说明 | 证据等级 |
| --- | --- | --- | --- | --- |
| 商品 | `catalog-publish` | `ecom-merchant` -> `ecom-product` -> `ecom-content` -> `ecom-supply-chain` | 让商家、商品、内容和供应链准备好可售商品。 | confirmed |
| 营销活动 | `campaign-stock-guard` | `ecom-product` -> `ecom-marketing` -> `ecom-inventory` -> `ecom-trade` | 活动引用 SKU 后完成活动启用、营销预占和库存预占，防止超卖。 | confirmed |
| 订单 | `checkout-fulfillment` | `ecom-product` -> `ecom-user` -> `ecom-marketing` -> `ecom-inventory` -> `ecom-trade` -> `ecom-payment` -> `ecom-fulfillment` -> `ecom-logistics` | 完成下单、支付、权益确认、库存扣减、履约发货和签收闭环。 | confirmed |
| 售后 | `refund-aftersales` | `ecom-trade` -> `ecom-payment` -> `ecom-aftersales` -> `ecom-customer-service` | 围绕订单创建售后单、审批、退款支付记录和客服工单。 | confirmed |
| 结算 | `settlement-reconcile` | `ecom-payment` -> `ecom-merchant` -> `ecom-finance` | 基于支付单与商家资料生成结算记录和商家结算状态。 | confirmed |

## 实体口径

### 售后

- 所属应用：`ecom-aftersales`
- 关键表/模型：`aftersales_cases`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 内容

- 所属应用：`ecom-content`
- 关键表/模型：`content_items`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 客服

- 所属应用：`ecom-customer-service`
- 关键表/模型：`customer_service_tickets`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 结算

- 所属应用：`ecom-finance`
- 关键表/模型：`finance_settlements`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 履约

- 所属应用：`ecom-fulfillment`
- 关键表/模型：`fulfillment_orders`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 库存

- 所属应用：`ecom-inventory`
- 关键表/模型：`inventory_stocks`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 物流

- 所属应用：`ecom-logistics`
- 关键表/模型：`logistics_waybills`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 营销活动

- 所属应用：`ecom-marketing`
- 关键表/模型：`marketing_campaigns`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 商家

- 所属应用：`ecom-merchant`
- 关键表/模型：`merchant_shops`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 支付

- 所属应用：`ecom-payment`
- 关键表/模型：`payment_orders`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 商品

- 所属应用：`ecom-product`
- 关键表/模型：`product_skus`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 供应链

- 所属应用：`ecom-supply-chain`
- 关键表/模型：`supply_chain_purchase_orders`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 订单

- 所属应用：`ecom-trade`
- 关键表/模型：`trade_orders`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

### 用户

- 所属应用：`ecom-user`
- 关键表/模型：`user_profiles`
- 生命周期：创建、状态流转、查询；具体终态以 `BusinessService` 方法和 schema 状态字段为准。
- 关键状态：见 `BusinessService` 中状态常量和 `schema.sql.status` 字段。
- 边界说明：跨应用引用只记录业务键，不拥有对方主数据。
- 证据等级：confirmed

## 同义词归一

| 统一术语 | 旧称/别名 | 使用位置 | 归一原因 |
|----------|-----------|----------|----------|
| 订单 | order, trade_order | `ecom-trade` | 交易主实体以订单为业务口径 |
| 营销活动 | campaign, promotion | `ecom-marketing`, `ecom-trade` | 编排中既有活动创建也有权益预占 |
| 库存 | stock, reservation | `ecom-inventory`, `ecom-trade` | 交易链路关注可售、预占、释放和扣减 |
| 结算 | settlement, finance | `ecom-finance` | 结算表和服务名称统一为结算口径 |

## 待确认术语

| 术语 | 当前推断 | 需要确认的问题 | 来源 |
|------|----------|----------------|------|
| 促销预占 | 由 `reserve-promotion` 推断为活动配额预占 | 是否存在独立 reservationId 与过期释放策略 | `TradeOrchestrationService.demoCheckout` |
| 售后退款 | 由售后审批和支付退款接口推断 | 退款单与支付单的一致性、幂等键和补偿动作 | `ecom-aftersales`, `ecom-payment` |
