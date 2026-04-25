import type { Page } from '@playwright/test';

/** Token captured from login response for API-level tests */
let _capturedToken = "";

export async function loginAsDemo(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');

  // If already redirected to dashboard (rare), we're done
  if (page.url().includes('/dashboard') || page.url().includes('/welcome')) {
    return;
  }

  // Fill Terminal ID — first visible text input on login form
  const userField = page.locator('input[type="text"], input[type="email"], input[autocomplete="username"]').first();
  await userField.fill('demo');

  // Fill password
  await page.fill('input[type="password"]', 'demo');

  // Capture the login response to extract access_token
  // Must be a JSON response (the backend API), not the HTML login page
  const loginRespPromise = page.waitForResponse(
    r => r.url().includes("/auth/login") && r.status() === 200
      && (r.headers()["content-type"] ?? "").includes("application/json"),
    { timeout: 15000 }
  );

  // Submit
  await page.locator('button[type="submit"]').click();

  try {
    const loginResp = await loginRespPromise;
    const loginData = await loginResp.json();
    _capturedToken = loginData.access_token || "";
  } catch {
    // Response capture raced or timed out — not fatal for most tests
    _capturedToken = "";
  }

  // After login, app may redirect to /dashboard or /welcome
  await page.waitForURL(/dashboard|welcome/, { timeout: 20000 });
}

/** Get the access token captured during login */
export function getCapturedToken(): string {
  return _capturedToken;
}

/**
 * Navigate to a path within the authenticated SPA.
 * Uses sidebar links when possible to preserve React state.
 * Falls back to direct goto + wait for auth refresh.
 */
export async function navigateAuth(page: Page, path: string): Promise<void> {
  // Try SPA navigation via sidebar link first
  const link = page.locator(`a[href*="${path}"]`).first();
  if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
    await link.click();
    await page.waitForLoadState("networkidle");
    return;
  }

  // Fall back to page.goto — auth context may be lost
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}
