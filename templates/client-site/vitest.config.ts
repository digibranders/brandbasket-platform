import { createRequire } from "node:module";
import { dirname } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * A real site installs react and react-dom itself. Inside this repo the template has no node_modules, so the tests
 * borrow the platform's copy; they are not run as part of the platform's own suite.
 */
const fromPlatform = createRequire(new URL("../../apps/platform/package.json", import.meta.url));
const pkg = (name: string): string => dirname(fromPlatform.resolve(`${name}/package.json`));

export default defineConfig({
  resolve: { alias: { "react-dom": pkg("react-dom"), react: pkg("react") } },
});
