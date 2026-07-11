# 内容域 Knowledge

Repository: `ecom-content`

## Summary

Manages product content, posts, short videos, live sessions, comments, creators, and moderation workflow.

## Capabilities

- post
- short-video
- live-session
- comment
- creator
- content-moderation

## Owned Concepts

- post
- video
- live-room
- comment
- creator-profile

## Cross-Domain Dependencies

Upstream dependencies:
- product
- merchant
- user

Downstream consumers:
- marketing
- customer-service

## Requirement Keywords

- 内容
- 短视频
- 直播
- 图文
- 评论
- 达人
- 种草

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
