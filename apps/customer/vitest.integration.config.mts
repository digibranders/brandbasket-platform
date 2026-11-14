import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcRoot = fileURLToPath(new URL("./src/", import.meta.url));

/** Shares the test database with @brandbasket/db, so files run one at a time. */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: `${srcRoot}$1` }],
  },
  test: {
    environment: "node",
    // The suites pin Brandbasket's wording, so an INVOICE_PREFIX set in .env.local, which the setup loads, must not change it.
    env: { INVOICE_PREFIX: "" },
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
