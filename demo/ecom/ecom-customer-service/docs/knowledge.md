# 客服域 Knowledge

Repository: `ecom-customer-service`

## Summary

Handles consultation, work orders, dispute tickets, aftersales support, and bot intent routing.

## Capabilities

- consultation
- work-order
- dispute-ticket
- bot-intent
- service-sla

## Owned Concepts

- ticket
- conversation
- work-order
- service-sla

## Cross-Domain Dependencies

Upstream dependencies:
- user
- trade
- aftersales
- logistics

Downstream consumers:
- none

## Requirement Keywords

- 客服
- 咨询
- 工单
- 纠纷
- 智能客服
- SLA

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
