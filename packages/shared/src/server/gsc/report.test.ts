import { describe, expect, it } from "vitest";
import { dailyRows, finalDay, listRequest, topList } from "./report";

const answer = (...rows: { keys: string[]; clicks: number; impressions: number; position: number }[]) => ({ rows });

describe("dailyRows", () => {
  it("writes clicks and impressions for every day, a measured zero where Search Console left the day out, and a position only where there was one", () => {
    const rows = dailyRows(answer({ keys: ["2026-11-01"], clicks: 4, impressions: 90, position: 8.5 }), ["2026-11-01", "2026-11-02"]);
    expect(rows).toEqual([
      { metric: "gsc.clicks", day: "2026-11-01", value: 4 },
      { metric: "gsc.impressions", day: "2026-11-01", value: 90 },
      { metric: "gsc.position", day: "2026-11-01", value: 8.5 },
      { metric: "gsc.clicks", day: "2026-11-02", value: 0 },
      { metric: "gsc.impressions", day: "2026-11-02", value: 0 },
    ]);
  });
});

describe("topList", () => {
  it("keeps the top rows by clicks, drops blank keys and rows with no clicks, and rounds", () => {
    expect(topList(answer({ keys: ["physio near me"], clicks: 7.4, impressions: 50, position: 3 }, { keys: ["  "], clicks: 9, impressions: 9, position: 1 }, { keys: ["seen only"], clicks: 0, impressions: 30, position: 20 }))).toEqual([{ key: "physio near me", count: 7 }]);
  });
});

describe("requests and the finished day", () => {
  it("asks only for finished days, ten rows for a list", () => {
    expect(listRequest("query", "2026-11-01", "2026-11-03")).toMatchObject({ dimensions: ["query"], dataState: "final", rowLimit: 10 });
  });
  it("ends three days before today", () => {
    expect(finalDay("2026-11-03")).toBe("2026-10-31");
  });
});
