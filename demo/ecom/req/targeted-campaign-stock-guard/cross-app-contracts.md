# 跨应用契约草稿：定向营销活动库存保护

## 一、契约总览

| 类型 | 提供方 app | 消费方 app | 契约内容 | 兼容策略 | 证据等级 | 状态 |
|------|------------|------------|----------|----------|----------|------|
| HTTP | `ecom-product` | `ecom-marketing`, `ecom-console` | SKU 查询返回存在性、上架状态、价格 | 保持 `/business/get`，兼容 `skuId` 入参 | confirmed | confirmed |
| HTTP | `ecom-inventory` | `ecom-marketing`, `ecom-console` | 可保护库存查询 | 新增接口，不影响既有库存接口 | manual | open |
| HTTP | `ecom-inventory` | `ecom-marketing` | 活动库存保护 | 按 `campaignId + skuId` 幂等 | manual | open |
| HTTP | `ecom-inventory` | `ecom-marketing` | 活动库存释放 | 缺记录、已释放、重复释放均成功 | manual | open |
| HTTP | `ecom-marketing` | `ecom-console` | 创建库存保护活动 | 扩展 `protectedStock`，普通活动兼容 | confirmed | open |
| HTTP | `ecom-marketing` | `ecom-console` | 启用库存保护活动 | 扩展响应保护结果 | confirmed | open |
| HTTP | `ecom-marketing` | `ecom-console` | 删除库存保护活动 | 重复删除成功 | confirmed | open |
| DB | `ecom-inventory` | `ecom-inventory` | `inventory_campaign_protections` 新表 | 独立新表，不改主库存表语义 | manual | open |

## 二、字段契约

| 字段 | 所属接口 | 必填 | 说明 |
|------|----------|------|------|
| `campaignId` | 营销、库存保护、库存释放 | 是 | 活动 ID |
| `skuId` | 商品、库存、营销 | 是 | SKU ID |
| `protectedStock` | 营销创建、库存保护 | 是 | 活动需要保护的库存数量，必须大于 0 |
| `protectableQuantity` | 库存查询 | 是 | 当前可保护库存数量 |
| `productCheck` | 营销响应 | 否 | 商品校验摘要 |
| `inventoryCheck` | 营销响应 | 否 | 库存校验摘要 |
| `protectionResult` | 营销响应 | 否 | 启用或删除阶段的保护处理结果 |
| `idempotent` | 库存保护、库存释放 | 是 | 是否命中幂等成功 |

## 三、幂等规则

1. 库存保护以 `campaignId + skuId` 为唯一业务键。
2. 已存在相同数量的 `ACTIVE` 保护记录时，重复保护返回成功，`idempotent=true`。
3. 释放保护时，保护记录不存在、已释放或重复释放均返回成功。
4. 营销活动已删除后再次删除返回成功，不重复改变库存。

## 四、发布顺序

1. 发布 `ecom-product` 查询兼容。
2. 发布 `ecom-inventory` 新保护表和保护接口。
3. 发布 `ecom-marketing` 编排逻辑。
4. 发布 `ecom-console` 操作入口。
5. 执行 `ecom-trade` 回归验证。
