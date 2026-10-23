# Ecom Flows

| flow | apps | summary | evidence |
| --- | --- | --- | --- |
| 商品上架 | merchant -> product -> content -> marketing/inventory | 商家建店，商品建 SKU，上架后可被内容、营销、库存引用 | confirmed |
| 营销活动库存保护 | product -> inventory -> marketing -> trade | 活动引用 SKU，交易下单前校验营销与库存，库存保护不足时阻断交易 | confirmed |
| 下单支付履约 | user/product/marketing/inventory -> trade -> payment -> fulfillment -> logistics -> finance | 交易编排商品、用户、营销、库存，支付后进入履约、物流与财务 | confirmed |
| 退款售后 | trade/payment/fulfillment -> aftersales -> inventory/finance/customer-service | 售后单处理退款、退货入库、财务冲销和客服协同 | confirmed |
| 结算对账 | payment/trade/marketing/merchant -> finance -> supply-chain | 财务记录支付、营销成本和商家结算，供应链接收结算结果 | confirmed |
