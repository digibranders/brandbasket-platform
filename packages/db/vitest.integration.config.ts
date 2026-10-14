import { defineConfig } from "vitest/config";

/** Integration tests share one test database, so files run one at a time. */
export default defineConfig({
  test: {
    environment: "node",
    // The suites pin Firstfold's wording (FF numbers, "Firstfold Premium plan"); apps/platform/.env.local, which the setup
    // loads, says PLATFORM_BRAND=fynix. Fynix's own output has its own tests (tax-invoicing.integration.test.ts, the unit tests).
    env: { PLATFORM_BRAND: "firstfold", INVOICE_PREFIX: "" },
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
