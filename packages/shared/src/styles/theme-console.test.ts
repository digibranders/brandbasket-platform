import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "theme.css"), "utf8");

/** The value of a custom property in the first block that declares it. */
function token(name: string): string {
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  if (match?.[1] === undefined) throw new Error(`${name} is not declared in theme.css`);
  return match[1].trim();
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("console v2 tokens", () => {
  it("scopes the new tokens to the console", () => {
    const start = css.indexOf('html[data-app="console"] {');
    const block = css.slice(start, css.indexOf("}", start));
    for (const name of ["--color-sage-text", "--color-rattan-soft", "--color-row-hover", "--shadow-popover"]) {
      expect(block).toContain(`${name}:`);
    }
  });

  it("keeps text on its wash at 4.5:1 or better", () => {
    const pairs: [string, string][] = [
      ["--color-sage-text", "--color-sage-wash"],
      ["--color-sage-text", "--color-surface"],
      ["--color-error", "--color-error-wash"],
      ["--color-ink-2", "--color-rattan-soft"],
      ["--color-ink-2", "--color-row-hover"],
    ];
    for (const [fg, bg] of pairs) expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it("uses the same popover shadow as the hero card", () => {
    expect(token("--shadow-popover")).toBe(token("--shadow-hero"));
  });
});
