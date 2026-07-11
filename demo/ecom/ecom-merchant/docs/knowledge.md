# 店铺商家域 Knowledge

Repository: `ecom-merchant`

## Summary

Supports merchant onboarding, qualification audit, shop profile, shop decoration, and merchant console facts.

## Capabilities

- merchant-onboarding
- qualification-audit
- shop-profile
- shop-decoration
- merchant-console

## Owned Concepts

- merchant
- shop
- qualification
- shop-theme

## Cross-Domain Dependencies

Upstream dependencies:
- finance

Downstream consumers:
- product
- content
- customer-service

## Requirement Keywords

- 商家
- 店铺
- 入驻
- 资质
- 审核
- 店铺装修

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
