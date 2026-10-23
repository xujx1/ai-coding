# ecom 依赖图摘要

> 本文件记录领域级依赖摘要；代码内精确调用链以每应用 CodeGraph 索引为准。

## 依赖总览

| 来源应用 | 目标应用 | 类型 | 引用 | 关联流程 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-console` | `ecom-product` | http | `stockGuardCampaign -> product` | `campaign-stock-guard` | confirmed |
| `ecom-console` | `ecom-inventory` | http | `stockGuardCampaign -> inventory` | `campaign-stock-guard` | confirmed |
| `ecom-console` | `ecom-marketing` | http | `stockGuardCampaign -> marketing` | `campaign-stock-guard` | confirmed |
| `ecom-marketing` | `ecom-product` | http | `ProductGateway -> /business/get` | `campaign-stock-guard` | confirmed |
| `ecom-marketing` | `ecom-inventory` | http | `InventoryGateway -> /business/query-available,/business/protect-campaign-stock,/business/release-campaign-stock` | `campaign-stock-guard` | confirmed |
| `ecom-trade` | `ecom-aftersales` | rpc | `RemoteDomainClient -> aftersales` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-content` | rpc | `RemoteDomainClient -> content` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-customer-service` | rpc | `RemoteDomainClient -> customer-service` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-finance` | rpc | `RemoteDomainClient -> finance` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-fulfillment` | rpc | `RemoteDomainClient -> fulfillment` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-inventory` | rpc | `RemoteDomainClient -> inventory` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-logistics` | rpc | `RemoteDomainClient -> logistics` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-marketing` | rpc | `RemoteDomainClient -> marketing` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-merchant` | rpc | `RemoteDomainClient -> merchant` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-payment` | rpc | `RemoteDomainClient -> payment` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-product` | rpc | `RemoteDomainClient -> product` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-supply-chain` | rpc | `RemoteDomainClient -> supply-chain` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |
| `ecom-trade` | `ecom-user` | rpc | `RemoteDomainClient -> user` | `checkout-fulfillment`, `campaign-stock-guard`, `refund-aftersales`, `settlement-reconcile` | confirmed |

## RPC / HTTP 依赖

| 调用方 | 提供方 | 接口/路径 | 方法 | 用途 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-console` | `ecom-product` | `app.js -> http://127.0.0.1:4210` | create-sku/enable-sale/get | 运营后台创建并上架演示 SKU，创建库存保护活动前校验商品 | confirmed |
| `ecom-console` | `ecom-inventory` | `app.js -> http://127.0.0.1:4215` | set-stock | 运营后台设置演示库存 | confirmed |
| `ecom-console` | `ecom-marketing` | `app.js -> http://127.0.0.1:4214` | create-campaign/enable-campaign/delete-campaign | 运营后台创建、启用和删除库存保护活动 | confirmed |
| `ecom-marketing` | `ecom-product` | `HttpProductGateway -> PRODUCT_BASE_URL` | get | 创建和启用库存保护活动时校验 SKU 已上架 | confirmed |
| `ecom-marketing` | `ecom-inventory` | `HttpInventoryGateway -> INVENTORY_BASE_URL` | query-available/protect-campaign-stock/release-campaign-stock | 创建阶段只校验可保护库存，启用阶段创建保护，删除阶段释放保护 | confirmed |
| `ecom-trade` | `ecom-aftersales` | `RemoteDomainClient -> aftersales` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-content` | `RemoteDomainClient -> content` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-customer-service` | `RemoteDomainClient -> customer-service` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-finance` | `RemoteDomainClient -> finance` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-fulfillment` | `RemoteDomainClient -> fulfillment` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-inventory` | `RemoteDomainClient -> inventory` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-logistics` | `RemoteDomainClient -> logistics` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-marketing` | `RemoteDomainClient -> marketing` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-merchant` | `RemoteDomainClient -> merchant` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-payment` | `RemoteDomainClient -> payment` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-product` | `RemoteDomainClient -> product` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-supply-chain` | `RemoteDomainClient -> supply-chain` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |
| `ecom-trade` | `ecom-user` | `RemoteDomainClient -> user` | create/transition/get/list | 交易编排调用下游领域能力 | confirmed |

## MQ 依赖

| Topic/Tag | 生产应用 | 消费应用 | 消息语义 | 关联流程 | 证据等级 |
|-----------|----------|----------|----------|----------|----------|
| 待确认 | 待确认 | 待确认 | 当前代码未检测到 MQ topic | 待确认 | inferred |

## 数据依赖

| 应用 | 表/实体 | 读写 | 依赖方 | 说明 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-aftersales` | aftersales_cases | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 售后单、退款金额、原因与审批状态 | confirmed |
| `ecom-content` | content_items | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 商品内容素材绑定、审核与驳回 | confirmed |
| `ecom-customer-service` | customer_service_tickets | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 客服工单、用户问题与处理状态 | confirmed |
| `ecom-finance` | finance_settlements | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 支付结算记录、商家结算周期与结算状态 | confirmed |
| `ecom-fulfillment` | fulfillment_orders | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 履约单、包裹拆分、发货与妥投状态 | confirmed |
| `ecom-inventory` | inventory_stocks | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 库存行、可售数量与预占扣减释放 | confirmed |
| `ecom-inventory` | inventory_campaign_protections | 写/读 | `ecom-marketing` 或本应用 HTTP 调用方 | 活动库存保护、活动启用和幂等释放 | confirmed |
| `ecom-logistics` | logistics_waybills | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 运单创建、承运信息与签收状态 | confirmed |
| `ecom-marketing` | marketing_campaigns | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 营销活动、优惠额度、活动配额与预占核销 | confirmed |
| `ecom-merchant` | merchant_shops | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 商家店铺资质、审核与店铺资料 | confirmed |
| `ecom-payment` | payment_orders | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 支付单创建、支付成功标记与退款支付记录 | confirmed |
| `ecom-product` | product_skus | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 商品 SKU 与售卖状态管理 | confirmed |
| `ecom-supply-chain` | supply_chain_purchase_orders | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 采购单、质检与补货计划 | confirmed |
| `ecom-trade` | trade_orders | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | confirmed |
| `ecom-user` | user_profiles | 写/读 | `ecom-trade` 或本应用 HTTP/RPC 调用方 | 用户资料、会员等级与收货地址管理 | confirmed |

## CodeGraph 引用

| 应用 | 索引路径 | 状态 | 用途 |
| --- | --- | --- | --- |
| `ecom-aftersales` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-aftersales/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-console` | `/Users/xu/IdeaProjects/ecom/console/.codegraph` | failed | CodeGraph 刷新失败，归档阶段降级使用静态文件阅读 |
| `ecom-content` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-content/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-customer-service` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-customer-service/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-finance` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-finance/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-fulfillment` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-fulfillment/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-inventory` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-inventory/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-logistics` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-logistics/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-marketing` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-marketing/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-merchant` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-merchant/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-payment` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-payment/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-product` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-product/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-supply-chain` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-supply-chain/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-trade` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-trade/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |
| `ecom-user` | `/Users/xu/IdeaProjects/ai-coding/demo/ecom/ecom-user/.codegraph` | indexed | 调用方/被调方/调用路径/影响面 |

## 风险依赖

- 交易应用到所有下游服务存在同步 Dubbo 依赖，单点失败会影响 demo 全链路。
- 运营后台到商品、库存和营销存在本地 HTTP 端口依赖，端口不一致会影响 `stockGuardCampaign`。
- 当前 raw CodeGraph 索引未在各 app 下发现，后续影响面分析会降级为静态扫描。
- 所有跨应用契约使用 `Map<String,Object>`，缺少强类型 DTO 和版本兼容声明。
