# 售后域 Knowledge

Repository: `ecom-aftersales`

## Summary

Handles refund, return, exchange, aftersales workflow, evidence, and dispute decisions.

## Capabilities

- refund
- return
- exchange
- aftersales-workflow
- dispute-evidence

## Owned Concepts

- aftersales-order
- refund-request
- return-package
- dispute-case

## Cross-Domain Dependencies

Upstream dependencies:
- trade
- payment
- fulfillment

Downstream consumers:
- inventory
- finance
- customer-service

## Requirement Keywords

- 售后
- 退款
- 退货
- 换货
- 纠纷
- 仲裁

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
