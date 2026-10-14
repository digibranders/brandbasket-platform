import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Database-backed tests need a migrated test database; they run under vitest.integration.config.ts.
    exclude: ["src/**/*.integration.test.ts"],
  },
});
