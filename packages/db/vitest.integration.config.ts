import { defineConfig } from "vitest/config";

/** Integration tests share one test database, so files run one at a time. */
export default defineConfig({
  test: {
    environment: "node",
    // The suites pin Fynix Digital's wording (FY numbers, "Fynix Premium plan"), so an INVOICE_PREFIX set in
    // apps/platform/.env.local, which the setup loads, must not change it.
    env: { INVOICE_PREFIX: "" },
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
