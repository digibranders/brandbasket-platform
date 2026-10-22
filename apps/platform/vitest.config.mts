import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: `${projectRoot}$1` }],
  },
  test: {
    environment: "node",
    include: ["*.test.ts", "lib/**/*.test.ts", "content/**/*.test.ts", "app/**/*.test.ts"],
    // Database-backed tests need a migrated test database; they run under vitest.integration.config.mts.
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
  },
});
