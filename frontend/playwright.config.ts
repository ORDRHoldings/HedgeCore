import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 1,
  // Legacy specs referencing non-existent routes (/policy-desk, /execution-desk,
  // /decision-desk, /input) or hardcoded prod backends — excluded until rewritten.
  testIgnore: [
    "**/happy_path.spec.ts",
    "**/decision-desk.spec.ts",
    "**/position_persistence.spec.ts",
    "**/policy_desk_confirmation.spec.ts",
    "**/rejection_path.spec.ts",
    "**/invalid_input.spec.ts",
    "**/position_lifecycle.spec.ts",
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
