import { businesses, domains, ensureSiteKey, metricBreakdowns, metricDaily, reportSourceRuns, siteEvents, siteHits, visitorSalts } from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runSiteAnalyticsRollup } from "@/lib/site-analytics-rollup-run";
import { realHitDeps } from "./site-hit-deps";
import { handleHit, type HitDeps } from "./site-hit-handler";
import { realRollupDeps } from "./site-analytics-rollup";

/**
 * The whole first-party analytics pipeline on a real database: page views and taps posted to the same handler POST /api/t
 * runs, then the nightly roll-up that turns them into the numbers the monthly reports read (plan 56). Only the plan check
 * (which needs a whole subscription) and the clock are replaced.
 */

const state = vi.hoisted(() => ({ dbs: null as TestDatabases | null }));
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({
  getStaffDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.staff.db;
  },
}));
vi.mock("./site-api", () => ({ siteHasAccess: vi.fn(async () => true) }));

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const PHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
/** 10:00 on the 5th in India. */
const INGEST_AT = new Date("2026-10-05T04:30:00.000Z");
/** 10:00 on the 6th in India, so the roll-up covers the 4th and the 5th. */
const ROLLUP_AT = new Date("2026-10-06T04:30:00.000Z");

let businessId = "";
let key = "";
let hitDeps: HitDeps;

beforeAll(() => {
  state.dbs = openTestDatabases();
});

afterAll(async () => {
  await state.dbs?.closeAll();
});

beforeEach(async () => {
  const dbs = state.dbs;
  if (dbs === null) throw new Error("not open");
  await resetTestDatabase(dbs.owner);
  const [business] = await dbs.owner.db.insert(businesses).values({ slug: "sai-dental", name: "Sai Dental Care", currency: "INR" }).returning({ id: businesses.id });
  businessId = business?.id ?? "";
  await dbs.owner.db.insert(domains).values({ businessId, hostname: "saidental.in" });
  key = (await ensureSiteKey(dbs.staff.db, businessId)).key;
  hitDeps = { ...realHitDeps(dbs.staff.db), now: () => INGEST_AT };
});

function send(body: Record<string, unknown>, headers: Record<string, string> = {}): Promise<Response> {
  return handleHit(
    new Request("http://app.localhost:3198/api/t", {
      method: "POST",
      body: JSON.stringify({ key, ...body }),
      headers: { "user-agent": CHROME, origin: "https://www.saidental.in", "x-forwarded-for": "203.0.113.7", "cf-ipcountry": "IN", "content-type": "text/plain", ...headers },
    }),
    hitDeps,
  );
}

/** Two visitors, one of whom taps three ways, and four requests that must leave no trace. */
async function postTheDay(): Promise<void> {
  const first = (body: Record<string, unknown>) => send(body);
  await first({ kind: "pageview", path: "/services", ref: "https://www.google.com", medium: "organic" });
  await first({ kind: "call", path: "/services" });
  await first({ kind: "whatsapp", path: "/services" });
  await first({ kind: "email", path: "/services" });
  await first({ kind: "engagement", path: "/services", engagedMs: 12_000, scrollPct: 60 });
  await send({ kind: "pageview", path: "/" }, { "user-agent": PHONE, "x-forwarded-for": "203.0.113.9" });

  await send({ kind: "pageview", path: "/" }, { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" });
  await send({ kind: "pageview", path: "/" }, { origin: "https://copycat.example" });
  await send({ kind: "pageview", path: "/", key: "bbk_unknownunknownunknown" });
  await send({ kind: "pageview", path: "/" }, { dnt: "1" });
}

const dbs = (): TestDatabases => {
  if (state.dbs === null) throw new Error("not open");
  return state.dbs;
};
const dailyValues = async () => Object.fromEntries((await dbs().staff.db.select().from(metricDaily)).map((row) => [`${row.metric}@${row.day}`, row.value]));

describe("first-party site analytics, end to end", () => {
  it("stores what real visitors did, and nothing that names them", async () => {
    await postTheDay();
    const rows = await dbs().staff.db.select().from(siteHits);
    expect(rows).toHaveLength(6);
    expect(rows.map((row) => row.kind).sort()).toEqual(["call", "email", "engagement", "pageview", "pageview", "whatsapp"]);
    expect(new Set(rows.map((row) => row.visitorHash)).size).toBe(2);
    const everything = JSON.stringify(rows) + JSON.stringify(await dbs().staff.db.select().from(visitorSalts));
    expect(everything).not.toContain("203.0.113");
    expect(everything).not.toContain("Mozilla");
    expect(rows.find((row) => row.path === "/services" && row.kind === "pageview")).toMatchObject({ channel: "search", referrerHost: "google.com", device: "desktop", country: "IN" });
    expect(rows.find((row) => row.path === "/")).toMatchObject({ channel: "direct", device: "mobile" });
  });

  it("rolls the day up into the numbers a report reads, using older server events for what the script did not see", async () => {
    await postTheDay();
    await dbs().staff.db.insert(siteEvents).values([
      { businessId, kind: "form", occurredAt: new Date("2026-10-05T05:00:00.000Z") },
      { businessId, kind: "call", occurredAt: new Date("2026-10-05T06:00:00.000Z") },
      { businessId, kind: "call", occurredAt: new Date("2026-10-05T07:00:00.000Z") },
    ]);
    const report = await runSiteAnalyticsRollup(realRollupDeps(dbs().staff.db), { now: ROLLUP_AT, dryRun: false });
    expect(report).toMatchObject({ businesses: 1, days: ["2026-10-04", "2026-10-05"], daysWritten: 1, daysSkipped: 1, failures: [] });

    const day = await dailyValues();
    expect(day).toMatchObject({
      "own.visits@2026-10-05": 2,
      "own.visitors@2026-10-05": 2,
      "own.pageviews@2026-10-05": 2,
      "own.engaged_seconds@2026-10-05": 12,
      "own.calls@2026-10-05": 1,
      "own.whatsapp@2026-10-05": 1,
      "own.emails@2026-10-05": 1,
      "own.directions@2026-10-05": 0,
      "own.social_taps@2026-10-05": 0,
      "own.form_sends@2026-10-05": 1,
    });
    expect(Object.keys(day).some((name) => name.endsWith("@2026-10-04"))).toBe(false);

    const lists = Object.fromEntries((await dbs().staff.db.select().from(metricBreakdowns)).map((row) => [row.dimension, row.rows]));
    expect(lists.channel).toEqual([{ key: "direct", count: 1 }, { key: "search", count: 1 }]);
    expect(lists.enquiry_channel).toEqual([{ key: "search", count: 3 }]);
    expect(lists.enquiry_page).toEqual([{ key: "/services", count: 3 }]);
    expect(lists.device).toEqual([{ key: "desktop", count: 1 }, { key: "mobile", count: 1 }]);
    expect(lists.country).toEqual([{ key: "IN", count: 2 }]);
    expect((await dbs().staff.db.select().from(metricBreakdowns)).every((row) => row.source === "own" && row.month === "2026-10-01")).toBe(true);

    const runs = await dbs().staff.db.select().from(reportSourceRuns);
    expect(runs.map((run) => [run.source, run.windowStart, run.ok])).toEqual([["own", "2026-10-05", true]]);
  });

  it("gives the same numbers when it runs again, and changes nothing on a dry run", async () => {
    await postTheDay();
    const dry = await runSiteAnalyticsRollup(realRollupDeps(dbs().staff.db), { now: ROLLUP_AT, dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, daysWritten: 1 });
    expect(await dbs().staff.db.select().from(metricDaily)).toHaveLength(0);
    await runSiteAnalyticsRollup(realRollupDeps(dbs().staff.db), { now: ROLLUP_AT, dryRun: false });
    const once = await dailyValues();
    await runSiteAnalyticsRollup(realRollupDeps(dbs().staff.db), { now: ROLLUP_AT, dryRun: false });
    expect(await dailyValues()).toEqual(once);
    // Seven lists, not eight: no visit had a campaign, so that list is left out rather than written empty.
    expect(await dbs().staff.db.select().from(metricBreakdowns)).toHaveLength(7);
  });

  it("deletes hits older than 90 days and salts older than yesterday, and keeps the recent ones", async () => {
    await postTheDay();
    await dbs().staff.db.insert(siteHits).values({
      businessId,
      at: new Date("2026-06-01T00:00:00.000Z"),
      kind: "pageview",
      path: "/",
      channel: "direct",
      device: "desktop",
      visitorHash: "0123456789abcdef0123456789abcdef",
    });
    await dbs().staff.db.insert(visitorSalts).values({ day: "2026-09-01", salt: "s".repeat(64) });
    const report = await runSiteAnalyticsRollup(realRollupDeps(dbs().staff.db), { now: ROLLUP_AT, dryRun: false });
    expect(report).toMatchObject({ hitsDeleted: 1, saltsDeleted: 1 });
    expect(await dbs().staff.db.select().from(siteHits)).toHaveLength(6);
    expect((await dbs().staff.db.select().from(visitorSalts)).map((row) => row.day)).toEqual(["2026-10-05"]);
  });

  it("does nothing for a site that has never sent anything", async () => {
    const report = await runSiteAnalyticsRollup(realRollupDeps(dbs().staff.db), { now: ROLLUP_AT, dryRun: false });
    expect(report).toMatchObject({ businesses: 0, daysWritten: 0 });
    expect(await dbs().staff.db.select().from(metricDaily)).toHaveLength(0);
  });
});
