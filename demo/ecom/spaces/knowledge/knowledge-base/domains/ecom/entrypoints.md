# ecom 关键入口

> 入口必须按应用分组。路径使用仓库相对路径；无法确认的入口标记 `inferred`。

## 入口索引

| 应用 | 入口 | 类型 | 路径 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-aftersales` | HTTP /business/create-refund-case | http | `ecom-aftersales/src/main/java/com/ecommerce/aftersales/AppServer.java` | refund-aftersales | confirmed |
| `ecom-aftersales` | HTTP /business/list | http | `ecom-aftersales/src/main/java/com/ecommerce/aftersales/AppServer.java` | refund-aftersales | confirmed |
| `ecom-aftersales` | HTTP /business/get | http | `ecom-aftersales/src/main/java/com/ecommerce/aftersales/AppServer.java` | refund-aftersales | confirmed |
| `ecom-aftersales` | HTTP /business/approve-case | http | `ecom-aftersales/src/main/java/com/ecommerce/aftersales/AppServer.java` | refund-aftersales | confirmed |
| `ecom-aftersales` | HTTP /business/reject-case | http | `ecom-aftersales/src/main/java/com/ecommerce/aftersales/AppServer.java` | refund-aftersales | confirmed |
| `ecom-aftersales` | HTTP /business/mark-returned | http | `ecom-aftersales/src/main/java/com/ecommerce/aftersales/AppServer.java` | refund-aftersales | confirmed |
| `ecom-aftersales` | com.ecommerce.aftersales.api.AftersalesDubboService | rpc | `ecom-aftersales/src/main/java/com/ecommerce/aftersales/api/AftersalesDubboService.java` | 售后-dubbo | confirmed |
| `ecom-content` | HTTP /business/create-post | http | `ecom-content/src/main/java/com/ecommerce/content/AppServer.java` | catalog-publish | confirmed |
| `ecom-content` | HTTP /business/list | http | `ecom-content/src/main/java/com/ecommerce/content/AppServer.java` | catalog-publish | confirmed |
| `ecom-content` | HTTP /business/get | http | `ecom-content/src/main/java/com/ecommerce/content/AppServer.java` | catalog-publish | confirmed |
| `ecom-content` | HTTP /business/bind-product | http | `ecom-content/src/main/java/com/ecommerce/content/AppServer.java` | catalog-publish | confirmed |
| `ecom-content` | HTTP /business/approve-content | http | `ecom-content/src/main/java/com/ecommerce/content/AppServer.java` | catalog-publish | confirmed |
| `ecom-content` | HTTP /business/reject-content | http | `ecom-content/src/main/java/com/ecommerce/content/AppServer.java` | catalog-publish | confirmed |
| `ecom-content` | com.ecommerce.content.api.ContentDubboService | rpc | `ecom-content/src/main/java/com/ecommerce/content/api/ContentDubboService.java` | 内容-dubbo | confirmed |
| `ecom-console` | UI button[data-action="stockGuardCampaign"] | ui | `ecom-console/index.html` | campaign-stock-guard | confirmed |
| `ecom-console` | UI button[data-action="campaignDelete"] | ui | `ecom-console/index.html` | campaign-stock-guard | confirmed |
| `ecom-customer-service` | HTTP /business/create-ticket | http | `ecom-customer-service/src/main/java/com/ecommerce/customerservice/AppServer.java` | refund-aftersales | confirmed |
| `ecom-customer-service` | HTTP /business/list | http | `ecom-customer-service/src/main/java/com/ecommerce/customerservice/AppServer.java` | refund-aftersales | confirmed |
| `ecom-customer-service` | HTTP /business/get | http | `ecom-customer-service/src/main/java/com/ecommerce/customerservice/AppServer.java` | refund-aftersales | confirmed |
| `ecom-customer-service` | HTTP /business/assign-ticket | http | `ecom-customer-service/src/main/java/com/ecommerce/customerservice/AppServer.java` | refund-aftersales | confirmed |
| `ecom-customer-service` | HTTP /business/resolve-ticket | http | `ecom-customer-service/src/main/java/com/ecommerce/customerservice/AppServer.java` | refund-aftersales | confirmed |
| `ecom-customer-service` | com.ecommerce.customerservice.api.CustomerServiceDubboService | rpc | `ecom-customer-service/src/main/java/com/ecommerce/customerservice/api/CustomerServiceDubboService.java` | 客服-dubbo | confirmed |
| `ecom-finance` | HTTP /business/record-payment | http | `ecom-finance/src/main/java/com/ecommerce/finance/AppServer.java` | catalog-publish | confirmed |
| `ecom-finance` | HTTP /business/list | http | `ecom-finance/src/main/java/com/ecommerce/finance/AppServer.java` | catalog-publish | confirmed |
| `ecom-finance` | HTTP /business/get | http | `ecom-finance/src/main/java/com/ecommerce/finance/AppServer.java` | catalog-publish | confirmed |
| `ecom-finance` | HTTP /business/create-reconciliation-task | http | `ecom-finance/src/main/java/com/ecommerce/finance/AppServer.java` | catalog-publish | confirmed |
| `ecom-finance` | HTTP /business/create-merchant-settlement | http | `ecom-finance/src/main/java/com/ecommerce/finance/AppServer.java` | catalog-publish | confirmed |
| `ecom-finance` | HTTP /business/create-invoice | http | `ecom-finance/src/main/java/com/ecommerce/finance/AppServer.java` | catalog-publish | confirmed |
| `ecom-finance` | com.ecommerce.finance.api.FinanceDubboService | rpc | `ecom-finance/src/main/java/com/ecommerce/finance/api/FinanceDubboService.java` | 结算-dubbo | confirmed |
| `ecom-fulfillment` | HTTP /business/create-fulfillment | http | `ecom-fulfillment/src/main/java/com/ecommerce/fulfillment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-fulfillment` | HTTP /business/list | http | `ecom-fulfillment/src/main/java/com/ecommerce/fulfillment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-fulfillment` | HTTP /business/get | http | `ecom-fulfillment/src/main/java/com/ecommerce/fulfillment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-fulfillment` | HTTP /business/split-package | http | `ecom-fulfillment/src/main/java/com/ecommerce/fulfillment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-fulfillment` | HTTP /business/ship-package | http | `ecom-fulfillment/src/main/java/com/ecommerce/fulfillment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-fulfillment` | HTTP /business/mark-delivered | http | `ecom-fulfillment/src/main/java/com/ecommerce/fulfillment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-fulfillment` | com.ecommerce.fulfillment.api.FulfillmentDubboService | rpc | `ecom-fulfillment/src/main/java/com/ecommerce/fulfillment/api/FulfillmentDubboService.java` | 履约-dubbo | confirmed |
| `ecom-inventory` | HTTP /business/set-stock | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-inventory` | HTTP /business/list | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-inventory` | HTTP /business/get | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-inventory` | HTTP /business/query-available | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | campaign-stock-guard | confirmed |
| `ecom-inventory` | HTTP /business/protect-campaign-stock | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | campaign-stock-guard | confirmed |
| `ecom-inventory` | HTTP /business/release-campaign-stock | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | campaign-stock-guard | confirmed |
| `ecom-inventory` | HTTP /business/reserve-stock | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-inventory` | HTTP /business/release-reservation | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-inventory` | HTTP /business/deduct-reservation | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-inventory` | HTTP /business/return-stock | http | `ecom-inventory/src/main/java/com/ecommerce/inventory/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-inventory` | com.ecommerce.inventory.api.InventoryDubboService | rpc | `ecom-inventory/src/main/java/com/ecommerce/inventory/api/InventoryDubboService.java` | 库存-dubbo | confirmed |
| `ecom-logistics` | HTTP /business/create-waybill | http | `ecom-logistics/src/main/java/com/ecommerce/logistics/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-logistics` | HTTP /business/list | http | `ecom-logistics/src/main/java/com/ecommerce/logistics/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-logistics` | HTTP /business/get | http | `ecom-logistics/src/main/java/com/ecommerce/logistics/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-logistics` | HTTP /business/mark-picked-up | http | `ecom-logistics/src/main/java/com/ecommerce/logistics/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-logistics` | HTTP /business/mark-in-transit | http | `ecom-logistics/src/main/java/com/ecommerce/logistics/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-logistics` | HTTP /business/mark-signed | http | `ecom-logistics/src/main/java/com/ecommerce/logistics/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-logistics` | HTTP /business/report-exception | http | `ecom-logistics/src/main/java/com/ecommerce/logistics/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-logistics` | com.ecommerce.logistics.api.LogisticsDubboService | rpc | `ecom-logistics/src/main/java/com/ecommerce/logistics/api/LogisticsDubboService.java` | 物流-dubbo | confirmed |
| `ecom-marketing` | HTTP /business/create-campaign | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-marketing` | HTTP /business/list | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-marketing` | HTTP /business/get | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-marketing` | HTTP /business/enable-campaign | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-marketing` | HTTP /business/disable-campaign | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-marketing` | HTTP /business/delete-campaign | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | campaign-stock-guard | confirmed |
| `ecom-marketing` | HTTP /business/reserve-promotion | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-marketing` | HTTP /business/confirm-use | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-marketing` | HTTP /business/cancel-reservation | http | `ecom-marketing/src/main/java/com/ecommerce/marketing/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-marketing` | com.ecommerce.marketing.api.MarketingDubboService | rpc | `ecom-marketing/src/main/java/com/ecommerce/marketing/api/MarketingDubboService.java` | 营销活动-dubbo | confirmed |
| `ecom-merchant` | HTTP /business/create-merchant | http | `ecom-merchant/src/main/java/com/ecommerce/merchant/AppServer.java` | catalog-publish | confirmed |
| `ecom-merchant` | HTTP /business/list | http | `ecom-merchant/src/main/java/com/ecommerce/merchant/AppServer.java` | catalog-publish | confirmed |
| `ecom-merchant` | HTTP /business/get | http | `ecom-merchant/src/main/java/com/ecommerce/merchant/AppServer.java` | catalog-publish | confirmed |
| `ecom-merchant` | HTTP /business/approve-merchant | http | `ecom-merchant/src/main/java/com/ecommerce/merchant/AppServer.java` | catalog-publish | confirmed |
| `ecom-merchant` | HTTP /business/disable-shop | http | `ecom-merchant/src/main/java/com/ecommerce/merchant/AppServer.java` | catalog-publish | confirmed |
| `ecom-merchant` | com.ecommerce.merchant.api.MerchantDubboService | rpc | `ecom-merchant/src/main/java/com/ecommerce/merchant/api/MerchantDubboService.java` | 商家-dubbo | confirmed |
| `ecom-payment` | HTTP /business/create-payment | http | `ecom-payment/src/main/java/com/ecommerce/payment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-payment` | HTTP /business/list | http | `ecom-payment/src/main/java/com/ecommerce/payment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-payment` | HTTP /business/get | http | `ecom-payment/src/main/java/com/ecommerce/payment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-payment` | HTTP /business/mark-paid | http | `ecom-payment/src/main/java/com/ecommerce/payment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-payment` | HTTP /business/create-refund-payment | http | `ecom-payment/src/main/java/com/ecommerce/payment/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-payment` | com.ecommerce.payment.api.PaymentDubboService | rpc | `ecom-payment/src/main/java/com/ecommerce/payment/api/PaymentDubboService.java` | 支付-dubbo | confirmed |
| `ecom-product` | HTTP /business/create-sku | http | `ecom-product/src/main/java/com/ecommerce/product/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-product` | HTTP /business/list | http | `ecom-product/src/main/java/com/ecommerce/product/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-product` | HTTP /business/get | http | `ecom-product/src/main/java/com/ecommerce/product/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-product` | HTTP /business/enable-sale | http | `ecom-product/src/main/java/com/ecommerce/product/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-product` | HTTP /business/disable-sale | http | `ecom-product/src/main/java/com/ecommerce/product/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-product` | com.ecommerce.product.api.ProductDubboService | rpc | `ecom-product/src/main/java/com/ecommerce/product/api/ProductDubboService.java` | 商品-dubbo | confirmed |
| `ecom-supply-chain` | HTTP /business/create-purchase-order | http | `ecom-supply-chain/src/main/java/com/ecommerce/supplychain/AppServer.java` | catalog-publish | confirmed |
| `ecom-supply-chain` | HTTP /business/list | http | `ecom-supply-chain/src/main/java/com/ecommerce/supplychain/AppServer.java` | catalog-publish | confirmed |
| `ecom-supply-chain` | HTTP /business/get | http | `ecom-supply-chain/src/main/java/com/ecommerce/supplychain/AppServer.java` | catalog-publish | confirmed |
| `ecom-supply-chain` | HTTP /business/approve-quality-check | http | `ecom-supply-chain/src/main/java/com/ecommerce/supplychain/AppServer.java` | catalog-publish | confirmed |
| `ecom-supply-chain` | HTTP /business/reject-quality-check | http | `ecom-supply-chain/src/main/java/com/ecommerce/supplychain/AppServer.java` | catalog-publish | confirmed |
| `ecom-supply-chain` | HTTP /business/create-replenishment-plan | http | `ecom-supply-chain/src/main/java/com/ecommerce/supplychain/AppServer.java` | catalog-publish | confirmed |
| `ecom-supply-chain` | com.ecommerce.supplychain.api.SupplyChainDubboService | rpc | `ecom-supply-chain/src/main/java/com/ecommerce/supplychain/api/SupplyChainDubboService.java` | 供应链-dubbo | confirmed |
| `ecom-trade` | HTTP /business/create-order | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | HTTP /business/demo-checkout | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | HTTP /business/demo-cancel | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | HTTP /business/demo-full-chain | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | HTTP /business/list | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | HTTP /business/get | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | HTTP /business/confirm-paid | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | HTTP /business/cancel-order | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | HTTP /business/complete-order | http | `ecom-trade/src/main/java/com/ecommerce/trade/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-trade` | com.ecommerce.trade.api.TradeDubboService | rpc | `ecom-trade/src/main/java/com/ecommerce/trade/api/TradeDubboService.java` | 订单-dubbo | confirmed |
| `ecom-user` | HTTP /business/create-user | http | `ecom-user/src/main/java/com/ecommerce/user/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-user` | HTTP /business/list | http | `ecom-user/src/main/java/com/ecommerce/user/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-user` | HTTP /business/get | http | `ecom-user/src/main/java/com/ecommerce/user/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-user` | HTTP /business/add-address | http | `ecom-user/src/main/java/com/ecommerce/user/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-user` | HTTP /business/upgrade-member | http | `ecom-user/src/main/java/com/ecommerce/user/AppServer.java` | checkout-fulfillment | confirmed |
| `ecom-user` | com.ecommerce.user.api.UserDubboService | rpc | `ecom-user/src/main/java/com/ecommerce/user/api/UserDubboService.java` | 用户-dubbo | confirmed |

## ecom-aftersales

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-refund-case | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/approve-case | BusinessService.approveCase | approveCase | 见 registry.json | confirmed |
| /business/reject-case | BusinessService.rejectCase | rejectCase | 见 registry.json | confirmed |
| /business/mark-returned | BusinessService.markReturned | markReturned | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.aftersales.api.AftersalesDubboService | create | 提供方 | ecom-aftersales | 见 registry.json | confirmed |
| com.ecommerce.aftersales.api.AftersalesDubboService | transition | 提供方 | ecom-aftersales | 见 registry.json | confirmed |
| com.ecommerce.aftersales.api.AftersalesDubboService | get | 提供方 | ecom-aftersales | 见 registry.json | confirmed |
| com.ecommerce.aftersales.api.AftersalesDubboService | list | 提供方 | ecom-aftersales | 见 registry.json | confirmed |
| com.ecommerce.aftersales.api.AftersalesDubboService | knowledge | 提供方 | ecom-aftersales | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-content

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-post | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/bind-product | BusinessService.bindProduct | bindProduct | 见 registry.json | confirmed |
| /business/approve-content | BusinessService.approveContent | approveContent | 见 registry.json | confirmed |
| /business/reject-content | BusinessService.rejectContent | rejectContent | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.content.api.ContentDubboService | create | 提供方 | ecom-content | 见 registry.json | confirmed |
| com.ecommerce.content.api.ContentDubboService | transition | 提供方 | ecom-content | 见 registry.json | confirmed |
| com.ecommerce.content.api.ContentDubboService | get | 提供方 | ecom-content | 见 registry.json | confirmed |
| com.ecommerce.content.api.ContentDubboService | list | 提供方 | ecom-content | 见 registry.json | confirmed |
| com.ecommerce.content.api.ContentDubboService | knowledge | 提供方 | ecom-content | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-console

### UI / 控制台

| 动作/按钮 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| `stockGuardCampaign` | `button[data-action="stockGuardCampaign"]` | stockGuardCampaign | `campaign-stock-guard` | confirmed |
| `campaignDelete` | `button[data-action="campaignDelete"]` | campaignDelete | `campaign-stock-guard` | confirmed |

### 依赖

| 目标应用 | 调用方式 | 入口 | 说明 | 证据等级 |
| --- | --- | --- | --- | --- |
| `ecom-product` | http | `app.js` 中的 `post(4210, '/business/create-sku'/'/business/enable-sale'/'/business/get')` | 先创建并上架演示 SKU | confirmed |
| `ecom-inventory` | http | `app.js` 中的 `post(4215, '/business/set-stock')` | 设置演示库存 | confirmed |
| `ecom-marketing` | http | `app.js` 中的 `post(4214, '/business/create-campaign'/'/business/enable-campaign'/'/business/delete-campaign')` | 创建、启用和删除库存保护活动 | confirmed |

## ecom-customer-service

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-ticket | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/assign-ticket | BusinessService.assignTicket | assignTicket | 见 registry.json | confirmed |
| /business/resolve-ticket | BusinessService.resolveTicket | resolveTicket | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.customerservice.api.CustomerServiceDubboService | create | 提供方 | ecom-customer-service | 见 registry.json | confirmed |
| com.ecommerce.customerservice.api.CustomerServiceDubboService | transition | 提供方 | ecom-customer-service | 见 registry.json | confirmed |
| com.ecommerce.customerservice.api.CustomerServiceDubboService | get | 提供方 | ecom-customer-service | 见 registry.json | confirmed |
| com.ecommerce.customerservice.api.CustomerServiceDubboService | list | 提供方 | ecom-customer-service | 见 registry.json | confirmed |
| com.ecommerce.customerservice.api.CustomerServiceDubboService | knowledge | 提供方 | ecom-customer-service | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-finance

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/record-payment | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/create-reconciliation-task | BusinessService.createReconciliationTask | createReconciliationTask | 见 registry.json | confirmed |
| /business/create-merchant-settlement | BusinessService.createMerchantSettlement | createMerchantSettlement | 见 registry.json | confirmed |
| /business/create-invoice | BusinessService.createInvoice | createInvoice | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.finance.api.FinanceDubboService | create | 提供方 | ecom-finance | 见 registry.json | confirmed |
| com.ecommerce.finance.api.FinanceDubboService | transition | 提供方 | ecom-finance | 见 registry.json | confirmed |
| com.ecommerce.finance.api.FinanceDubboService | get | 提供方 | ecom-finance | 见 registry.json | confirmed |
| com.ecommerce.finance.api.FinanceDubboService | list | 提供方 | ecom-finance | 见 registry.json | confirmed |
| com.ecommerce.finance.api.FinanceDubboService | knowledge | 提供方 | ecom-finance | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-fulfillment

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-fulfillment | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/split-package | BusinessService.splitPackage | splitPackage | 见 registry.json | confirmed |
| /business/ship-package | BusinessService.shipPackage | shipPackage | 见 registry.json | confirmed |
| /business/mark-delivered | BusinessService.markDelivered | markDelivered | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.fulfillment.api.FulfillmentDubboService | create | 提供方 | ecom-fulfillment | 见 registry.json | confirmed |
| com.ecommerce.fulfillment.api.FulfillmentDubboService | transition | 提供方 | ecom-fulfillment | 见 registry.json | confirmed |
| com.ecommerce.fulfillment.api.FulfillmentDubboService | get | 提供方 | ecom-fulfillment | 见 registry.json | confirmed |
| com.ecommerce.fulfillment.api.FulfillmentDubboService | list | 提供方 | ecom-fulfillment | 见 registry.json | confirmed |
| com.ecommerce.fulfillment.api.FulfillmentDubboService | knowledge | 提供方 | ecom-fulfillment | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-inventory

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/set-stock | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/query-available | BusinessService.queryAvailable | queryAvailable | 见 registry.json | confirmed |
| /business/protect-campaign-stock | BusinessService.protectCampaignStock | protectCampaignStock | 见 registry.json | confirmed |
| /business/release-campaign-stock | BusinessService.releaseCampaignStock | releaseCampaignStock | 见 registry.json | confirmed |
| /business/reserve-stock | BusinessService.reserveStock | reserveStock | 见 registry.json | confirmed |
| /business/release-reservation | BusinessService.releaseReservation | releaseReservation | 见 registry.json | confirmed |
| /business/deduct-reservation | BusinessService.deductReservation | deductReservation | 见 registry.json | confirmed |
| /business/return-stock | BusinessService.returnStock | returnStock | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.inventory.api.InventoryDubboService | create | 提供方 | ecom-inventory | 见 registry.json | confirmed |
| com.ecommerce.inventory.api.InventoryDubboService | transition | 提供方 | ecom-inventory | 见 registry.json | confirmed |
| com.ecommerce.inventory.api.InventoryDubboService | get | 提供方 | ecom-inventory | 见 registry.json | confirmed |
| com.ecommerce.inventory.api.InventoryDubboService | list | 提供方 | ecom-inventory | 见 registry.json | confirmed |
| com.ecommerce.inventory.api.InventoryDubboService | knowledge | 提供方 | ecom-inventory | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-logistics

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-waybill | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/mark-picked-up | BusinessService.markPickedUp | markPickedUp | 见 registry.json | confirmed |
| /business/mark-in-transit | BusinessService.markInTransit | markInTransit | 见 registry.json | confirmed |
| /business/mark-signed | BusinessService.markSigned | markSigned | 见 registry.json | confirmed |
| /business/report-exception | BusinessService.reportException | reportException | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.logistics.api.LogisticsDubboService | create | 提供方 | ecom-logistics | 见 registry.json | confirmed |
| com.ecommerce.logistics.api.LogisticsDubboService | transition | 提供方 | ecom-logistics | 见 registry.json | confirmed |
| com.ecommerce.logistics.api.LogisticsDubboService | get | 提供方 | ecom-logistics | 见 registry.json | confirmed |
| com.ecommerce.logistics.api.LogisticsDubboService | list | 提供方 | ecom-logistics | 见 registry.json | confirmed |
| com.ecommerce.logistics.api.LogisticsDubboService | knowledge | 提供方 | ecom-logistics | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-marketing

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-campaign | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/enable-campaign | BusinessService.enableCampaign | enableCampaign | 见 registry.json | confirmed |
| /business/disable-campaign | BusinessService.disableCampaign | disableCampaign | 见 registry.json | confirmed |
| /business/delete-campaign | BusinessService.deleteCampaign | deleteCampaign | 见 registry.json | confirmed |
| /business/reserve-promotion | BusinessService.reservePromotion | reservePromotion | 见 registry.json | confirmed |
| /business/confirm-use | BusinessService.confirmUse | confirmUse | 见 registry.json | confirmed |
| /business/cancel-reservation | BusinessService.cancelReservation | cancelReservation | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.marketing.api.MarketingDubboService | create | 提供方 | ecom-marketing | 见 registry.json | confirmed |
| com.ecommerce.marketing.api.MarketingDubboService | transition | 提供方 | ecom-marketing | 见 registry.json | confirmed |
| com.ecommerce.marketing.api.MarketingDubboService | get | 提供方 | ecom-marketing | 见 registry.json | confirmed |
| com.ecommerce.marketing.api.MarketingDubboService | list | 提供方 | ecom-marketing | 见 registry.json | confirmed |
| com.ecommerce.marketing.api.MarketingDubboService | knowledge | 提供方 | ecom-marketing | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-merchant

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-merchant | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/approve-merchant | BusinessService.approveMerchant | approveMerchant | 见 registry.json | confirmed |
| /business/disable-shop | BusinessService.disableShop | disableShop | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.merchant.api.MerchantDubboService | create | 提供方 | ecom-merchant | 见 registry.json | confirmed |
| com.ecommerce.merchant.api.MerchantDubboService | transition | 提供方 | ecom-merchant | 见 registry.json | confirmed |
| com.ecommerce.merchant.api.MerchantDubboService | get | 提供方 | ecom-merchant | 见 registry.json | confirmed |
| com.ecommerce.merchant.api.MerchantDubboService | list | 提供方 | ecom-merchant | 见 registry.json | confirmed |
| com.ecommerce.merchant.api.MerchantDubboService | knowledge | 提供方 | ecom-merchant | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-payment

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-payment | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/mark-paid | BusinessService.markPaid | markPaid | 见 registry.json | confirmed |
| /business/create-refund-payment | BusinessService.createRefundPayment | createRefundPayment | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.payment.api.PaymentDubboService | create | 提供方 | ecom-payment | 见 registry.json | confirmed |
| com.ecommerce.payment.api.PaymentDubboService | transition | 提供方 | ecom-payment | 见 registry.json | confirmed |
| com.ecommerce.payment.api.PaymentDubboService | get | 提供方 | ecom-payment | 见 registry.json | confirmed |
| com.ecommerce.payment.api.PaymentDubboService | list | 提供方 | ecom-payment | 见 registry.json | confirmed |
| com.ecommerce.payment.api.PaymentDubboService | knowledge | 提供方 | ecom-payment | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-product

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-sku | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get(兼容 `skuId`) | 见 registry.json | confirmed |
| /business/enable-sale | BusinessService.enableSale | enableSale | 见 registry.json | confirmed |
| /business/disable-sale | BusinessService.disableSale | disableSale | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.product.api.ProductDubboService | create | 提供方 | ecom-product | 见 registry.json | confirmed |
| com.ecommerce.product.api.ProductDubboService | transition | 提供方 | ecom-product | 见 registry.json | confirmed |
| com.ecommerce.product.api.ProductDubboService | get | 提供方 | ecom-product | 见 registry.json | confirmed |
| com.ecommerce.product.api.ProductDubboService | list | 提供方 | ecom-product | 见 registry.json | confirmed |
| com.ecommerce.product.api.ProductDubboService | knowledge | 提供方 | ecom-product | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-supply-chain

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-purchase-order | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/approve-quality-check | BusinessService.approveQualityCheck | approveQualityCheck | 见 registry.json | confirmed |
| /business/reject-quality-check | BusinessService.rejectQualityCheck | rejectQualityCheck | 见 registry.json | confirmed |
| /business/create-replenishment-plan | BusinessService.createReplenishmentPlan | createReplenishmentPlan | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.supplychain.api.SupplyChainDubboService | create | 提供方 | ecom-supply-chain | 见 registry.json | confirmed |
| com.ecommerce.supplychain.api.SupplyChainDubboService | transition | 提供方 | ecom-supply-chain | 见 registry.json | confirmed |
| com.ecommerce.supplychain.api.SupplyChainDubboService | get | 提供方 | ecom-supply-chain | 见 registry.json | confirmed |
| com.ecommerce.supplychain.api.SupplyChainDubboService | list | 提供方 | ecom-supply-chain | 见 registry.json | confirmed |
| com.ecommerce.supplychain.api.SupplyChainDubboService | knowledge | 提供方 | ecom-supply-chain | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-trade

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-order | BusinessService.create | create | 见 registry.json | confirmed |
| /business/demo-checkout | TradeOrchestrationService.demoCheckout | demoCheckout | 见 registry.json | confirmed |
| /business/demo-cancel | TradeOrchestrationService.demoCancel | demoCancel | 见 registry.json | confirmed |
| /business/demo-full-chain | TradeOrchestrationService.demoFullChain | demoFullChain | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/confirm-paid | BusinessService.confirmPaid | confirmPaid | 见 registry.json | confirmed |
| /business/cancel-order | BusinessService.cancelOrder | cancelOrder | 见 registry.json | confirmed |
| /business/complete-order | BusinessService.completeOrder | completeOrder | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.trade.api.TradeDubboService | create | 提供方 | ecom-trade | 见 registry.json | confirmed |
| com.ecommerce.trade.api.TradeDubboService | transition | 提供方 | ecom-trade | 见 registry.json | confirmed |
| com.ecommerce.trade.api.TradeDubboService | get | 提供方 | ecom-trade | 见 registry.json | confirmed |
| com.ecommerce.trade.api.TradeDubboService | list | 提供方 | ecom-trade | 见 registry.json | confirmed |
| com.ecommerce.trade.api.TradeDubboService | knowledge | 提供方 | ecom-trade | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |

## ecom-user

### HTTP / 控制器

| 方法/路径 | 处理入口 | 业务动作 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- |
| /business/create-user | BusinessService.create | create | 见 registry.json | confirmed |
| /business/list | BusinessService.list | list | 见 registry.json | confirmed |
| /business/get | BusinessService.get | get | 见 registry.json | confirmed |
| /business/add-address | BusinessService.addAddress | addAddress | 见 registry.json | confirmed |
| /business/upgrade-member | BusinessService.upgradeMember | upgradeMember | 见 registry.json | confirmed |

### RPC / Dubbo / Feign

| 接口 | 方法 | 方向 | 调用方/提供方 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| com.ecommerce.user.api.UserDubboService | create | 提供方 | ecom-user | 见 registry.json | confirmed |
| com.ecommerce.user.api.UserDubboService | transition | 提供方 | ecom-user | 见 registry.json | confirmed |
| com.ecommerce.user.api.UserDubboService | get | 提供方 | ecom-user | 见 registry.json | confirmed |
| com.ecommerce.user.api.UserDubboService | list | 提供方 | ecom-user | 见 registry.json | confirmed |
| com.ecommerce.user.api.UserDubboService | knowledge | 提供方 | ecom-user | 见 registry.json | confirmed |

### MQ / 消费者 / 生产者

| Topic/Tag | 生产/消费 | 处理入口 | 业务动作 | 证据等级 |
|-----------|-------------------|---------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ 注解或 topic 配置 | inferred |

### 任务 / 调度器

| 任务 | 处理入口 | 触发条件 | 业务动作 | 证据等级 |
|-----|---------|----------|----------|----------|
| 待确认 | 待确认 | 当前代码未检测到调度注解 | 待确认 | inferred |
