# 供应链域 Knowledge

Repository: `ecom-supply-chain`

## Summary

Coordinates procurement, suppliers, replenishment, quality inspection, production planning, and SRM facts.

## Capabilities

- procurement
- supplier
- replenishment
- quality-inspection
- production-plan
- srm

## Owned Concepts

- purchase-order
- supplier
- quality-check
- replenishment-plan

## Cross-Domain Dependencies

Upstream dependencies:
- inventory
- finance

Downstream consumers:
- inventory
- merchant

## Requirement Keywords

- 供应链
- 采购
- 供应商
- SRM
- 质检
- 补货
- 生产计划

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
