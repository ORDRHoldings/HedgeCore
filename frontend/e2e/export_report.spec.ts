import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { loginAsDemo } from './helpers/auth';

test.describe('Report Export', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  test('exports Hedge Plan Report as CSV', async ({ page }) => {
    await page.goto('/reports');

    await page.click('[data-testid="select-run"]');
    await page.locator('[data-testid="run-option"]').first().click();

    await page.click('[data-testid="generate-hedge-plan"]');
    await expect(page.locator('[data-testid="report-preview"]')).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-csv"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/hedge.*\.csv$/i);

    const filePath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('record_id');
    expect(content.split('\n').length).toBeGreaterThan(1);
  });

  test('exports Committee Pack JSON', async ({ page }) => {
    await page.goto('/committee-pack');

    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="export-json"]');
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.json$/i);

    const filePath = path.join('/tmp', download.suggestedFilename());
    await download.saveAs(filePath);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    expect(data).toHaveProperty('run_id');
    expect(data).toHaveProperty('generated_by');
    expect(data).toHaveProperty('generated_at');
  });
});
