# 商品域 Knowledge

Repository: `ecom-product`

## Summary

Manages SPU, SKU, category attributes, brand data, product media, and base price facts.

## Capabilities

- spu-management
- sku-management
- category-attributes
- brand-catalog
- product-media
- base-price-facts

## Owned Concepts

- spu
- sku
- category
- brand
- product-asset

## Cross-Domain Dependencies

Upstream dependencies:
- none

Downstream consumers:
- search
- trade
- marketing
- inventory

## Requirement Keywords

- 商品
- SPU
- SKU
- 类目
- 属性
- 品牌
- 素材
- 价格

## Validation Notes

When a requirement mentions one of the keywords above, this app should be considered during fanout.
When a requirement touches downstream domains, validate event contracts and state consistency with this service.
