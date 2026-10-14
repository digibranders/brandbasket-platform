import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: `${projectRoot}$1` }],
  },
  test: {
    environment: "node",
    include: ["*.test.ts", "lib/**/*.test.ts", "content/**/*.test.ts", "app/**/*.test.ts"],
  },
});
