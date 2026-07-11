# 支付域 Knowledge

Repository: `ecom-payment`

## Summary

Provides payment order, cashier, channel callback, refund payment, and reconciliation facts.

## Capabilities

- payment-order
- cashier
- channel-callback
- refund-payment
- payment-reconciliation

## Owned Concepts

- payment-order
- payment-channel
- refund-payment-order

## Cross-Domain Dependencies

Upstream dependencies:
- trade
- aftersales

Downstream consumers:
- finance

## Requirement Keywords

- 支付
- 收银台
- 支付单
- 回调
- 退款支付
- 支付渠道

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
