import type { VisitDay, VisitList } from "@brandbasket/db";
import { addDays } from "@brandbasket/shared/lib/calendar/local-date";
import { describe, expect, it } from "vitest";
import { listMonths, listPeriod, pickVisits, visitLists, visitsSummary, visitWindow } from "./visits";

const NOW = new Date("2026-11-03T08:00:00.000Z");
const FETCHED = new Date("2026-11-03T00:30:00.000Z");
const window = visitWindow(NOW);

const days = (from: string, count: number, value: number, metric: VisitDay["metric"] = "visits"): VisitDay[] =>
  Array.from({ length: count }, (_, index) => ({ metric, day: addDays(from, index), value, fetchedAt: FETCHED }));

describe("visitWindow", () => {
  it("is the 30 days up to yesterday in India, and the 30 before", () => {
    expect(window).toEqual({ from: "2026-10-04", to: "2026-11-02", previousFrom: "2026-09-04", previousTo: "2026-10-03" });
  });
  it("counts India's day, not UTC's, just after midnight there", () => {
    expect(visitWindow(new Date("2026-11-02T19:00:00.000Z")).to).toBe("2026-11-02");
  });
});

describe("visitsSummary", () => {
  it("is null when no day of the window was measured", () => {
    expect(visitsSummary("own", [], window, NOW)).toBeNull();
    expect(visitsSummary("own", days("2026-08-01", 5, 3), window, NOW)).toBeNull();
  });

  it("sums the measured days and compares only when both windows are complete", () => {
    const rows = [...days(window.previousFrom, 30, 10), ...days(window.from, 30, 12)];
    expect(visitsSummary("own", rows, window, NOW)).toMatchObject({ total: 360, change: 20, period: "Last 30 days", updatedAt: FETCHED });
  });

  it("says since when, and shows no change, when measuring began inside the window", () => {
    const rows = [...days(window.previousFrom, 30, 10), ...days("2026-10-29", 5, 7)];
    const summary = visitsSummary("own", rows, window, NOW);
    expect(summary).toMatchObject({ total: 35, change: null, period: "Since Thu 29 Oct" });
    expect(summary?.days).toHaveLength(5);
  });

  it("never turns a missing day into a zero, and shows no change when nothing changed or the earlier total is zero", () => {
    const gap = days(window.from, 30, 5).filter((row) => row.day !== "2026-10-10");
    expect(visitsSummary("own", gap, window, NOW)?.days).toHaveLength(29);
    expect(visitsSummary("own", [...days(window.previousFrom, 30, 5), ...days(window.from, 30, 5)], window, NOW)?.change).toBeNull();
    expect(visitsSummary("own", [...days(window.previousFrom, 30, 0), ...days(window.from, 30, 5)], window, NOW)?.change).toBeNull();
  });

  it("ignores other metrics and keeps the source", () => {
    const rows = [...days(window.from, 30, 99, "pageviews"), ...days(window.from, 30, 2)];
    expect(visitsSummary("ga4", rows, window, NOW)).toMatchObject({ source: "ga4", total: 60 });
  });

  it("is dated by the newest fetch", () => {
    const rows = days(window.from, 3, 1).map((row, index) => ({ ...row, fetchedAt: new Date(FETCHED.getTime() + index * 1000) }));
    expect(visitsSummary("own", rows, window, NOW)?.updatedAt).toEqual(new Date(FETCHED.getTime() + 2000));
  });
});

describe("pickVisits", () => {
  it("prefers Google Analytics when it has numbers, and falls back to our own", () => {
    const own = visitsSummary("own", days(window.from, 30, 1), window, NOW);
    const ga4 = visitsSummary("ga4", days(window.from, 30, 2), window, NOW);
    expect(pickVisits(ga4, own)?.source).toBe("ga4");
    expect(pickVisits(null, own)?.source).toBe("own");
    expect(pickVisits(null, null)).toBeNull();
  });
});

describe("visitLists", () => {
  const list = (dimension: VisitList["dimension"], rows: Record<string, unknown>[]): VisitList => ({ dimension, rows, fetchedAt: FETCHED });

  it("words the channels, keeps pages as paths, and drops rows it cannot read", () => {
    const lists = visitLists("2026-11-01", [
      list("channel", [{ key: "search", count: 40 }, { key: "mystery", count: 5 }, { key: "referral", count: 3 }]),
      list("page", [{ key: "/book", count: 20 }, { key: "https://x.test", count: 4 }, { key: "/about", count: "9" }, { key: "/", count: 0 }]),
    ]);
    expect(lists?.channels).toEqual([{ label: "Search engines", value: 40 }, { label: "Other websites", value: 3 }]);
    expect(lists?.pages).toEqual([{ label: "/book", value: 20 }]);
    expect(lists?.updatedAt).toEqual(FETCHED);
  });

  it("is null when nothing usable was pulled", () => {
    expect(visitLists("2026-11-01", [])).toBeNull();
    expect(visitLists("2026-11-01", [list("page", [{ key: "?", count: 1 }])])).toBeNull();
  });
});

describe("dates", () => {
  it("names the month and the one before, across a year end", () => {
    expect(listMonths(NOW)).toEqual({ current: "2026-11-01", previous: "2026-10-01" });
    expect(listMonths(new Date("2027-01-02T08:00:00.000Z"))).toEqual({ current: "2027-01-01", previous: "2026-12-01" });
  });
  it("says what a month's lists cover", () => {
    expect(listPeriod("2026-11-01", NOW)).toBe("November so far");
    expect(listPeriod("2026-10-01", NOW)).toBe("October");
  });
});
