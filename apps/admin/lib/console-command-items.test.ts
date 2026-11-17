import { describe, expect, it } from "vitest";
import { ACTION_ITEMS, addRecent, goToItems, hitsForMode, hitToItem, parseRecent, RECENT_LIMIT } from "./console-command-items";
import { CONSOLE_RAIL } from "./console-rail";

describe("goToItems", () => {
  it("lists every page of every menu item with its link, with no role filter", () => {
    const items = goToItems();
    expect(items).toHaveLength(CONSOLE_RAIL.reduce((sum, group) => sum + group.pages.length, 0));
    expect(items.every((item) => item.group === "go" && item.href?.startsWith("/"))).toBe(true);
  });
});

describe("ACTION_ITEMS", () => {
  it("only link to routes, so each keeps its own guard", () => {
    expect(ACTION_ITEMS.every((item) => item.group === "action" && item.href !== undefined && item.run === undefined)).toBe(true);
  });
});

describe("hits", () => {
  const hits = [
    { kind: "client", label: "Sai Dental Care", sub: "Priya Sharma", href: "/clients/b1" },
    { kind: "request", label: "Change the hours", sub: "R-0152", href: "/support/t1" },
  ] as const;

  it("turns a hit into an item of its kind", () => {
    expect(hitToItem(hits[0])).toMatchObject({ group: "client", title: "Sai Dental Care", subtitle: "Priya Sharma", href: "/clients/b1" });
  });

  it("keeps only requests in # mode", () => {
    expect(hitsForMode(hits, "requestRef")).toEqual([hits[1]]);
    expect(hitsForMode(hits, "all")).toEqual(hits);
  });
});

describe("recent", () => {
  const item = (n: number) => ({ id: `x${n}`, group: "client" as const, title: `Client ${n}`, subtitle: "Owner", href: `/clients/${n}` });

  it("stores the newest first, without repeats, at most five", () => {
    let raw: string | null = null;
    for (let n = 1; n <= 7; n += 1) raw = addRecent(raw, item(n));
    raw = addRecent(raw, item(5));
    const hrefs = parseRecent(raw).map((entry) => entry.href);
    expect(hrefs).toEqual(["/clients/5", "/clients/7", "/clients/6", "/clients/4", "/clients/3"]);
    expect(hrefs).toHaveLength(RECENT_LIMIT);
  });

  it("stores only the link and the two lines", () => {
    expect(JSON.parse(addRecent(null, item(1)))).toEqual([{ href: "/clients/1", title: "Client 1", subtitle: "Owner" }]);
  });

  it("drops unreadable, off-site and malformed entries", () => {
    expect(parseRecent("not json")).toEqual([]);
    expect(parseRecent(JSON.stringify({ href: "/a" }))).toEqual([]);
    expect(parseRecent(JSON.stringify([{ href: "https://evil.example", title: "x" }, { href: "//evil.example", title: "x" }, { href: "/ok", title: "Ok" }])).map((entry) => entry.href)).toEqual(["/ok"]);
    expect(parseRecent(null)).toEqual([]);
  });

  it("does not store an item with no link", () => {
    expect(JSON.parse(addRecent(null, { id: "a", group: "action", title: "Do it" }))).toEqual([]);
  });
});
