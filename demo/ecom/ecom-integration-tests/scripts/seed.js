import { seedTargetedCampaignStockGuard } from '../src/data-builders/seed.js';

const result = await seedTargetedCampaignStockGuard();
if (result.skipped) {
  console.log(`seed skipped: ${result.reason}`);
} else {
  console.log(JSON.stringify(result, null, 2));
}
