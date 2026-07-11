# 履约域 Knowledge

Repository: `ecom-fulfillment`

## Summary

Creates fulfillment orders, splits packages, sources warehouses, dispatches WMS tasks, and syncs delivery status.

## Capabilities

- fulfillment-order
- order-split
- warehouse-sourcing
- wms-dispatch
- delivery-status-sync

## Owned Concepts

- fulfillment-order
- package
- shipment-plan
- wms-task

## Cross-Domain Dependencies

Upstream dependencies:
- trade
- inventory
- user

Downstream consumers:
- logistics
- aftersales

## Requirement Keywords

- 履约
- 拆单
- 寻源
- 发货
- 签收
- WMS

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
