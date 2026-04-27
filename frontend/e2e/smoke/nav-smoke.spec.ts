/**
 * nav-smoke.spec.ts — visits every major nav section and asserts the
 * page renders without crashing the error boundary.
 *
 * This is intentionally shallow: it catches the class of regression
 * where a page throws on first paint (null-deref, missing API field,
 * theme-token undefined). Per-feature deep specs live in their own files.
 *
 * A page is considered "healthy" if ALL of:
 *   - HTTP navigation succeeds
 *   - <body> is visible
 *   - No "Error" fallback from FeatureErrorPage is rendered
 *   - No unhandled browser console errors above threshold
 */
import { test, expect } from '@playwright/test';
import { loginAsDemo, navigateAuth } from '../helpers/auth';

const NAV_SECTIONS: Array<{ path: string; label: string }> = [
  // ── Dashboard & Portfolio ──────────────────────────────────────────────────
  { path: '/dashboard',                   label: 'dashboard' },
  { path: '/portfolio',                   label: 'portfolio' },
  { path: '/portfolio-risk',              label: 'portfolio-risk' },

  // ── Treasury Suite ────────────────────────────────────────────────────────
  { path: '/hedge-desk',                  label: 'hedge-desk' },
  { path: '/hedge-monitor',               label: 'hedge-monitor' },
  { path: '/hedge-effectiveness',         label: 'hedge-effectiveness' },
  { path: '/trade-history',               label: 'trade-history' },
  { path: '/position-desk',               label: 'position-desk' },
  { path: '/policies',                    label: 'policies' },
  { path: '/pre-trade-tca',               label: 'pre-trade-tca' },
  { path: '/natural-hedging',             label: 'natural-hedging' },
  { path: '/gl-postings',                 label: 'gl-postings' },
  { path: '/settlement',                  label: 'settlement' },
  { path: '/erp-sync',                    label: 'erp-sync' },
  { path: '/cash-positions',              label: 'cash-positions' },
  { path: '/cash-forecast',               label: 'cash-forecast' },
  { path: '/intercompany-netting',        label: 'intercompany-netting' },
  { path: '/bank-statements',             label: 'bank-statements' },
  { path: '/payments',                    label: 'payments' },
  { path: '/debt',                        label: 'debt' },
  { path: '/ir-risk',                     label: 'ir-risk' },
  { path: '/counterparties',              label: 'counterparties' },
  { path: '/regulatory-submissions',      label: 'regulatory-submissions' },

  // ── Accounting Connectors ─────────────────────────────────────────────────
  { path: '/erp-integration',             label: 'erp-integration' },
  { path: '/accounting-connection',       label: 'accounting-connection' },
  { path: '/connectors/hub',              label: 'connectors-hub' },

  // ── Reports ───────────────────────────────────────────────────────────────
  { path: '/reports',                     label: 'reports' },
  { path: '/results',                     label: 'results' },

  // ── Audit Lab ─────────────────────────────────────────────────────────────
  { path: '/audit-lab',                   label: 'audit-lab' },

  // ── Market ───────────────────────────────────────────────────────────────
  { path: '/market-intelligence',         label: 'market-intelligence' },

  // ── Research ─────────────────────────────────────────────────────────────
  { path: '/sandbox',                     label: 'sandbox' },
  { path: '/scenario-studio',             label: 'scenario-studio' },

  // ── Governance ───────────────────────────────────────────────────────────
  { path: '/staging',                     label: 'staging' },
  { path: '/ledger',                      label: 'ledger' },
  { path: '/audit-trail',                 label: 'audit-trail' },
  { path: '/run-viewer',                  label: 'run-viewer' },
  { path: '/lineage',                     label: 'lineage' },
  { path: '/hedgewiki',                   label: 'hedgewiki' },

  // ── Settings ─────────────────────────────────────────────────────────────
  { path: '/settings',                    label: 'settings' },
  { path: '/settings/notifications',      label: 'settings-notifications' },
  { path: '/settings/gl-accounts',        label: 'settings-gl-accounts' },
  { path: '/settings/legal-entities',     label: 'settings-legal-entities' },
  { path: '/settings/bank-accounts',      label: 'settings-bank-accounts' },
];

test.describe('Nav smoke — every section paints without error', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsDemo(page);
  });

  for (const { path, label } of NAV_SECTIONS) {
    test(`${label} renders without error boundary`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('pageerror', (err) => consoleErrors.push(err.message));

      await navigateAuth(page, path);
      await expect(page.locator('body')).toBeVisible();

      // FeatureErrorPage fallback renders "<feature> — Error" banner
      const errorBanner = page.locator('text=— Error').first();
      expect(await errorBanner.isVisible({ timeout: 500 }).catch(() => false))
        .toBe(false);

      // Tolerate minor console noise (preloads, 404 assets) but no hard throws
      const hardErrors = consoleErrors.filter((m) =>
        !m.includes('Failed to load resource') && !m.includes('favicon'),
      );
      expect(hardErrors, `${label} threw: ${hardErrors.join(' | ')}`).toEqual([]);
    });
  }
});
