DELETE FROM inventory_campaign_protections
WHERE campaign_id LIKE 'CAMP-GUARD-%'
   OR sku_id IN ('SKU-GUARD-1', 'SKU-GUARD-OFF', 'SKU-GUARD-LOW');

DELETE FROM inventory_stocks
WHERE id IN ('STOCK-GUARD-1', 'STOCK-GUARD-OFF', 'STOCK-GUARD-LOW');
