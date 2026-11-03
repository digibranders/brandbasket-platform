import { describe, expect, it, vi } from "vitest";
import { Ga4Error, type Ga4Reader } from "./client";
import { monthsOf, pullWindow, runGa4Sync, type Ga4Store } from "./sync";

const NOW = new Date("2026-11-03T04:00:00.000Z");
const row = (dimension: string, ...metrics: number[]) => ({ dimensionValues: [{ value: dimension }], metricValues: metrics.map((value) => ({ value: String(value) })) });

function fakes(latest: string | null = null) {
  const calls: { kind: string; args: unknown[] }[] = [];
  const log = (kind: string) => async (...args: unknown[]) => void calls.push({ kind, args });
  const store: Ga4Store = {
    properties: async () => [{ businessId: "b1", propertyId: "111" }, { businessId: "b2", propertyId: "222" }],
    latestDay: async () => latest,
    writeDaily: log("daily") as never,
    writeList: log("list") as never,
    recordRun: log("run") as never,
    setStatus: log("status") as never,
  };
  return { store, calls };
}

const answer = (property: string, request: { dimensions: { name: string }[] }) =>
  request.dimensions[0]?.name === "date" ? { rows: [row("20261102", 10, 8, 20, 60, 1)] } : request.dimensions[0]?.name === "pagePath" ? { rows: [row("/", 15)] } : { rows: property === "111" ? [row("Direct", 4)] : [] };

describe("pullWindow", () => {
  it("reaches back 60 days the first time, ending yesterday", () => {
    expect(pullWindow(null, "2026-11-02")).toEqual({ start: "2026-09-04", end: "2026-11-02" });
  });
  it("pulls the last three days again, and reaches over a gap but never past 60 days", () => {
    expect(pullWindow("2026-11-02", "2026-11-02")).toEqual({ start: "2026-10-31", end: "2026-11-02" });
    expect(pullWindow("2026-10-20", "2026-11-02")).toEqual({ start: "2026-10-18", end: "2026-11-02" });
    expect(pullWindow("2025-01-01", "2026-11-02").start).toBe("2026-09-04");
  });
});

describe("monthsOf", () => {
  it("is the month so far when the window stays in it, and adds the whole month before when it reaches back", () => {
    expect(monthsOf("2026-11-01", "2026-11-02")).toEqual([{ month: "2026-11-01", startDate: "2026-11-01", endDate: "2026-11-02" }]);
    expect(monthsOf("2026-09-04", "2026-11-02")).toEqual([
      { month: "2026-10-01", startDate: "2026-10-01", endDate: "2026-10-31" },
      { month: "2026-11-01", startDate: "2026-11-01", endDate: "2026-11-02" },
    ]);
  });
});

describe("runGa4Sync", () => {
  it("writes the days, the lists that have rows, the run and a connected status for each business", async () => {
    const { store, calls } = fakes();
    const reader: Ga4Reader = { runReport: async (property, request) => answer(property, request as never) as never };
    const report = await runGa4Sync(reader, store, NOW);
    expect(report).toEqual({ properties: 2, ok: 2, accessLost: 0, failed: 0, failures: [] });
    const daily = calls.filter((c) => c.kind === "daily");
    expect(daily).toHaveLength(2);
    expect((daily[0]?.args[1] as unknown[]).length).toBe(60 * 5);
    // b1 has a channel list; b2 had no channel rows, so that list is left out; both have pages. Two months each.
    expect(calls.filter((c) => c.kind === "list" && c.args[2] === "channel").map((c) => c.args[0])).toEqual(["b1", "b1"]);
    expect(calls.filter((c) => c.kind === "list" && c.args[2] === "page")).toHaveLength(4);
    expect(calls.filter((c) => c.kind === "run").every((c) => c.args[3] === null)).toBe(true);
    expect(calls.filter((c) => c.kind === "status").map((c) => c.args.slice(0, 3))).toEqual([["b1", "connected", null], ["b2", "connected", null]]);
  });

  it("marks a lost grant or a wrong property access_lost, keeps going, and stores the class only", async () => {
    const { store, calls } = fakes("2026-11-02");
    const reader: Ga4Reader = {
      runReport: async (property, request) => {
        if (property === "111") throw new Ga4Error("access_lost", "Google Analytics answered HTTP 403.");
        return answer(property, request as never) as never;
      },
    };
    const report = await runGa4Sync(reader, store, NOW);
    expect(report).toMatchObject({ ok: 1, accessLost: 1, failed: 0 });
    expect(calls.find((c) => c.kind === "status" && c.args[0] === "b1")?.args.slice(1, 3)).toEqual(["access_lost", "access_lost"]);
    expect(calls.find((c) => c.kind === "run" && c.args[0] === "b1")?.args[3]).toBe("access_lost");
    expect(calls.some((c) => c.kind === "daily" && c.args[0] === "b1")).toBe(false);
  });

  it("records a transient failure as a run only, leaving the status alone, and reports it", async () => {
    const { store, calls } = fakes();
    const reader: Ga4Reader = { runReport: vi.fn(async () => { throw new Error("socket hang up"); }) };
    const report = await runGa4Sync(reader, store, NOW);
    expect(report.failures).toEqual([{ businessId: "b1", failure: "error" }, { businessId: "b2", failure: "error" }]);
    expect(calls.filter((c) => c.kind === "status")).toHaveLength(0);
    expect(calls.filter((c) => c.kind === "run").map((c) => c.args[3])).toEqual(["error", "error"]);
  });
});
