# ecom 领域上下文

> 生成时间：2026-07-16T22:33:59  
> 知识库路径：`spaces/knowledge/knowledge-base/domains/ecom/`  
> 应用范围：15 个应用  
> 证据来源：代码扫描、schema、配置、TradeOrchestrationService、OpenSpec 初始化配置

## 领域定位

ecom 领域覆盖电商 demo 的商品、用户、营销、库存、交易、支付、履约、物流、商家、内容、结算、供应链、售后、客服和运营后台能力。交易应用是跨应用编排中心，其他应用以轻量 HTTP 入口、Dubbo 泛化接口或静态 UI 提供业务能力。当前知识库以代码中明确的路由、Dubbo 接口、schema 表和编排步骤为事实入口；服务职责说明来自代码结构、README 与领域配置，部分业务边界仍需在真实需求中确认。

## 应用清单

| 应用 | 职责 | HTTP/RPC/MQ 入口 | 关键数据 | 证据等级 |
| --- | --- | --- | --- | --- |
| `ecom-aftersales` | 售后单、退款金额、原因与审批状态 | HTTP /business/create-refund-case, HTTP /business/list, HTTP /business/get | aftersales_cases | confirmed |
| `ecom-content` | 商品内容素材绑定、审核与驳回 | HTTP /business/create-post, HTTP /business/list, HTTP /business/get | content_items | confirmed |
| `ecom-console` | 运营后台演示入口，新增创建受库存保护的活动按钮 | UI stockGuardCampaign, UI campaignDelete | 无 | confirmed |
| `ecom-customer-service` | 客服工单、用户问题与处理状态 | HTTP /business/create-ticket, HTTP /business/list, HTTP /business/get | customer_service_tickets | confirmed |
| `ecom-finance` | 支付结算记录、商家结算周期与结算状态 | HTTP /business/record-payment, HTTP /business/list, HTTP /business/get | finance_settlements | confirmed |
| `ecom-fulfillment` | 履约单、包裹拆分、发货与妥投状态 | HTTP /business/create-fulfillment, HTTP /business/list, HTTP /business/get | fulfillment_orders | confirmed |
| `ecom-inventory` | 库存行、可售数量、活动库存保护与幂等释放 | HTTP /business/set-stock, HTTP /business/query-available, HTTP /business/protect-campaign-stock, HTTP /business/release-campaign-stock | inventory_stocks, inventory_campaign_protections | confirmed |
| `ecom-logistics` | 运单创建、承运信息与签收状态 | HTTP /business/create-waybill, HTTP /business/list, HTTP /business/get | logistics_waybills | confirmed |
| `ecom-marketing` | 营销活动、优惠额度、活动配额、库存保护编排与核销 | HTTP /business/create-campaign, HTTP /business/enable-campaign, HTTP /business/delete-campaign | marketing_campaigns | confirmed |
| `ecom-merchant` | 商家店铺资质、审核与店铺资料 | HTTP /business/create-merchant, HTTP /business/list, HTTP /business/get | merchant_shops | confirmed |
| `ecom-payment` | 支付单创建、支付成功标记与退款支付记录 | HTTP /business/create-payment, HTTP /business/list, HTTP /business/get | payment_orders | confirmed |
| `ecom-product` | 商品 SKU 与售卖状态管理 | HTTP /business/create-sku, HTTP /business/list, HTTP /business/get | product_skus | confirmed |
| `ecom-supply-chain` | 采购单、质检与补货计划 | HTTP /business/create-purchase-order, HTTP /business/list, HTTP /business/get | supply_chain_purchase_orders | confirmed |
| `ecom-trade` | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | HTTP /business/create-order, HTTP /business/demo-checkout, HTTP /business/demo-cancel | trade_orders | confirmed |
| `ecom-user` | 用户资料、会员等级与收货地址管理 | HTTP /business/create-user, HTTP /business/list, HTTP /business/get | user_profiles | confirmed |

## 核心流程

| 流程 | 流程标识 | 主应用 | 协作应用 | 证据等级 |
| --- | --- | --- | --- | --- |
| 商品上架 | `catalog-publish` | `ecom-product` | `ecom-merchant`, `ecom-content`, `ecom-supply-chain` | confirmed |
| 营销活动库存保护 | `campaign-stock-guard` | `ecom-marketing` | `ecom-console`, `ecom-product`, `ecom-inventory`, `ecom-trade` | confirmed |
| 下单支付履约 | `checkout-fulfillment` | `ecom-trade` | `ecom-product`, `ecom-user`, `ecom-marketing`, `ecom-inventory`, `ecom-payment`, `ecom-fulfillment`, `ecom-logistics` | confirmed |
| 退款售后 | `refund-aftersales` | `ecom-aftersales` | `ecom-trade`, `ecom-payment`, `ecom-customer-service` | confirmed |
| 结算对账 | `settlement-reconcile` | `ecom-finance` | `ecom-payment`, `ecom-merchant` | confirmed |

## 关键业务实体

| 实体 | 所属应用 | 关键表/模型 | 说明 | 证据等级 |
| --- | --- | --- | --- | --- |
| 售后 | `ecom-aftersales` | aftersales_cases | 售后单、退款金额、原因与审批状态 | confirmed |
| 内容 | `ecom-content` | content_items | 商品内容素材绑定、审核与驳回 | confirmed |
| 客服 | `ecom-customer-service` | customer_service_tickets | 客服工单、用户问题与处理状态 | confirmed |
| 结算 | `ecom-finance` | finance_settlements | 支付结算记录、商家结算周期与结算状态 | confirmed |
| 履约 | `ecom-fulfillment` | fulfillment_orders | 履约单、包裹拆分、发货与妥投状态 | confirmed |
| 库存 | `ecom-inventory` | inventory_stocks | 库存行、可售数量与预占扣减释放 | confirmed |
| 活动库存保护 | `ecom-inventory` | inventory_campaign_protections | 活动启用阶段写入、删除阶段幂等释放的库存保护记录 | confirmed |
| 物流 | `ecom-logistics` | logistics_waybills | 运单创建、承运信息与签收状态 | confirmed |
| 营销活动 | `ecom-marketing` | marketing_campaigns | 营销活动、优惠额度、活动配额与预占核销 | confirmed |
| 商家 | `ecom-merchant` | merchant_shops | 商家店铺资质、审核与店铺资料 | confirmed |
| 支付 | `ecom-payment` | payment_orders | 支付单创建、支付成功标记与退款支付记录 | confirmed |
| 商品 | `ecom-product` | product_skus | 商品 SKU 与售卖状态管理 | confirmed |
| 供应链 | `ecom-supply-chain` | supply_chain_purchase_orders | 采购单、质检与补货计划 | confirmed |
| 订单 | `ecom-trade` | trade_orders | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | confirmed |
| 用户 | `ecom-user` | user_profiles | 用户资料、会员等级与收货地址管理 | confirmed |

## 关键约束

- 交易编排通过 `RemoteDomainClient` 调用各应用 Dubbo 泛化接口，Dubbo URL 默认使用本地 4310-4323 端口。
- 运营后台通过静态页面调用商品、库存和营销 HTTP 服务，端口或服务不可用会直接影响演示链路。
- 营销预占和库存预占在交易创建前执行，取消流程需要释放两侧预占。
- 支付成功后交易状态、营销核销、库存扣减、履约发货和物流签收需要保持最终一致。
- 结算依赖支付单和商家信息，字段兼容性变更需要同时关注 `ecom-payment`、`ecom-merchant`、`ecom-finance`。
- 售后退款链路涉及订单、支付、售后和客服，真实退款幂等键与补偿策略仍需确认。

## 证据等级说明

- `confirmed`：来自代码、接口声明、MQ 消费、表引用、CodeGraph path 或明确配置。
- `manual`：来自用户明确输入。
- `inferred`：仅作为提示，不得直接驱动 Stage 03 实施。

## 下一步使用

- Stage 02 使用本文件理解领域上下文。
- Stage 03 必须结合 `registry.json`、`entrypoints.md` 和 `interfaces.md` 判断实施依据。
- Stage 04 使用 `flows.md` 和 `data-map.md` 生成集成测试与造数。
