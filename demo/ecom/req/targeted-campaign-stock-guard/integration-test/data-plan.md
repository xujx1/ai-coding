# 集成数据计划

## 一、数据原则

- 优先复用现有 HTTP 接口造数。
- 仅对基础商品和库存数据使用 SQL seed。
- 不写真实 DSN、密钥或环境 token。
- 所有测试数据使用统一隔离标签 `campaign-stock-guard-it-20260716`。

## 二、数据步骤

| 步骤 | 场景 | owner app | action type | 输入 / 输出引用 | 验证 | 清理 | isolation key / request id / test tag | evidence |
|------|------|-----------|-------------|------------------|------|------|--------------------------------------|----------|
| D-01 | 生成商品基础数据 | `ecom-product` | `sql` | `seed-sql/ecom-product.sql` 生成 `SKU-GUARD-1`、`SKU-GUARD-OFF`、`SKU-GUARD-LOW` | 通过商品查询能读到 SKU、状态、价格 | `cleanup-sql/ecom-product-cleanup.sql` 删除测试 SKU | `testTag=campaign-stock-guard-it-20260716` | confirmed |
| D-02 | 生成库存基础数据 | `ecom-inventory` | `sql` | `seed-sql/ecom-inventory.sql` 生成 `STOCK-GUARD-*` | 通过可保护库存查询能算出充足/不足两类样本 | `cleanup-sql/ecom-inventory-cleanup.sql` 删除测试库存与保护记录 | `testTag=campaign-stock-guard-it-20260716` | confirmed |
| D-03 | 创建可售 SKU | `ecom-product` | `api` | `POST /business/create-sku` + `POST /business/enable-sale` | 返回 `SALEABLE`、`saleable=true`、`priceCent` | 商品 cleanup SQL 删除测试 SKU | `skuId=SKU-GUARD-1` | confirmed |
| D-04 | 创建库存保护活动草稿 | `ecom-marketing` | `api` | `POST /business/create-campaign`，入参含 `protectedStock=30` | 返回 `DRAFT`，并带商品/库存校验摘要 | 删除测试活动 | `campaignId=CAMP-GUARD-1` | confirmed |
| D-05 | 启用活动并创建保护 | `ecom-marketing` / `ecom-inventory` | `api` | `POST /business/enable-campaign` | 返回 `ENABLED`，库存保护记录 `ACTIVE` | 删除测试活动与保护记录 | `campaignId=CAMP-GUARD-1` | confirmed |
| D-06 | 重复启用和重复删除 | `ecom-marketing` / `ecom-inventory` | `api` | 对同一活动再次 `enable-campaign`、`delete-campaign` | 均返回成功且 `idempotent=true` | 删除活动与保护记录 | `campaignId=CAMP-GUARD-REPEAT` | confirmed |
| D-07 | 控制台演示 | `ecom-console` | `manual` | 点击 `stockGuardCampaign` | 页面展示完整创建/启用结果 | 由营销删除活动并清理库存 | `campaignId=CAMP-GUARD-1` | manual |
| D-08 | 交易回归 | `ecom-trade` | `api` | `POST /business/demo-checkout`、`POST /business/demo-cancel` | 交易与取消链路成功，不影响 guard 活动状态 | 清理演示订单 | `orderId=ORD-IT-GUARD-1` | confirmed |

## 三、清理顺序

1. 先删除营销活动与库存保护记录。
2. 再删除库存与商品测试数据。
3. 最后清理交易演示订单。
