# 物流域 Knowledge

Repository: `ecom-logistics`

## Summary

Integrates carriers, creates waybills, tracks delivery traces, and reports delivery exceptions.

## Capabilities

- carrier-integration
- waybill
- tracking
- delivery-exception
- tms-adapter

## Owned Concepts

- waybill
- carrier
- tracking-event
- delivery-exception

## Cross-Domain Dependencies

Upstream dependencies:
- fulfillment

Downstream consumers:
- customer-service

## Requirement Keywords

- 物流
- 运单
- 轨迹
- 配送
- TMS
- 物流商

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
