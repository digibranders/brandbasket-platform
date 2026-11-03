import { describe, expect, it } from "vitest";
import { channelList, channelOf, channelRequest, dailyRequest, dailyRows, pageList, parseReport } from "./report";

const row = (dimension: string, ...metrics: number[]) => ({ dimensionValues: [{ value: dimension }], metricValues: metrics.map((value) => ({ value: String(value) })) });

describe("dailyRows", () => {
  it("writes every metric for every day of the window, and a day Google left out is a measured zero", () => {
    const report = parseReport({ rows: [row("20261101", 12, 9, 30, 410, 2)] });
    const rows = dailyRows(report, ["2026-11-01", "2026-11-02"]);
    expect(rows.filter((r) => r.day === "2026-11-01").map((r) => [r.metric, r.value])).toEqual([
      ["ga4.visits", 12],
      ["ga4.visitors", 9],
      ["ga4.pageviews", 30],
      ["ga4.engaged_seconds", 410],
      ["ga4.key_events", 2],
    ]);
    expect(rows.filter((r) => r.day === "2026-11-02").every((r) => r.value === 0)).toBe(true);
    expect(rows).toHaveLength(10);
  });

  it("ignores a row whose date is not eight digits, and a number that is not a number", () => {
    const report = parseReport({ rows: [row("(other)", 5, 5, 5, 5, 5), { dimensionValues: [{ value: "20261101" }], metricValues: [{ value: "x" }] }] });
    expect(dailyRows(report, ["2026-11-01"]).every((r) => r.value === 0)).toBe(true);
  });

  it("reads an answer with no rows at all", () => {
    expect(dailyRows(parseReport({}), ["2026-11-01"])).toHaveLength(5);
  });
});

describe("channelList", () => {
  it("maps Google's groups to our channels, adds those that share one, and ranks them (a tie goes alphabetically)", () => {
    const report = parseReport({ rows: [row("Organic Search", 50), row("Direct", 20), row("Paid Search", 5), row("Paid Social", 4), row("Referral", 3), row("Affiliate", 2), row("Organic Social", 9)] });
    expect(channelList(report)).toEqual([
      { key: "search", count: 50 },
      { key: "direct", count: 20 },
      { key: "paid", count: 9 },
      { key: "social", count: 9 },
      { key: "referral", count: 5 },
    ]);
  });

  it("is empty when there were no visits, so the caller leaves the list out", () => {
    expect(channelList(parseReport({ rows: [row("Direct", 0)] }))).toEqual([]);
    expect(channelOf("Something New")).toBe("referral");
  });
});

describe("pageList", () => {
  it("keeps paths only, drops queries, fragments and (not set), and adds the same path", () => {
    const report = parseReport({ rows: [row("/book?utm_source=x", 10), row("/book", 5), row("(not set)", 99), row("/about#team", 3), row("https://other.example/x", 7)] });
    expect(pageList(report)).toEqual([
      { key: "/book", count: 15 },
      { key: "/about", count: 3 },
    ]);
  });

  it("returns at most ten", () => {
    const report = parseReport({ rows: Array.from({ length: 15 }, (_, i) => row(`/p${i}`, i + 1)) });
    expect(pageList(report)).toHaveLength(10);
  });
});

describe("requests", () => {
  it("ask for the date dimension and five metrics, and for the channel group", () => {
    const range = { startDate: "2026-10-05", endDate: "2026-11-02" };
    expect(dailyRequest(range).metrics.map((m) => m.name)).toEqual(["sessions", "activeUsers", "screenPageViews", "userEngagementDuration", "keyEvents"]);
    expect(channelRequest(range).dimensions).toEqual([{ name: "sessionDefaultChannelGroup" }]);
  });
});
