import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * WCAG 2.2 contrast of every token pair plan 60 lists (sections 3 and 15), measured from tokens.css itself, so a changed
 * value that breaks a pair fails here before it ships.
 */

const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");
const rootBlock = /:root\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
const TOKENS: Readonly<Record<string, string>> = Object.fromEntries(
  [...rootBlock.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((match) => [match[1] ?? "", match[2] ?? ""]),
);

function luminance(name: string): number {
  const hex = TOKENS[name];
  if (hex === undefined) throw new Error(`tokens.css has no hex value for --${name}`);
  const [r, g, b] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

const TEXT = 4.5;
const NON_TEXT = 3;

/** [foreground, background, required ratio]: text 4.5, boundaries and marks 3 (WCAG 1.4.3, 1.4.11). */
const PAIRS: readonly (readonly [string, string, number])[] = [
  // Text on the surfaces it sits on
  ...["ink", "ink-2", "ink-3"].flatMap((fg) =>
    ["surface", "canvas", "sidebar", "surface-subtle", "surface-hover", "surface-selected"].map((bg) => [fg, bg, TEXT] as const),
  ),
  ["accent-text", "surface", TEXT],
  ["accent-text", "accent-wash", TEXT],
  ["accent-text", "canvas", TEXT],
  ["on-primary", "primary", TEXT],
  ["on-primary", "primary-hover", TEXT],
  ["on-primary", "toast", TEXT],
  // Badges and banners: text on its own wash, and on a plain surface
  ...["pos", "neg", "warn", "info"].flatMap((tone) => [[`${tone}-text`, `${tone}-wash`, TEXT] as const, [`${tone}-text`, "surface", TEXT] as const]),
  ["neutral-text", "neutral-wash", TEXT],
  ["neg-text", "neg-wash", TEXT],
  // Boundaries and marks that are not text
  ["border-control", "surface", NON_TEXT],
  ["ring", "surface", NON_TEXT],
  ["ring", "canvas", NON_TEXT],
  ["ink-muted", "surface", NON_TEXT],
  ["primary", "surface", NON_TEXT],
  ["c1", "surface", NON_TEXT],
  ["c-ref", "surface", NON_TEXT],
  // Service marks sit beside their names on panels and in the sidebar
  ...["svc-site", "svc-social", "svc-search"].flatMap((mark) => [[mark, "surface", NON_TEXT] as const, [mark, "sidebar", NON_TEXT] as const]),
];

describe("token contrast", () => {
  it("reads every token the pairs name", () => {
    for (const [fg, bg] of PAIRS) {
      expect(TOKENS[fg], fg).toBeDefined();
      expect(TOKENS[bg], bg).toBeDefined();
    }
  });

  it.each(PAIRS)("%s on %s reaches %s:1", (fg, bg, required) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(required);
  });

  it("matches the figures plan 60 publishes", () => {
    expect(contrast("ink", "surface")).toBeCloseTo(18.47, 1);
    expect(contrast("on-primary", "primary")).toBeCloseTo(5.22, 1);
    expect(contrast("border-control", "surface")).toBeCloseTo(3.1, 1);
    expect(contrast("accent-text", "surface")).toBeCloseTo(6.16, 1);
  });
});
