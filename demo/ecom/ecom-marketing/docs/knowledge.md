# 营销域 Knowledge

Repository: `ecom-marketing`

## Summary

Manages campaigns, coupons, discount rules, flash sale, group-buy, points, and eligibility checks.

## Capabilities

- campaign
- coupon
- discount-rule
- flash-sale
- group-buy
- points
- eligibility-check

## Owned Concepts

- campaign
- coupon-template
- coupon-instance
- promotion-rule
- points-ledger

## Cross-Domain Dependencies

Upstream dependencies:
- product
- user

Downstream consumers:
- trade
- finance

## Requirement Keywords

- 营销
- 优惠券
- 满减
- 秒杀
- 拼团
- 积分
- 活动

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
