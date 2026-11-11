import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { businesses, upsertReportSource } from "@brandbasket/db";
import { openTestDatabases, querySql, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { realGscStore } from "./server/gsc/store";
import { runGscSync } from "./server/gsc/sync";
import type { GscReader } from "./server/gsc/client";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-11-03T04:00:00.000Z");
const FAST = { pace: { sleep: async () => undefined, random: () => 0 } };
let dbs: TestDatabases;
let businessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "kulkarni", name: "Kulkarni Physio", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  await upsertReportSource(dbs.staff.db, { businessId, source: "gsc", externalId: "https://kulkarni.example/", now: NOW });
});

const reader: GscReader = {
  searchAnalytics: async (_site, request) =>
    request.dimensions[0] === "date"
      ? { rows: [{ keys: ["2026-10-30"], clicks: 3, impressions: 40, position: 6 }] }
      : { rows: [{ keys: [request.dimensions[0] === "query" ? "physio near me" : "/services"], clicks: 5, impressions: 12, position: 2 }] },
};

describe("the Search Console pull against a real database", () => {
  it("stores gsc numbers, lists and a run, marks the site connected, and writes the same rows when run twice", async () => {
    const store = realGscStore(dbs.staff.db);
    expect(await runGscSync(reader, store, NOW, FAST)).toMatchObject({ sites: 1, ok: 1, failed: 0 });
    const count = async () => Number((await querySql<{ n: string }>(dbs.owner, `select count(*)::text as n from metric_daily where business_id = '${businessId}'`))[0]?.n);
    const first = await count();
    // 60 days of clicks and impressions, plus one position.
    expect(first).toBe(121);
    expect((await runGscSync(reader, store, NOW, FAST)).ok).toBe(1);
    expect(await count()).toBe(first);

    const clicks = await querySql<{ value: number }>(dbs.owner, `select value from metric_daily where business_id = '${businessId}' and metric = 'gsc.clicks' and day = '2026-10-30'`);
    expect(clicks.map((row) => Number(row.value))).toEqual([3]);
    const lists = await querySql<{ source: string; dimension: string }>(dbs.owner, `select source, dimension from metric_breakdowns where business_id = '${businessId}'`);
    expect(lists.map((row) => [row.source, row.dimension]).sort()).toEqual([["gsc", "page"], ["gsc", "page"], ["gsc", "query"], ["gsc", "query"]]);
    const runs = await querySql<{ source: string; ok: boolean }>(dbs.owner, `select source, ok from report_source_runs where business_id = '${businessId}'`);
    expect(runs.length).toBe(2);
    expect(runs.every((run) => run.source === "gsc" && run.ok)).toBe(true);
    const [source] = await querySql<{ status: string }>(dbs.owner, `select status from report_sources where business_id = '${businessId}'`);
    expect(source?.status).toBe("connected");
  });
});
