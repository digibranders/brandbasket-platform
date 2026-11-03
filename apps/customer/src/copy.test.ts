import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Words rules every source file under src keeps (plan 60, section 12; BUILD-RULES rules 10 and 11): no em or en dashes in
 * anything a person reads, comments included, and prices that include GST never say it is added on top.
 */

const SRC = import.meta.dirname;

const BANNED: readonly { readonly name: string; readonly text: string }[] = [
  { name: "em dash (U+2014)", text: "\u2014" },
  { name: "en dash (U+2013)", text: "\u2013" },
  // Built in two parts so this file does not contain what it looks for.
  { name: "GST added on top", text: "+" + " GST" },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

/** Every "file:line: rule" where a banned text appears. */
export function copyViolations(files: readonly { readonly path: string; readonly text: string }[]): string[] {
  return files.flatMap(({ path, text }) =>
    text.split("\n").flatMap((line, index) =>
      BANNED.filter((rule) => line.includes(rule.text)).map((rule) => `${path}:${index + 1}: ${rule.name}`),
    ),
  );
}

describe("copy rules", () => {
  it("finds a banned text when it is there", () => {
    expect(copyViolations([{ path: "x.tsx", text: `ok\nBuilt \u2014 fast\n\u20b92,999 ${"+"} GST` }])).toEqual([
      "x.tsx:2: em dash (U+2014)",
      "x.tsx:3: GST added on top",
    ]);
  });

  it("has no em dash, en dash or added GST in any source file", () => {
    const files = sourceFiles(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, "utf8") }));
    expect(files.length).toBeGreaterThan(0);
    expect(copyViolations(files)).toEqual([]);
  });
});
