# ecom 端到端流程

> 每条流程必须包含应用节点、入口或契约引用、证据等级。`inferred` 流程只能作为提示。

## 流程清单

| 流程 | 流程标识 | 类型 | 主应用 | 协作应用 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| 商品上架 | `catalog-publish` | 核心 | `ecom-product` | `ecom-merchant`, `ecom-content`, `ecom-supply-chain` | confirmed |
| 营销活动库存保护 | `campaign-stock-guard` | 核心 | `ecom-marketing` | `ecom-console`, `ecom-product`, `ecom-inventory`, `ecom-trade` | confirmed |
| 下单支付履约 | `checkout-fulfillment` | 核心 | `ecom-trade` | `ecom-product`, `ecom-user`, `ecom-marketing`, `ecom-inventory`, `ecom-payment`, `ecom-fulfillment`, `ecom-logistics` | confirmed |
| 退款售后 | `refund-aftersales` | 支撑 | `ecom-aftersales` | `ecom-trade`, `ecom-payment`, `ecom-customer-service` | confirmed |
| 结算对账 | `settlement-reconcile` | 支撑 | `ecom-finance` | `ecom-payment`, `ecom-merchant` | confirmed |

## 商品上架

- 流程标识：`catalog-publish`
- 业务目标：让商家、商品、内容和供应链准备好可售商品。
- 触发方式：HTTP /business/create-sku、/business/approve-merchant、/business/approve-content 或 Dubbo create/transition
- 主应用：`ecom-product`
- 证据等级：confirmed
- 证据来源：`TradeOrchestrationService`、`AppServer` 路由、Dubbo 接口、`schema.sql`

### 流程节点

| 序号 | 应用 | 节点职责 | 入口 | 接口/Topic/表 | 输入 | 输出 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ecom-merchant` | 商家店铺资质、审核与店铺资料 | `HTTP /business/create-merchant` | `com.ecommerce.merchant.api.MerchantDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 2 | `ecom-product` | 商品 SKU 与售卖状态管理 | `HTTP /business/create-sku` | `com.ecommerce.product.api.ProductDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 3 | `ecom-content` | 商品内容素材绑定、审核与驳回 | `HTTP /business/create-post` | `com.ecommerce.content.api.ContentDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 4 | `ecom-supply-chain` | 采购单、质检与补货计划 | `HTTP /business/create-purchase-order` | `com.ecommerce.supplychain.api.SupplyChainDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |

### 状态与异常

| 状态/异常 | 业务含义 | 处理应用 | 后续动作 | 证据等级 |
|-----------|----------|----------|----------|----------|
| CREATED/DRAFT | 业务对象已创建但未完成 | `ecom-product` | 继续状态流转 | confirmed |
| CANCELLED/REJECTED | 取消或驳回 | `ecom-product` | 释放预占或终止流程 | confirmed |
| 待确认 | 真实异常码和重试策略未在 demo 中完整建模 | `all` | 需求阶段补充 | inferred |

### 一致性与补偿

- 幂等键：业务 id，例如 orderId、campaignId、stockId、paymentId；真实全局 requestId 待确认。
- 事务边界：各应用本地写库，跨应用由交易编排维持最终一致。
- 补偿动作：取消营销预占、释放库存预占、售后审批和退款支付记录。

### 待确认

- 生产级超时、重试、幂等和补偿策略需要在技术方案阶段明确。

## 营销活动库存保护

- 流程标识：`campaign-stock-guard`
- 业务目标：运营后台创建受库存保护的活动，创建阶段只校验商品和可保护库存，不创建保护记录；启用阶段创建活动库存保护；删除阶段幂等释放保护记录。
- 触发方式：`ecom-console` 的 `stockGuardCampaign` 按钮，或 `ecom-marketing` 的 `create-campaign` / `enable-campaign` / `delete-campaign`
- 主应用：`ecom-marketing`
- 证据等级：confirmed
- 证据来源：`ecom-console/app.js`、`ecom-console/index.html`、`ecom-product` / `ecom-inventory` / `ecom-marketing` 的 HTTP 路由与仓储实现

### 流程节点

| 序号 | 应用 | 节点职责 | 入口 | 接口/Topic/表 | 输入 | 输出 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ecom-console` | 运营入口，一键演示商品、库存和营销库存保护链路 | `UI stockGuardCampaign` | `ecom-console/app.js`、`ecom-console/index.html` | 按钮事件与演示入参 | 展示商品、库存、活动与失败原因 | confirmed |
| 2 | `ecom-product` | 商品 SKU 与售卖状态管理，创建阶段只读校验 | `HTTP /business/get` | `com.ecommerce.product.api.ProductDubboService` | `skuId` / `id` | 返回 SKU、上架状态和价格摘要 | confirmed |
| 3 | `ecom-inventory` | 查询可保护库存、创建活动保护、释放活动保护 | `HTTP /business/query-available` | `com.ecommerce.inventory.api.InventoryDubboService` | `skuId`、`campaignId`、`protectedStock` | 返回可保护库存或保护结果 | confirmed |
| 4 | `ecom-marketing` | 营销活动创建、启用、删除与库存保护编排 | `HTTP /business/create-campaign` | `com.ecommerce.marketing.api.MarketingDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 5 | `ecom-trade` | 交易订单创建、支付确认、取消和完成，仅用于回归验证 | `HTTP /business/demo-checkout` | `com.ecommerce.trade.api.TradeDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |

### 状态与异常

| 状态/异常 | 业务含义 | 处理应用 | 后续动作 | 证据等级 |
|-----------|----------|----------|----------|----------|
| CREATED/DRAFT | 业务对象已创建但未完成 | `ecom-marketing` | 继续状态流转；创建阶段不生成活动库存保护记录 | confirmed |
| ENABLED | 活动已启用且保护记录已创建 | `ecom-marketing`、`ecom-inventory` | 继续使用保护记录 | confirmed |
| DELETED/RELEASED | 活动已删除或保护记录已释放 | `ecom-marketing`、`ecom-inventory` | 幂等返回成功 | confirmed |
| 待确认 | 真实异常码和重试策略未在 demo 中完整建模 | `all` | 需求阶段补充 | inferred |

### 一致性与补偿

- 幂等键：业务 id，例如 campaignId、skuId、stockId、orderId、paymentId；真实全局 requestId 待确认。
- 事务边界：`ecom-marketing` 本地保存活动草稿，`ecom-inventory` 本地保存活动库存保护，跨应用通过 HTTP 同步调用维持最终一致。
- 补偿动作：取消营销活动、释放活动库存保护、售后审批和退款支付记录。

### 待确认

- 生产级超时、重试、幂等和补偿策略需要在技术方案阶段明确。

## 下单支付履约

- 流程标识：`checkout-fulfillment`
- 业务目标：完成下单、支付、权益确认、库存扣减、履约发货和签收闭环。
- 触发方式：HTTP /business/demo-checkout 或 TradeDubboService 编排
- 主应用：`ecom-trade`
- 证据等级：confirmed
- 证据来源：`TradeOrchestrationService`、`AppServer` 路由、Dubbo 接口、`schema.sql`

### 流程节点

| 序号 | 应用 | 节点职责 | 入口 | 接口/Topic/表 | 输入 | 输出 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ecom-product` | 商品 SKU 与售卖状态管理 | `HTTP /business/create-sku` | `com.ecommerce.product.api.ProductDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 2 | `ecom-user` | 用户资料、会员等级与收货地址管理 | `HTTP /business/create-user` | `com.ecommerce.user.api.UserDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 3 | `ecom-marketing` | 营销活动、优惠额度、活动配额与预占核销 | `HTTP /business/create-campaign` | `com.ecommerce.marketing.api.MarketingDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 4 | `ecom-inventory` | 库存行、可售数量与预占扣减释放 | `HTTP /business/set-stock` | `com.ecommerce.inventory.api.InventoryDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 5 | `ecom-trade` | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | `HTTP /business/create-order` | `com.ecommerce.trade.api.TradeDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 6 | `ecom-payment` | 支付单创建、支付成功标记与退款支付记录 | `HTTP /business/create-payment` | `com.ecommerce.payment.api.PaymentDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 7 | `ecom-fulfillment` | 履约单、包裹拆分、发货与妥投状态 | `HTTP /business/create-fulfillment` | `com.ecommerce.fulfillment.api.FulfillmentDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 8 | `ecom-logistics` | 运单创建、承运信息与签收状态 | `HTTP /business/create-waybill` | `com.ecommerce.logistics.api.LogisticsDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |

### 状态与异常

| 状态/异常 | 业务含义 | 处理应用 | 后续动作 | 证据等级 |
|-----------|----------|----------|----------|----------|
| CREATED/DRAFT | 业务对象已创建但未完成 | `ecom-trade` | 继续状态流转 | confirmed |
| CANCELLED/REJECTED | 取消或驳回 | `ecom-trade` | 释放预占或终止流程 | confirmed |
| 待确认 | 真实异常码和重试策略未在 demo 中完整建模 | `all` | 需求阶段补充 | inferred |

### 一致性与补偿

- 幂等键：业务 id，例如 orderId、campaignId、stockId、paymentId；真实全局 requestId 待确认。
- 事务边界：各应用本地写库，跨应用由交易编排维持最终一致。
- 补偿动作：取消营销预占、释放库存预占、售后审批和退款支付记录。

### 待确认

- 生产级超时、重试、幂等和补偿策略需要在技术方案阶段明确。

## 退款售后

- 流程标识：`refund-aftersales`
- 业务目标：围绕订单创建售后单、审批、退款支付记录和客服工单。
- 触发方式：HTTP /business/demo-full-chain 中售后/客服节点，支付退款接口单独提供
- 主应用：`ecom-aftersales`
- 证据等级：confirmed
- 证据来源：`TradeOrchestrationService`、`AppServer` 路由、Dubbo 接口、`schema.sql`

### 流程节点

| 序号 | 应用 | 节点职责 | 入口 | 接口/Topic/表 | 输入 | 输出 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ecom-trade` | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | `HTTP /business/create-order` | `com.ecommerce.trade.api.TradeDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 2 | `ecom-payment` | 支付单创建、支付成功标记与退款支付记录 | `HTTP /business/create-payment` | `com.ecommerce.payment.api.PaymentDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 3 | `ecom-aftersales` | 售后单、退款金额、原因与审批状态 | `HTTP /business/create-refund-case` | `com.ecommerce.aftersales.api.AftersalesDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 4 | `ecom-customer-service` | 客服工单、用户问题与处理状态 | `HTTP /business/create-ticket` | `com.ecommerce.customerservice.api.CustomerServiceDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |

### 状态与异常

| 状态/异常 | 业务含义 | 处理应用 | 后续动作 | 证据等级 |
|-----------|----------|----------|----------|----------|
| CREATED/DRAFT | 业务对象已创建但未完成 | `ecom-aftersales` | 继续状态流转 | confirmed |
| CANCELLED/REJECTED | 取消或驳回 | `ecom-aftersales` | 释放预占或终止流程 | confirmed |
| 待确认 | 真实异常码和重试策略未在 demo 中完整建模 | `all` | 需求阶段补充 | inferred |

### 一致性与补偿

- 幂等键：业务 id，例如 orderId、campaignId、stockId、paymentId；真实全局 requestId 待确认。
- 事务边界：各应用本地写库，跨应用由交易编排维持最终一致。
- 补偿动作：取消营销预占、释放库存预占、售后审批和退款支付记录。

### 待确认

- 生产级超时、重试、幂等和补偿策略需要在技术方案阶段明确。

## 结算对账

- 流程标识：`settlement-reconcile`
- 业务目标：基于支付单与商家资料生成结算记录和商家结算状态。
- 触发方式：HTTP /business/create-merchant-settlement 或 Dubbo transition
- 主应用：`ecom-finance`
- 证据等级：confirmed
- 证据来源：`TradeOrchestrationService`、`AppServer` 路由、Dubbo 接口、`schema.sql`

### 流程节点

| 序号 | 应用 | 节点职责 | 入口 | 接口/Topic/表 | 输入 | 输出 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `ecom-payment` | 支付单创建、支付成功标记与退款支付记录 | `HTTP /business/create-payment` | `com.ecommerce.payment.api.PaymentDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 2 | `ecom-merchant` | 商家店铺资质、审核与店铺资料 | `HTTP /business/create-merchant` | `com.ecommerce.merchant.api.MerchantDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |
| 3 | `ecom-finance` | 支付结算记录、商家结算周期与结算状态 | `HTTP /business/record-payment` | `com.ecommerce.finance.api.FinanceDubboService` | 业务键/请求 JSON | 记录状态或业务结果 | confirmed |

### 状态与异常

| 状态/异常 | 业务含义 | 处理应用 | 后续动作 | 证据等级 |
|-----------|----------|----------|----------|----------|
| CREATED/DRAFT | 业务对象已创建但未完成 | `ecom-finance` | 继续状态流转 | confirmed |
| CANCELLED/REJECTED | 取消或驳回 | `ecom-finance` | 释放预占或终止流程 | confirmed |
| 待确认 | 真实异常码和重试策略未在 demo 中完整建模 | `all` | 需求阶段补充 | inferred |

### 一致性与补偿

- 幂等键：业务 id，例如 orderId、campaignId、stockId、paymentId；真实全局 requestId 待确认。
- 事务边界：各应用本地写库，跨应用由交易编排维持最终一致。
- 补偿动作：取消营销预占、释放库存预占、售后审批和退款支付记录。

### 待确认

- 生产级超时、重试、幂等和补偿策略需要在技术方案阶段明确。
