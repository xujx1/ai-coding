# 库存域 Knowledge

Repository: `ecom-inventory`

## Summary

Tracks physical stock, available stock, reserved stock, stock release, and multi-warehouse allocation.

## Capabilities

- physical-stock
- available-stock
- reserve-stock
- release-stock
- multi-warehouse-stock

## Owned Concepts

- stock-item
- stock-reservation
- warehouse-stock
- inventory-ledger

## Cross-Domain Dependencies

Upstream dependencies:
- product
- trade
- aftersales

Downstream consumers:
- fulfillment
- supply-chain

## Requirement Keywords

- 库存
- 实物库存
- 可用库存
- 预占
- 释放
- 多仓

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
