import type { SearchDay, SearchList } from "@brandbasket/db";
import { addDays } from "@brandbasket/shared/lib/calendar/local-date";
import { describe, expect, it } from "vitest";
import { pageLabel, SEARCH_PRESENCE_COPY, searchDateLine, searchLists, searchSummary, searchWindow } from "./search-presence";

const FETCHED = new Date("2026-11-03T00:30:00.000Z");
const LAST = "2026-10-30";

const days = (metric: SearchDay["metric"], from: string, count: number, value: number | ((index: number) => number)): SearchDay[] =>
  Array.from({ length: count }, (_, index) => ({ metric, day: addDays(from, index), value: typeof value === "number" ? value : value(index), fetchedAt: FETCHED }));

const window = searchWindow(LAST);

describe("searchWindow", () => {
  it("is the 28 days ending at the last measured day, and the 28 before", () => {
    expect(window).toEqual({ from: "2026-10-03", to: "2026-10-30", previousFrom: "2026-09-05", previousTo: "2026-10-02" });
  });
});

describe("searchSummary", () => {
  it("is null when no clicks day was measured, even if other metrics were", () => {
    expect(searchSummary([])).toBeNull();
    expect(searchSummary(days("impressions", window.from, 5, 10))).toBeNull();
  });

  it("ends at the last measured clicks day, not at today", () => {
    const summary = searchSummary(days("clicks", "2026-09-20", 10, 2));
    expect(summary).toMatchObject({ from: "2026-09-20", to: "2026-09-29", clicks: 20 });
  });

  it("sums the window, with the dates it covers and the measured days for the chart", () => {
    const summary = searchSummary([...days("clicks", window.previousFrom, 28, 5), ...days("clicks", window.from, 28, 6)]);
    expect(summary).toMatchObject({ from: "2026-10-03", to: "2026-10-30", clicks: 168, change: 28 });
    expect(summary?.days).toHaveLength(28);
    expect(summary?.days[0]).toEqual({ day: "2026-10-03", value: 6 });
  });

  it("draws a stored zero as zero and leaves an unmeasured day out", () => {
    const rows = days("clicks", window.from, 28, (index) => (index === 9 ? 0 : 4)).filter((row) => row.day !== "2026-10-10");
    const summary = searchSummary(rows);
    expect(summary?.days).toHaveLength(27);
    expect(summary?.days.find((point) => point.day === "2026-10-12")?.value).toBe(0);
    expect(summary?.days.find((point) => point.day === "2026-10-10")).toBeUndefined();
    expect(summary?.clicks).toBe(26 * 4);
  });

  it("shows no change unless both windows are complete", () => {
    expect(searchSummary(days("clicks", window.from, 28, 6))?.change).toBeNull();
    const gap = [...days("clicks", window.previousFrom, 28, 5).filter((row) => row.day !== "2026-09-10"), ...days("clicks", window.from, 28, 6)];
    expect(searchSummary(gap)?.change).toBeNull();
    const short = [...days("clicks", window.previousFrom, 28, 5), ...days("clicks", "2026-10-10", 21, 6)];
    expect(searchSummary(short)?.change).toBeNull();
  });

  it("shows no change when nothing changed or the earlier total is zero, and a negative change as a minus", () => {
    expect(searchSummary([...days("clicks", window.previousFrom, 28, 5), ...days("clicks", window.from, 28, 5)])?.change).toBeNull();
    expect(searchSummary([...days("clicks", window.previousFrom, 28, 0), ...days("clicks", window.from, 28, 5)])?.change).toBeNull();
    expect(searchSummary([...days("clicks", window.previousFrom, 28, 6), ...days("clicks", window.from, 28, 5)])?.change).toBe(-28);
  });

  it("sums impressions over measured days and is null without any", () => {
    const clicks = days("clicks", window.from, 28, 1);
    expect(searchSummary(clicks)?.impressions).toBeNull();
    expect(searchSummary([...clicks, ...days("impressions", window.from, 28, 100)])?.impressions).toBe(2800);
    expect(searchSummary([...clicks, ...days("impressions", window.from, 28, 0)])?.impressions).toBe(0);
  });

  it("averages position weighted by impressions, to one decimal", () => {
    const rows: SearchDay[] = [
      ...days("clicks", window.from, 28, 1),
      { metric: "impressions", day: "2026-10-03", value: 100, fetchedAt: FETCHED },
      { metric: "position", day: "2026-10-03", value: 4, fetchedAt: FETCHED },
      { metric: "impressions", day: "2026-10-04", value: 300, fetchedAt: FETCHED },
      { metric: "position", day: "2026-10-04", value: 8.3, fetchedAt: FETCHED },
    ];
    expect(searchSummary(rows)?.averagePosition).toBe(7.2);
  });

  it("ignores positions without impressions and positions outside the window, and is null without a day that has both", () => {
    const clicks = days("clicks", window.from, 28, 1);
    expect(searchSummary(clicks)?.averagePosition).toBeNull();
    expect(searchSummary([...clicks, ...days("position", window.from, 3, 5)])?.averagePosition).toBeNull();
    expect(searchSummary([...clicks, ...days("impressions", window.from, 3, 0), ...days("position", window.from, 3, 5)])?.averagePosition).toBeNull();
    const outside: SearchDay[] = [
      ...clicks,
      { metric: "impressions", day: window.previousTo, value: 500, fetchedAt: FETCHED },
      { metric: "position", day: window.previousTo, value: 30, fetchedAt: FETCHED },
      { metric: "impressions", day: "2026-10-05", value: 50, fetchedAt: FETCHED },
      { metric: "position", day: "2026-10-05", value: 6, fetchedAt: FETCHED },
    ];
    expect(searchSummary(outside)?.averagePosition).toBe(6);
  });
});

describe("searchDateLine", () => {
  it("names the dates and says Google runs behind", () => {
    expect(searchDateLine({ from: "2026-10-03", to: "2026-10-30" })).toBe("3 Oct to 30 Oct, Google data runs about 3 days behind");
  });
});

describe("pageLabel", () => {
  it("keeps a path, strips an origin and shows the root as Home", () => {
    expect(pageLabel("/menu")).toBe("/menu");
    expect(pageLabel("https://omsweets.in/menu")).toBe("/menu");
    expect(pageLabel("https://omsweets.in/menu?size=1")).toBe("/menu?size=1");
    expect(pageLabel("/")).toBe("Home");
    expect(pageLabel("https://omsweets.in/")).toBe("Home");
    expect(pageLabel("https://omsweets.in")).toBe("Home");
  });
  it("leaves out a key that is not a path", () => {
    expect(pageLabel("menu")).toBeNull();
    expect(pageLabel("https://")).toBeNull();
    expect(pageLabel("")).toBeNull();
  });
});

const list = (dimension: SearchList["dimension"], rows: Record<string, unknown>[]): SearchList => ({ dimension, rows, fetchedAt: FETCHED });

describe("searchLists", () => {
  it("is null when neither list has a usable row", () => {
    expect(searchLists("2026-10-01", [])).toBeNull();
    expect(searchLists("2026-10-01", [list("query", [{ key: "x", count: 0 }]), list("page", [{ key: "menu", count: 4 }])])).toBeNull();
  });

  it("keeps the five biggest rows of each list, biggest first", () => {
    const queries = Array.from({ length: 7 }, (_, index) => ({ key: `search ${String(index)}`, count: index + 1 }));
    const result = searchLists("2026-10-01", [list("query", queries)]);
    expect(result?.queries.map((row) => row.value)).toEqual([7, 6, 5, 4, 3]);
    expect(result?.pages).toEqual([]);
  });

  it("shows pages as paths, adds the same page seen with and without its origin, and skips malformed rows", () => {
    const result = searchLists("2026-10-01", [
      list("page", [
        { key: "https://omsweets.in/", count: 90 },
        { key: "/", count: 6 },
        { key: "/menu", count: 61 },
        { key: "contact", count: 5 },
        { key: "/about", count: "9" },
        { key: 7, count: 3 },
        { key: "/order", count: Number.NaN },
      ]),
    ]);
    expect(result?.pages).toEqual([
      { label: "Home", value: 96 },
      { label: "/menu", value: 61 },
    ]);
  });

  it("carries the month", () => {
    expect(searchLists("2026-10-01", [list("query", [{ key: "sweet shop near me", count: 48 }])])?.month).toBe("2026-10-01");
  });
});

describe("SEARCH_PRESENCE_COPY", () => {
  it("has no em or en dash", () => {
    for (const text of Object.values(SEARCH_PRESENCE_COPY)) expect(text).not.toMatch(new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`));
  });
});
