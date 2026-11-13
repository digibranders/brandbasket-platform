import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const srcRoot = fileURLToPath(new URL("./src/", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: `${srcRoot}$1` }],
  },
  test: {
    // happy-dom for the primitives; pure logic runs there too, it touches no DOM.
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: [...configDefaults.exclude, "**/*.integration.test.ts"],
    setupFiles: ["./vitest.setup.ts"],
  },
});
