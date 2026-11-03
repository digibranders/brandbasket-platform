import { describe, expect, it } from "vitest";
import { GoogleAccessLost } from "../google/oauth";
import { GscError, type GscReader } from "./client";
import { runGscSync, type GscStore } from "./sync";

const NOW = new Date("2026-11-03T04:00:00.000Z");
const FAST = { pace: { sleep: async () => undefined, random: () => 0 } };

function fakes(latest: string | null = null) {
  const calls: { kind: string; args: unknown[] }[] = [];
  const log = (kind: string) => async (...args: unknown[]) => void calls.push({ kind, args });
  const store: GscStore = {
    sites: async () => [{ businessId: "b1", siteUrl: "https://one.in/" }, { businessId: "b2", siteUrl: "https://two.in/" }],
    latestDay: async () => latest,
    writeDaily: log("daily") as never,
    writeList: log("list") as never,
    recordRun: log("run") as never,
    setStatus: log("status") as never,
  };
  return { store, calls };
}

const answer = (site: string, request: { dimensions: readonly string[] }) =>
  request.dimensions[0] === "date" ? { rows: [{ keys: ["2026-10-30"], clicks: 3, impressions: 40, position: 6 }] } : { rows: site === "https://one.in/" ? [{ keys: ["physio"], clicks: 2, impressions: 9, position: 2 }] : [] };

describe("runGscSync", () => {
  it("pulls 60 days ending on the last finished day, keeps non empty lists, and records a connected run", async () => {
    const { store, calls } = fakes();
    const reader: GscReader = { searchAnalytics: async (site, request) => answer(site, request) as never };
    expect(await runGscSync(reader, store, NOW, FAST)).toEqual({ sites: 2, ok: 2, accessLost: 0, failed: 0, failures: [] });
    const daily = calls.filter((c) => c.kind === "daily");
    expect((daily[0]?.args[1] as unknown[]).length).toBe(60 * 2 + 1);
    const runs = calls.filter((c) => c.kind === "run");
    expect(runs.every((c) => c.args[2] === "2026-10-31" && c.args[3] === null)).toBe(true);
    // b1 has searches and pages for two months, b2 none.
    expect(calls.filter((c) => c.kind === "list").map((c) => [c.args[0], c.args[2]]).sort()).toEqual([["b1", "page"], ["b1", "page"], ["b1", "query"], ["b1", "query"]]);
  });

  it("pulls only the last 7 days again once it has stored some", async () => {
    const { store, calls } = fakes("2026-10-30");
    const reader: GscReader = { searchAnalytics: async (site, request) => answer(site, request) as never };
    await runGscSync(reader, store, NOW, FAST);
    expect(calls.filter((c) => c.kind === "run").map((c) => c.args[1])).toEqual(["2026-10-24", "2026-10-24"]);
  });

  it("marks a lost grant access_lost, keeps going, and stores the class only", async () => {
    const { store, calls } = fakes("2026-10-30");
    const reader: GscReader = {
      searchAnalytics: async (site, request) => {
        if (site === "https://one.in/") throw new GscError("access_lost", "Search Console answered HTTP 403.");
        return answer(site, request) as never;
      },
    };
    expect(await runGscSync(reader, store, NOW, FAST)).toMatchObject({ ok: 1, accessLost: 1, failed: 0 });
    expect(calls.filter((c) => c.kind === "status").map((c) => c.args.slice(0, 3)).sort()).toEqual([["b1", "access_lost", "access_lost"], ["b2", "connected", null]]);
  });

  it("counts a failure on our side as failed, and stops the whole run when the account is refused", async () => {
    const { store } = fakes("2026-10-30");
    const down: GscReader = { searchAnalytics: async () => { throw new GscError("unavailable", "down"); } };
    expect(await runGscSync(down, store, NOW, FAST)).toMatchObject({ ok: 0, failed: 2, failures: [{ failure: "unavailable" }, { failure: "unavailable" }] });
    const refused: GscReader = { searchAnalytics: async () => { throw new GoogleAccessLost(); } };
    await expect(runGscSync(refused, store, NOW, FAST)).rejects.toBeInstanceOf(GoogleAccessLost);
  });
});
