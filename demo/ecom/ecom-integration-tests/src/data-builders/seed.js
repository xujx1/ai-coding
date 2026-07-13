import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDomainDataBuilders } from './domains.js';
import { getServiceConfig } from '../runtime/config.js';
import { isHealthy } from '../runtime/http-client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

export async function loadFixture(name) {
  const file = path.join(repoRoot, 'fixtures', `${name}.json`);
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

export async function assertRequiredServices(config, serviceNames) {
  const health = await Promise.all(serviceNames.map(async serviceName => ({
    serviceName,
    healthy: await isHealthy(config.services[serviceName])
  })));
  const unavailable = health.filter(item => !item.healthy).map(item => item.serviceName);
  if (unavailable.length) {
    const message = `Required services are not healthy: ${unavailable.join(', ')}`;
    if (config.requireLive) throw new Error(message);
    return { ok: false, message };
  }
  return { ok: true, message: 'ok' };
}

export async function seedTargetedCampaignStockGuard(options = {}) {
  const config = options.config || getServiceConfig();
  const fixture = options.fixture || await loadFixture('targeted-campaign-stock-guard');
  const health = await assertRequiredServices(config, ['product', 'inventory', 'marketing']);
  if (!health.ok) return { skipped: true, reason: health.message };

  const builders = createDomainDataBuilders(config);
  const product = await builders.product.createSku(fixture.product);
  const inventory = await builders.inventory.setStock(fixture.inventory);
  const campaign = await builders.marketing.createCampaign(fixture.marketing);

  return {
    skipped: false,
    scenarioId: fixture.scenarioId,
    product,
    inventory,
    campaign,
    ids: {
      skuId: fixture.product.skuId,
      stockId: fixture.inventory.stockId,
      campaignId: fixture.marketing.campaignId
    }
  };
}
