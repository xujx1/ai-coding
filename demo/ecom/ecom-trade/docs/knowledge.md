# 交易域 Knowledge

Repository: `ecom-trade`

## Summary

Owns cart, order creation, order state machine, order cancellation, and trade orchestration.

## Capabilities

- cart
- order-create
- order-state-machine
- order-cancel
- trade-orchestration

## Owned Concepts

- cart
- order
- order-line
- trade-state

## Cross-Domain Dependencies

Upstream dependencies:
- product
- user
- marketing
- inventory

Downstream consumers:
- payment
- fulfillment
- aftersales
- finance

## Requirement Keywords

- 购物车
- 下单
- 订单
- 订单状态
- 取消订单
- 交易

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
