import { defineConfig } from "vitest/config";

/** Shares the test database with @brandbasket/db, so files run one at a time. */
export default defineConfig({
  test: {
    environment: "node",
    // The suites pin Brandbasket's wording (FY numbers, "Brandbasket Premium plan"), so an INVOICE_PREFIX set in
    // apps/platform/.env.local, which the setup loads, must not change it.
    env: { INVOICE_PREFIX: "" },
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
