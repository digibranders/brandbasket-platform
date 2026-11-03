import { defineConfig, devices } from "@playwright/test";

/*
 * End-to-end tests against a dev server that is already running (no webServer block: the machine is shared).
 * Sign-in runs once per account in the "setup" project; the sweep and the flows reuse the saved sessions.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3197";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/.results",
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 4),
  // The dev server compiles a route on its first visit, which can take a while.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "./e2e/.results/report.json" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 90_000,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      dependencies: ["setup"],
      testMatch: /\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      dependencies: ["setup"],
      // Flows run once, at desktop size; the sweep runs at both sizes.
      testMatch: /sweep\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: false },
    },
  ],
});
