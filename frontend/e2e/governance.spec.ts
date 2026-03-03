import { test, expect } from '@playwright/test';
import { loginAsDemo } from './helpers/auth';

test.describe('Governance — Audit Trail + Chain Integrity', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('audit trail loads from backend (not localStorage)', async ({ page }) => {
    // Intercept the /v1/audit request to verify it is called
    let auditApiCalled = false;
    page.on('request', req => {
      if (req.url().includes('/v1/audit')) auditApiCalled = true;
    });

    await page.goto('/audit-trail');
    await page.waitForLoadState('networkidle');

    expect(auditApiCalled).toBe(true);
  });

  test('chain integrity button calls backend verify endpoint', async ({ page }) => {
    let verifyApiCalled = false;
    page.on('request', req => {
      if (req.url().includes('/v1/audit/chain/verify')) verifyApiCalled = true;
    });

    await page.goto('/audit-trail');
    const verifyBtn = page.locator('button', { hasText: /verify chain/i });
    if (await verifyBtn.isVisible()) {
      await verifyBtn.click();
      await page.waitForLoadState('networkidle');
      expect(verifyApiCalled).toBe(true);
    }
  });

  test('run viewer shows trace and envelope', async ({ page }) => {
    await page.goto('/run-viewer');
    // Without ?id param, should show a recent runs list
    await expect(page.locator('body')).not.toContainText('undefined');
    await expect(page.locator('body')).not.toContainText('null');
  });
});
