# 用户域 Knowledge

Repository: `ecom-user`

## Summary

Owns account, authentication profile, membership level, user tags, identity verification, and address book.

## Capabilities

- account
- member-level
- user-profile
- identity-verification
- address-book
- user-tags

## Owned Concepts

- user-account
- member-profile
- address
- identity-record

## Cross-Domain Dependencies

Upstream dependencies:
- none

Downstream consumers:
- trade
- marketing
- fulfillment
- customer-service

## Requirement Keywords

- 用户
- 会员
- 账号
- 地址
- 实名
- 画像
- 等级

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
