# ecom 业务术语汇总

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
