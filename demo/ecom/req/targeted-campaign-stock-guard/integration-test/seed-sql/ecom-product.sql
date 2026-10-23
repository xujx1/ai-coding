-- 测试标签: campaign-stock-guard-it-20260716
INSERT INTO product_skus
  (id, spu_id, title, category_id, brand_id, price_cent, saleable, status, payload_json)
VALUES
  ('SKU-GUARD-1', 'SPU-GUARD-1', '库存保护演示商品', 'CAT-GUARD', 'BR-GUARD', 12900, TRUE, 'SALEABLE', JSON_OBJECT('seedTag', 'campaign-stock-guard-it-20260716', 'scenario', 'happy')),
  ('SKU-GUARD-OFF', 'SPU-GUARD-OFF', '未上架演示商品', 'CAT-GUARD', 'BR-GUARD', 13900, FALSE, 'OFF_SHELF', JSON_OBJECT('seedTag', 'campaign-stock-guard-it-20260716', 'scenario', 'off_shelf')),
  ('SKU-GUARD-LOW', 'SPU-GUARD-LOW', '库存不足演示商品', 'CAT-GUARD', 'BR-GUARD', 9900, TRUE, 'SALEABLE', JSON_OBJECT('seedTag', 'campaign-stock-guard-it-20260716', 'scenario', 'low_stock'))
ON DUPLICATE KEY UPDATE
  spu_id=VALUES(spu_id),
  title=VALUES(title),
  category_id=VALUES(category_id),
  brand_id=VALUES(brand_id),
  price_cent=VALUES(price_cent),
  saleable=VALUES(saleable),
  status=VALUES(status),
  payload_json=VALUES(payload_json);
