# ecom 应用地图

## 领域边界

ecom 领域包含 14 个 Java/Maven 轻量服务和 1 个运营后台静态页面，覆盖电商 demo 从商品准备、营销库存保护、交易支付履约到售后客服和结算的完整链路。`ecom-trade` 是当前代码中唯一明确跨应用编排者，运营后台通过 HTTP 调用商品、库存和营销服务，其余服务通过 HTTP `/business/*` 和 Dubbo `*DubboService` 暴露领域能力。集成测试应用 `ecom-integration-tests` 不属于本次 app 边界，只作为测试仓库参考。

## 应用职责

| 应用 | 角色 | 职责 | 拥有实体 | 拥有数据 | 对外能力 | 证据等级 |
| --- | --- | --- | --- | --- | --- | --- |
| `ecom-aftersales` | 支撑 | 售后单、退款金额、原因与审批状态 | 售后 | aftersales_cases | HTTP /business/create-refund-case, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-content` | 支撑 | 商品内容素材绑定、审核与驳回 | 内容 | content_items | HTTP /business/create-post, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-console` | 主改 | 运营后台演示入口，新增创建受库存保护的活动按钮 | 运营后台, 库存保护活动 | 无 | UI stockGuardCampaign, UI campaignDelete | confirmed |
| `ecom-customer-service` | 支撑 | 客服工单、用户问题与处理状态 | 客服 | customer_service_tickets | HTTP /business/create-ticket, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-finance` | 支撑 | 支付结算记录、商家结算周期与结算状态 | 结算 | finance_settlements | HTTP /business/record-payment, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-fulfillment` | 协作 | 履约单、包裹拆分、发货与妥投状态 | 履约 | fulfillment_orders | HTTP /business/create-fulfillment, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-inventory` | 协作 | 库存行、可售数量、活动库存保护与幂等释放 | 库存, 库存预占, 库存扣减, 活动库存保护 | inventory_stocks, inventory_campaign_protections | HTTP /business/set-stock, HTTP /business/query-available, HTTP /business/protect-campaign-stock, HTTP /business/release-campaign-stock | confirmed |
| `ecom-logistics` | 协作 | 运单创建、承运信息与签收状态 | 物流 | logistics_waybills | HTTP /business/create-waybill, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-marketing` | 协作 | 营销活动、优惠额度、活动配额、库存保护编排与核销 | 营销活动, 活动预占, 优惠核销, 库存保护活动 | marketing_campaigns | HTTP /business/create-campaign, HTTP /business/enable-campaign, HTTP /business/delete-campaign | confirmed |
| `ecom-merchant` | 支撑 | 商家店铺资质、审核与店铺资料 | 商家 | merchant_shops | HTTP /business/create-merchant, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-payment` | 协作 | 支付单创建、支付成功标记与退款支付记录 | 支付 | payment_orders | HTTP /business/create-payment, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-product` | 协作 | 商品 SKU 与售卖状态管理 | 商品 | product_skus | HTTP /business/create-sku, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-supply-chain` | 支撑 | 采购单、质检与补货计划 | 供应链 | supply_chain_purchase_orders | HTTP /business/create-purchase-order, HTTP /business/list, HTTP /business/get | confirmed |
| `ecom-trade` | 主改 | 交易订单创建、支付确认、取消和完成，并编排跨应用 demo 流程 | 订单, 交易编排, 订单支付履约 | trade_orders | HTTP /business/create-order, HTTP /business/demo-checkout, HTTP /business/demo-cancel | confirmed |
| `ecom-user` | 协作 | 用户资料、会员等级与收货地址管理 | 用户 | user_profiles | HTTP /business/create-user, HTTP /business/list, HTTP /business/get | confirmed |

## 应用关系

| 上游应用 | 下游应用 | 关系类型 | 契约引用 | 说明 | 证据等级 |
| --- | --- | --- | --- | --- | --- |
| `ecom-console` | `ecom-product` | http | `stockGuardCampaign -> product` | 运营后台创建并上架演示 SKU | confirmed |
| `ecom-console` | `ecom-inventory` | http | `stockGuardCampaign -> inventory` | 运营后台设置演示库存 | confirmed |
| `ecom-console` | `ecom-marketing` | http | `stockGuardCampaign -> marketing` | 运营后台创建、启用和删除库存保护活动 | confirmed |
| `ecom-trade` | `ecom-aftersales` | rpc | `RemoteDomainClient -> aftersales` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-content` | rpc | `RemoteDomainClient -> content` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-customer-service` | rpc | `RemoteDomainClient -> customer-service` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-finance` | rpc | `RemoteDomainClient -> finance` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-fulfillment` | rpc | `RemoteDomainClient -> fulfillment` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-inventory` | rpc | `RemoteDomainClient -> inventory` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-logistics` | rpc | `RemoteDomainClient -> logistics` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-marketing` | rpc | `RemoteDomainClient -> marketing` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-merchant` | rpc | `RemoteDomainClient -> merchant` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-payment` | rpc | `RemoteDomainClient -> payment` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-product` | rpc | `RemoteDomainClient -> product` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-supply-chain` | rpc | `RemoteDomainClient -> supply-chain` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |
| `ecom-trade` | `ecom-user` | rpc | `RemoteDomainClient -> user` | 交易编排通过 Dubbo 泛化调用目标应用 | confirmed |

## 流程归属

| 流程 | 主应用 | 协作应用 | 说明 |
| --- | --- | --- | --- |
| 商品上架 | `ecom-product` | `ecom-merchant`, `ecom-content`, `ecom-supply-chain` | 让商家、商品、内容和供应链准备好可售商品。 |
| 营销活动库存保护 | `ecom-marketing` | `ecom-console`, `ecom-product`, `ecom-inventory`, `ecom-trade` | 创建阶段只校验商品和可保护库存；启用阶段创建活动库存保护；删除阶段幂等释放。 |
| 下单支付履约 | `ecom-trade` | `ecom-product`, `ecom-user`, `ecom-marketing`, `ecom-inventory`, `ecom-payment`, `ecom-fulfillment`, `ecom-logistics` | 完成下单、支付、权益确认、库存扣减、履约发货和签收闭环。 |
| 退款售后 | `ecom-aftersales` | `ecom-trade`, `ecom-payment`, `ecom-customer-service` | 围绕订单创建售后单、审批、退款支付记录和客服工单。 |
| 结算对账 | `ecom-finance` | `ecom-payment`, `ecom-merchant` | 基于支付单与商家资料生成结算记录和商家结算状态。 |

## 边界风险

- `ecom-trade` 对多个下游 Dubbo URL 有强配置依赖，端口和环境变量变更会直接影响流程。
- `ecom-console` 对商品、库存和营销的本地 HTTP 端口有强依赖，端口不一致会导致运营入口失败。
- demo 使用通用 `Map<String,Object>` 契约，字段兼容性需要在真实需求中补充 DTO 或契约测试。
- 多应用都有 `status` 字段但状态机不统一，跨应用流程需要统一终态和补偿语义。
- 当前未检测到 MQ，异步消息或事件最终一致能力需另行确认。
