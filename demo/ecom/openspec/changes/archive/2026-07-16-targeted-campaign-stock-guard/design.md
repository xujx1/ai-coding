# 设计说明：定向营销活动库存保护

## 总体设计

创建阶段由 `ecom-marketing` 同步调用 `ecom-product` 和 `ecom-inventory` 完成校验，校验通过后保存活动草稿和保护库存需求。启用阶段再次校验商品状态，再调用库存保护接口。删除阶段调用库存释放接口并保持删除幂等。

## 数据设计

`ecom-inventory` 新增 `inventory_campaign_protections` 表：

| 字段 | 说明 |
|------|------|
| `id` | 主键，可由 `campaignId + ':' + skuId` 生成 |
| `campaign_id` | 活动 ID |
| `sku_id` | SKU ID |
| `protected_quantity` | 保护库存数量 |
| `status` | `ACTIVE` 或 `RELEASED` |
| `payload_json` | 扩展信息 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

唯一键为 `campaign_id, sku_id`。

## 接口设计

| 应用 | 接口 | 说明 |
|------|------|------|
| `ecom-product` | `POST /business/get` | 兼容 `skuId` 查询，返回 `status`、`saleable`、`priceCent` |
| `ecom-inventory` | `POST /business/query-available` | 查询可保护库存 |
| `ecom-inventory` | `POST /business/protect-campaign-stock` | 幂等创建活动库存保护 |
| `ecom-inventory` | `POST /business/release-campaign-stock` | 幂等释放活动库存保护 |
| `ecom-marketing` | `POST /business/create-campaign` | 扩展 `protectedStock`，创建阶段只校验 |
| `ecom-marketing` | `POST /business/enable-campaign` | 启用阶段执行库存保护 |
| `ecom-marketing` | `POST /business/delete-campaign` | 删除阶段释放库存保护 |

## 幂等设计

1. 库存保护以 `campaignId + skuId` 为业务唯一键。
2. 重复保护同一活动和 SKU 返回成功，不重复减少可保护库存。
3. 缺记录释放、已释放重复释放返回成功。
4. 已删除活动再次删除返回成功。

## 发布顺序

1. `ecom-product`
2. `ecom-inventory`
3. `ecom-marketing`
4. `ecom-console`
5. `ecom-trade` 回归验证
