import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  reporter: [["list"], ["json", { outputFile: "e2e-results.json" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || "http://localhost:3000",
    headless: true,
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Lightweight subset: nav-smoke (per-route page-paint check) +
      // full-journey. Runs in well under the 20-min CI window so it can be
      // promoted to a hard gate ahead of the full chromium suite
      // (see RISK-CI-E2E-01 followups).
      name: "smoke",
      testMatch: /e2e[\\/]smoke[\\/].*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Auto-start server in CI; in local dev, start manually with `npm run dev`
  webServer: process.env.CI
    ? {
        command: "npx next start",
        url: "http://localhost:3000",
        reuseExistingServer: false,
        timeout: 60_000,
      }
    : undefined,
});
