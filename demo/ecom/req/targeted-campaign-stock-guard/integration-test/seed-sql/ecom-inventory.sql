-- 测试标签: campaign-stock-guard-it-20260716
INSERT INTO inventory_stocks
  (id, sku_id, warehouse_id, quantity, available_quantity, status, payload_json)
VALUES
  ('STOCK-GUARD-1', 'SKU-GUARD-1', 'WH-GUARD', 100, 100, 'AVAILABLE', JSON_OBJECT('seedTag', 'campaign-stock-guard-it-20260716', 'scenario', 'happy')),
  ('STOCK-GUARD-OFF', 'SKU-GUARD-OFF', 'WH-GUARD', 100, 100, 'AVAILABLE', JSON_OBJECT('seedTag', 'campaign-stock-guard-it-20260716', 'scenario', 'off_shelf')),
  ('STOCK-GUARD-LOW', 'SKU-GUARD-LOW', 'WH-GUARD', 5, 5, 'AVAILABLE', JSON_OBJECT('seedTag', 'campaign-stock-guard-it-20260716', 'scenario', 'low_stock'))
ON DUPLICATE KEY UPDATE
  sku_id=VALUES(sku_id),
  warehouse_id=VALUES(warehouse_id),
  quantity=VALUES(quantity),
  available_quantity=VALUES(available_quantity),
  status=VALUES(status),
  payload_json=VALUES(payload_json);
