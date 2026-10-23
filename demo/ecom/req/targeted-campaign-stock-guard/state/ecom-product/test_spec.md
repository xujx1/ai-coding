# ecom-product 测试规格

## 用例

| 编号 | 场景 | 预期 |
|------|------|------|
| P-1 | SKU 启用销售 | EX1: 状态为 `SALEABLE` |
| P-2 | SKU 下架 | EX1: 状态为 `OFF_SHELF`；EX2: 保留 `skuId`、`saleable`、`priceCent` |
