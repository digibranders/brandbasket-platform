import { defineConfig } from "vitest/config";

/** Shares the test database with @fynix/db, so files run one at a time. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
