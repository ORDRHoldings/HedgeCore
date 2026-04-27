import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from './helpers/auth';

test.describe('Treasury Suite Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('hedge desk overview loads', async ({ page }) => {
    await navigateAuth(page, '/hedge-desk');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Hedge Desk', { timeout: 10000, ignoreCase: true });
  });

  test('hedge monitor loads', async ({ page }) => {
    await navigateAuth(page, '/hedge-monitor');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Monitor', { timeout: 10000, ignoreCase: true });
  });

  test('trade history loads', async ({ page }) => {
    await navigateAuth(page, '/trade-history');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('History', { timeout: 10000, ignoreCase: true });
  });

  test('pre-trade TCA loads', async ({ page }) => {
    await navigateAuth(page, '/pre-trade-tca');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('TCA', { timeout: 10000, ignoreCase: true });
  });

  test('natural hedging loads', async ({ page }) => {
    await navigateAuth(page, '/natural-hedging');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Natural', { timeout: 10000, ignoreCase: true });
  });

  test('hedge templates loads', async ({ page }) => {
    await navigateAuth(page, '/hedge-templates');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Template', { timeout: 10000, ignoreCase: true });
  });

  test('hedge effectiveness loads', async ({ page }) => {
    await navigateAuth(page, '/hedge-effectiveness');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Effectiveness', { timeout: 10000, ignoreCase: true });
  });

  test('position desk loads', async ({ page }) => {
    await navigateAuth(page, '/position-desk');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Position', { timeout: 10000, ignoreCase: true });
  });

  test('GL postings loads', async ({ page }) => {
    await navigateAuth(page, '/gl-postings');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('GL Postings', { timeout: 10000, ignoreCase: true });
  });

  test('settlement loads', async ({ page }) => {
    await navigateAuth(page, '/settlement');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Settlement', { timeout: 10000, ignoreCase: true });
  });

  test('ERP sync loads', async ({ page }) => {
    await navigateAuth(page, '/erp-sync');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('ERP', { timeout: 10000, ignoreCase: true });
  });

  test('cash positions loads', async ({ page }) => {
    await navigateAuth(page, '/cash-positions');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Cash', { timeout: 10000, ignoreCase: true });
  });

  test('cash forecast loads', async ({ page }) => {
    await navigateAuth(page, '/cash-forecast');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Forecast', { timeout: 10000, ignoreCase: true });
  });

  test('intercompany netting loads', async ({ page }) => {
    await navigateAuth(page, '/intercompany-netting');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Netting', { timeout: 10000, ignoreCase: true });
  });

  test('bank statements loads', async ({ page }) => {
    await navigateAuth(page, '/bank-statements');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Statement', { timeout: 10000, ignoreCase: true });
  });

  test('payments loads', async ({ page }) => {
    await navigateAuth(page, '/payments');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Payment', { timeout: 10000, ignoreCase: true });
  });

  test('debt portfolio loads', async ({ page }) => {
    await navigateAuth(page, '/debt');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Debt', { timeout: 10000, ignoreCase: true });
  });

  test('IR risk loads', async ({ page }) => {
    await navigateAuth(page, '/ir-risk');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('IR Risk', { timeout: 10000, ignoreCase: true });
  });

  test('counterparties loads', async ({ page }) => {
    await navigateAuth(page, '/counterparties');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Counterparty', { timeout: 10000, ignoreCase: true });
  });

  test('regulatory submissions loads', async ({ page }) => {
    await navigateAuth(page, '/regulatory-submissions');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText('Regulatory', { timeout: 10000, ignoreCase: true });
  });
});
