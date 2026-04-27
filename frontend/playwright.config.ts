import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  // Legacy specs referencing non-existent routes (/policy-desk, /execution-desk,
  // /decision-desk, /input) or hardcoded prod backends — excluded until rewritten.
  testIgnore: [
    "**/happy_path.spec.ts",              // /policy-desk, /execution-desk don't exist
    "**/decision-desk.spec.ts",           // /decision-desk doesn't exist
    "**/position_persistence.spec.ts",    // /input route doesn't exist
    "**/policy_desk_confirmation.spec.ts",// /policy-desk doesn't exist
    "**/phase_complete_reports.spec.ts",  // navigates to /policy-desk
    "**/rejection_path.spec.ts",          // data-testid selectors not in UI
    "**/invalid_input.spec.ts",           // data-testid selectors not in UI
    "**/position_lifecycle.spec.ts",      // hardcodes prod backend URL
  ],
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
