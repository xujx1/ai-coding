import { test, expect } from '@playwright/test';

test('generated app verification', async ({ page }) => {
  const frontendUrl = process.env.E2E_FRONTEND_URL;
  const screenshotPath = process.env.E2E_SCREENSHOT_PATH;
  const expectedKeywords = JSON.parse(process.env.E2E_EXPECTED_KEYWORDS || '[]');
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => {
    consoleErrors.push(error.message);
  });

  const response = await page.goto(frontendUrl, { waitUntil: 'domcontentloaded' });
  expect(response && response.ok(), 'frontend should return a successful HTTP response').toBeTruthy();
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);

  const bodyText = (await page.locator('body').innerText()).trim();
  expect(bodyText.length, 'page should render visible text').toBeGreaterThan(0);
  if (expectedKeywords.length > 0) {
    expect(
      expectedKeywords.some(keyword => bodyText.includes(keyword)),
      'page should contain at least one expected business keyword'
    ).toBeTruthy();
  }
  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true });
  }
  expect(consoleErrors, 'page should not emit console errors').toEqual([]);
});
