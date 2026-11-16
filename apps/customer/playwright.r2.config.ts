import { defineConfig, devices } from "@playwright/test";

/*
 * R2-11 release-candidate journeys, axe sweep and keyboard pass, against a locally running customer app and console
 * (no webServer block: the machine is shared). Three viewports: 1440, 768 and 390. See
 * docs/implementation/reports/R2-11.md for the environment and the commands.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3312";
const viewports = { "w1440": { width: 1440, height: 900 }, "w768": { width: 768, height: 1024 }, "w390": { width: 390, height: 844 } } as const;

export default defineConfig({
  testDir: "./e2e/r2",
  outputDir: "./e2e/.results-r2",
  fullyParallel: false,
  workers: Number(process.env.E2E_WORKERS ?? 1),
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["json", { outputFile: "./e2e/.logs-r2/report.json" }]],
  use: { baseURL, trace: "off", screenshot: "off", navigationTimeout: 90_000, locale: "en-IN", timezoneId: "Asia/Kolkata" },
  projects: [
    { name: "setup", testMatch: /accounts\.setup\.ts/ },
    ...Object.entries(viewports).flatMap(([name, viewport]) => [
      { name, dependencies: ["setup"], testMatch: /\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport } },
      { name: `admin-${name}`, testDir: "../admin/e2e", dependencies: ["setup"], testMatch: /\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport } },
    ]),
  ],
});
