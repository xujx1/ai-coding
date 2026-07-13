import test from 'node:test';
import assert from 'node:assert/strict';
import { getServiceConfig } from '../../src/runtime/config.js';
import { createDomainDataBuilders } from '../../src/data-builders/domains.js';
import { loadFixture, seedTargetedCampaignStockGuard } from '../../src/data-builders/seed.js';

test('targeted campaign can be created after product and inventory data are prepared', async (t) => {
  const config = getServiceConfig();
  const seeded = await seedTargetedCampaignStockGuard({ config });
  if (seeded.skipped) {
    t.skip(seeded.reason);
    return;
  }

  const builders = createDomainDataBuilders(config);
  const product = await builders.product.getSku(seeded.ids.skuId);
  const inventory = await builders.inventory.getStock(seeded.ids.stockId);
  const campaign = await builders.marketing.getCampaign(seeded.ids.campaignId);

  assert.equal(product.id, seeded.ids.skuId);
  assert.equal(product.status, 'SALEABLE');
  assert.equal(inventory.id, seeded.ids.stockId);
  assert.equal(inventory.status, 'AVAILABLE');
  assert.equal(campaign.id, seeded.ids.campaignId);
  assert.equal(campaign.status, 'DRAFT');
  assert.equal(campaign.skuId, seeded.ids.skuId);
});

test('domain data builders can prepare negative-case fixtures for stock guard scenarios', async (t) => {
  const config = getServiceConfig();
  const fixture = await loadFixture('targeted-campaign-stock-guard');
  const seeded = await seedTargetedCampaignStockGuard({ config, fixture });
  if (seeded.skipped) {
    t.skip(seeded.reason);
    return;
  }

  const builders = createDomainDataBuilders(config);
  const offShelfSku = await builders.product.createSku(fixture.negativeCases.offShelfSku);
  const lowStock = await builders.inventory.setStock(fixture.negativeCases.lowStock);

  assert.equal(offShelfSku.id, fixture.negativeCases.offShelfSku.skuId);
  assert.equal(offShelfSku.status, 'OFF_SHELF');
  assert.equal(lowStock.id, fixture.negativeCases.lowStock.stockId);
  assert.equal(lowStock.availableQuantity, fixture.negativeCases.lowStock.availableQuantity);
});
