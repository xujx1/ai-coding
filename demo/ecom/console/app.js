const services = {
  product: 4210, trade: 4211, payment: 4212, aftersales: 4213, marketing: 4214,
  inventory: 4215, fulfillment: 4216, logistics: 4217, user: 4218, merchant: 4219,
  content: 4220, 'customer-service': 4221, finance: 4222, 'supply-chain': 4223
};
const out = document.getElementById('output');
const req = document.getElementById('request');
document.querySelectorAll('button[data-action]').forEach(btn => btn.addEventListener('click', () => run(btn.dataset.action)));

async function run(action) {
  try {
    if (action === 'health') return show(action, {}, await Promise.all(Object.entries(services).map(async ([name, port]) => [name, await get(port, '/health')]))); 
    if (action === 'productOnSale') {
      const payload = { skuId: 'SKU-DEMO-1', spuId: 'SPU-DEMO-1', title: 'Dubbo 演示商品', categoryId: 'CAT-DEMO', brandId: 'BR-DEMO', priceCent: 9900, saleable: true };
      await post(4210, '/business/create-sku', payload);
      return show(action, payload, await post(4210, '/business/enable-sale', { skuId: payload.skuId }));
    }
    if (action === 'campaignCreate') {
      const payload = { campaignId: 'CAMP-DEMO-1', name: '满减演示活动', skuId: 'SKU-DEMO-1', discountCent: 1000, quota: 100 };
      await post(4214, '/business/create-campaign', payload);
      return show(action, payload, await post(4214, '/business/enable-campaign', { campaignId: payload.campaignId }));
    }
    if (action === 'campaignDelete') return show(action, { campaignId: 'CAMP-DEMO-1' }, await post(4214, '/business/delete-campaign', { campaignId: 'CAMP-DEMO-1' }));
    if (action === 'checkout') return show(action, {}, await post(4211, '/business/demo-checkout', { orderId: 'ORD-DEMO-1' }));
    if (action === 'cancel') return show(action, {}, await post(4211, '/business/demo-cancel', { orderId: 'ORD-CANCEL-1' }));
    if (action === 'full') return show(action, {}, await post(4211, '/business/demo-full-chain', { orderId: 'ORD-FULL-1' }));
  } catch (error) {
    out.textContent = error.stack || String(error);
  }
}
async function get(port, path) { return fetch('http://127.0.0.1:' + port + path).then(r => r.json()); }
async function post(port, path, body) {
  return fetch('http://127.0.0.1:' + port + path, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) }).then(r => r.json());
}
function show(action, request, response) {
  req.textContent = JSON.stringify({ action, request }, null, 2);
  out.textContent = JSON.stringify(response, null, 2);
}
