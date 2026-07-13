import { postJson } from '../runtime/http-client.js';

export class ProductDataBuilder {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async createSku(input) {
    const created = await postJson(this.baseUrl, '/business/create-sku', input);
    if (input.saleable === false) {
      return postJson(this.baseUrl, '/business/disable-sale', { skuId: input.skuId });
    }
    return postJson(this.baseUrl, '/business/enable-sale', { skuId: input.skuId });
  }

  async getSku(skuId) {
    return postJson(this.baseUrl, '/business/get', { id: skuId });
  }
}

export class InventoryDataBuilder {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async setStock(input) {
    return postJson(this.baseUrl, '/business/set-stock', input);
  }

  async reserveStock(stockId) {
    return postJson(this.baseUrl, '/business/reserve-stock', { stockId });
  }

  async getStock(stockId) {
    return postJson(this.baseUrl, '/business/get', { id: stockId });
  }
}

export class MarketingDataBuilder {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async createCampaign(input) {
    return postJson(this.baseUrl, '/business/create-campaign', input);
  }

  async enableCampaign(campaignId) {
    return postJson(this.baseUrl, '/business/enable-campaign', { campaignId });
  }

  async getCampaign(campaignId) {
    return postJson(this.baseUrl, '/business/get', { id: campaignId });
  }
}

export function createDomainDataBuilders(serviceConfig) {
  return {
    product: new ProductDataBuilder(serviceConfig.services.product),
    inventory: new InventoryDataBuilder(serviceConfig.services.inventory),
    marketing: new MarketingDataBuilder(serviceConfig.services.marketing)
  };
}
