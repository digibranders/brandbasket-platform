import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\/(.*)$/, replacement: `${projectRoot}$1` }],
  },
  test: {
    environment: "node",
    include: ["*.test.{ts,tsx}", "lib/**/*.test.{ts,tsx}", "content/**/*.test.{ts,tsx}", "app/**/*.test.{ts,tsx}", "components/**/*.test.{ts,tsx}"],
  },
});
