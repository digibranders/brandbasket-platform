import { describe, expect, it } from "vitest";
import { coveredDays, isComplete, searchConsoleFigures, visitorFigures, weightedPosition, type DailyValue, type MonthData, type RunWindow } from "./traffic";

const OCT = { start: "2026-10-01", end: "2026-10-31" };
const SEP = { start: "2026-09-01", end: "2026-09-30" };

const run = (source: RunWindow["source"], windowStart: string, windowEnd: string, ok = true): RunWindow => ({ source, windowStart, windowEnd, ok });
const month = (range: { start: string; end: string }, patch: Partial<MonthData>): MonthData => ({ ...range, daily: [], runs: [], lists: {}, ...patch });
const days = (metric: string, values: Record<string, number>): DailyValue[] => Object.entries(values).map(([day, value]) => ({ metric, day, value }));

describe("completeness", () => {
  it("counts the days of the month that successful runs cover, once each", () => {
    const data = month(OCT, { runs: [run("ga4", "2026-09-25", "2026-10-10"), run("ga4", "2026-10-05", "2026-10-20"), run("ga4", "2026-10-21", "2026-10-31", false)] });
    expect(coveredDays(data, "ga4")).toBe(20);
    expect(coveredDays(data, "own")).toBe(0);
  });

  it("needs 90 percent of the month", () => {
    expect(isComplete(month(OCT, { runs: [run("gsc", "2026-10-01", "2026-10-28")] }), "gsc")).toBe(true);
    expect(isComplete(month(OCT, { runs: [run("gsc", "2026-10-01", "2026-10-27")] }), "gsc")).toBe(false);
  });
});

describe("visitorFigures", () => {
  const ga4 = month(OCT, {
    runs: [run("ga4", "2026-10-01", "2026-10-31")],
    daily: [...days("ga4.visitors", { "2026-10-01": 40, "2026-10-02": 60 }), ...days("ga4.pageviews", { "2026-10-01": 100 })],
    lists: { "ga4.channel": [{ key: "Organic Search", count: 70 }, { key: "bad row" }, { key: "Direct", count: 30 }], "ga4.page": [{ key: "/", count: 80 }] },
  });

  it("uses Google Analytics when it measured the month, with the month before only when that was measured too", () => {
    const figures = visitorFigures(ga4, month(SEP, {}));
    expect(figures).toMatchObject({ source: "ga4", visitors: 100, pageviews: 100, previous: null });
    expect(figures?.channels).toEqual([{ key: "Organic Search", count: 70 }, { key: "Direct", count: 30 }]);
    const withPrevious = visitorFigures(ga4, month(SEP, { runs: [run("ga4", "2026-09-01", "2026-09-30")], daily: days("ga4.visitors", { "2026-09-10": 55 }) }));
    expect(withPrevious?.previous).toEqual({ visitors: 55, pageviews: 0 });
  });

  it("falls back to our own count, and reports a measured quiet month as zero", () => {
    const own = month(OCT, { runs: [run("own", "2026-10-01", "2026-10-31")] });
    expect(visitorFigures(own, month(SEP, {}))).toMatchObject({ source: "own", visitors: 0 });
  });

  it("reports nothing for a source that was connected late in the month", () => {
    expect(visitorFigures(month(OCT, { runs: [run("ga4", "2026-10-20", "2026-10-31")], daily: days("ga4.visitors", { "2026-10-25": 9 }) }), month(SEP, {}))).toBeNull();
  });
});

describe("search console", () => {
  it("weights position by impressions", () => {
    const data = month(OCT, { daily: [...days("gsc.impressions", { "2026-10-01": 100, "2026-10-02": 300 }), ...days("gsc.position", { "2026-10-01": 10, "2026-10-02": 20 })] });
    expect(weightedPosition(data)).toBe(17.5);
    expect(weightedPosition(month(OCT, { daily: days("gsc.position", { "2026-10-01": 10 }) }))).toBeNull();
  });

  it("sums clicks and views over a complete month and lists the top searches", () => {
    const data = month(OCT, {
      runs: [run("gsc", "2026-10-01", "2026-10-31")],
      daily: [...days("gsc.clicks", { "2026-10-01": 4, "2026-10-02": 6 }), ...days("gsc.impressions", { "2026-10-01": 100 })],
      lists: { "gsc.query": [{ key: "physio near me", count: 7 }] },
    });
    expect(searchConsoleFigures(data, month(SEP, {}))).toMatchObject({ clicks: 10, impressions: 100, previous: null, queries: [{ key: "physio near me", count: 7 }] });
    expect(searchConsoleFigures(month(OCT, {}), month(SEP, {}))).toBeNull();
  });
});
