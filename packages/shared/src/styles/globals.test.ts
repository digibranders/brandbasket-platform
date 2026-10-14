import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "globals.css"), "utf8");

/**
 * Tailwind resolves `@source` relative to the stylesheet that declares it, and silently scans nothing when the
 * path does not exist. A wrong path costs no error and no warning — the build succeeds and every class used only
 * inside this package is missing from the generated CSS, so shared components render unstyled. That is how
 * `pointer-events-none` and `-z-10` disappeared from the decorative background in both dashboards, leaving it
 * painted over the sign-in card and swallowing the click on the Sign in button.
 */
describe("globals.css @source", () => {
  const paths: readonly string[] = [...css.matchAll(/@source\s+"([^"]+)"/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );

  it("declares at least one source, so this package's own classes are scanned", () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  it.each(paths)("resolves %s to a directory that exists", (path) => {
    expect(existsSync(resolve(here, path))).toBe(true);
  });

  it("covers this package's components", () => {
    const sharedSrc = resolve(here, "..");
    expect(paths.map((path) => resolve(here, path))).toContain(sharedSrc);
  });
});
