import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const SKIPPED = new Set(["node_modules", ".next", "public"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIPPED.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Files that exist to receive an old address and send it on, so they may name it. */
const REDIRECTS = new Set(["app/app-host/(protected)/todo/page.tsx", "app/app-host/(protected)/oyechats/page.tsx"]);

function findings(pattern: RegExp): string[] {
  return sourceFiles(ROOT).flatMap((path) => {
    const name = relative(ROOT, path);
    return REDIRECTS.has(name) || !pattern.test(readFileSync(path, "utf8")) ? [] : [name];
  });
}

describe("addresses that moved", () => {
  it("has no link to To do, which is gone: Home asks for what we need, and Social and Local SEO ask on their own pages", () => {
    expect(findings(/["'`]\/todo\b/)).toEqual([]);
  });

  it("has no link to the old OyeChats address, which now lives under Website as Enquiries", () => {
    // The webhook path /api/webhooks/oyechats is a different thing and starts with /api.
    expect(findings(/["'`]\/oyechats\b/)).toEqual([]);
  });
});
