# 财务结算域 Knowledge

Repository: `ecom-finance`

## Summary

Owns reconciliation, merchant settlement, revenue share, invoice facts, tax compliance, and ledger events.

## Capabilities

- reconciliation
- merchant-settlement
- revenue-share
- invoice
- tax-compliance
- ledger

## Owned Concepts

- settlement-bill
- reconciliation-task
- invoice
- ledger-entry

## Cross-Domain Dependencies

Upstream dependencies:
- payment
- trade
- marketing
- merchant

Downstream consumers:
- supply-chain

## Requirement Keywords

- 财务
- 结算
- 对账
- 分润
- 发票
- 税务

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
