import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

/** Shares the test database with @brandbasket/db, so files run one at a time. */
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: `${projectRoot}$1` }],
  },
  test: {
    environment: "node",
    // The suites pin Brandbasket's wording, so an INVOICE_PREFIX set in .env.local, which the setup loads, must not change it.
    env: { INVOICE_PREFIX: "" },
    include: ["lib/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
