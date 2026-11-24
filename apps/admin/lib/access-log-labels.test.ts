import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STAFF_ACCESS_ACTIONS } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { parseAccessLogFilters } from "./access-log-filters";
import { ACTION_GROUPS, ACTION_LABELS } from "./access-log-labels";

const APP_DIR = join(import.meta.dirname, "..", "app");
const listed: readonly string[] = STAFF_ACCESS_ACTIONS;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

/** Names the code spells out where it writes to the access log, plus the ones built from a variable. */
function writtenActions(): string[] {
  const found = new Set<string>();
  for (const path of sources(APP_DIR)) {
    const text = readFileSync(path, "utf8");
    if (!/logStaffAccess(OrThrow)?\(/.test(text)) continue;
    for (const match of text.matchAll(/action: "([a-z_]+\.[a-z_]+)"/g)) found.add(match[1] as string);
  }
  const built = [
    ...["customer_no_show", "team_no_show", "rescheduled"].map((outcome) => `setup_call.${outcome}`),
    ...["quote", "included", "free", "preview", "shipped", "declined"].map((move) => `change_request.${move}`),
    "report.hold",
    "report.release",
  ];
  return [...found, ...built];
}

describe("the access log's action list", () => {
  it("holds every action the console writes", () => {
    expect(writtenActions().filter((action) => !listed.includes(action))).toEqual([]);
  });

  it("has a label and exactly one filter group for each action", () => {
    const grouped = ACTION_GROUPS.flatMap((group) => group.actions);
    expect([...grouped].sort()).toEqual([...listed].sort());
    expect(Object.keys(ACTION_LABELS).sort()).toEqual([...listed].sort());
  });

  it("accepts a newly listed action as a filter", () => {
    expect(parseAccessLogFilters({ action: "report.view" }).filter).toEqual({ action: "report.view" });
  });
});
