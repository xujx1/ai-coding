const DEFAULT_BASE_URLS = {
  console: 'http://127.0.0.1:4214',
  marketing: 'http://127.0.0.1:4214',
  product: 'http://127.0.0.1:4210',
  inventory: 'http://127.0.0.1:4215'
};

export function getServiceConfig() {
  return {
    requireLive: process.env.ECOM_REQUIRE_LIVE === '1',
    services: {
      console: process.env.ECOM_CONSOLE_URL || DEFAULT_BASE_URLS.console,
      marketing: process.env.ECOM_MARKETING_URL || DEFAULT_BASE_URLS.marketing,
      product: process.env.ECOM_PRODUCT_URL || DEFAULT_BASE_URLS.product,
      inventory: process.env.ECOM_INVENTORY_URL || DEFAULT_BASE_URLS.inventory
    }
  };
}
