import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  countGoogleSources,
  detachGoogle,
  listGoogleAttention,
  listProvisionCandidates,
  provisionGoogleAgain,
  retryGoogleVerification,
  saveProvisionedSource,
} from "./queries/google-provisioning";
import { saveWebsiteHosting } from "./queries/website-hosting";
import { listGa4Properties, listGscSites } from "./queries/site-visits";
import { businesses, domains, metricDaily, projects, reportSources } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-11-03T04:00:00.000Z");
let dbs: TestDatabases;
let live = "";
let building = "";

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  const rows = await dbs.staff.db
    .insert(businesses)
    .values([{ slug: "kulkarni", name: "Kulkarni Physio" }, { slug: "birch", name: "Birch Dental" }])
    .returning({ id: businesses.id, slug: businesses.slug });
  live = rows.find((row) => row.slug === "kulkarni")?.id ?? "";
  building = rows.find((row) => row.slug === "birch")?.id ?? "";
  await saveWebsiteHosting(dbs.staff.db, { businessId: live, vercelProjectId: "prj_live1", vercelTeamId: "team_t1" });
  await saveWebsiteHosting(dbs.staff.db, { businessId: building, vercelProjectId: "prj_build1", vercelTeamId: null });
  await dbs.staff.db.insert(projects).values([{ businessId: live, status: "live" }, { businessId: building, status: "building" }]);
  await dbs.staff.db.insert(domains).values([
    { businessId: live, hostname: "Kulkarni.Example", isPrimary: true },
    { businessId: live, hostname: "old.example", isPrimary: false, removedAt: NOW },
    { businessId: building, hostname: "birch.example", isPrimary: true },
  ]);
});

describe("provision candidates", () => {
  it("lists live sites with their lower cased primary domain and no sources yet", async () => {
    expect(await listProvisionCandidates(dbs.staff.db)).toEqual([
      { businessId: live, businessName: "Kulkarni Physio", hostname: "kulkarni.example", vercelProjectId: "prj_live1", vercelTeamId: "team_t1", hostingPaused: false, ga4: null, gsc: null },
    ]);
    expect(await listProvisionCandidates(dbs.staff.db, building)).toEqual([]);
  });

  it("carries each source row as the job saved it, and a field left out keeps its value", async () => {
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: "https://kulkarni.example/", status: "awaiting_setup", provisionedAt: NOW, detail: "Waiting for the tag to show", now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: "https://kulkarni.example/", status: "pending", verifiedAt: NOW, now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "ga4", externalId: "123456789", status: "awaiting_setup", measurementId: "G-ABC123XYZ", detail: "Tag off", now: NOW });
    const [candidate] = await listProvisionCandidates(dbs.staff.db);
    expect(candidate?.gsc).toEqual({ externalId: "https://kulkarni.example/", status: "pending", measurementId: null, verifiedAt: NOW, provisionedAt: NOW, secondOwnerOk: false, detail: "Waiting for the tag to show" });
    expect(candidate?.ga4).toMatchObject({ externalId: "123456789", measurementId: "G-ABC123XYZ", status: "awaiting_setup" });
  });

  it("keeps sources that are set up but not collecting out of the nightly pull", async () => {
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: "https://kulkarni.example/", status: "awaiting_setup", now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "ga4", externalId: "123456789", status: "awaiting_setup", now: NOW });
    expect(await listGscSites(dbs.staff.db)).toEqual([]);
    expect(await listGa4Properties(dbs.staff.db)).toEqual([]);
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: "https://kulkarni.example/", status: "pending", now: NOW });
    expect(await listGscSites(dbs.staff.db)).toEqual([{ businessId: live, siteUrl: "https://kulkarni.example/" }]);
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: "https://kulkarni.example/", status: "removed", now: NOW });
    expect(await listGscSites(dbs.staff.db)).toEqual([]);
  });

  it("refuses a malformed measurement id and an overlong detail is cut", async () => {
    await expect(saveProvisionedSource(dbs.staff.db, { businessId: live, source: "ga4", externalId: "1", status: "pending", measurementId: "not-one", now: NOW })).rejects.toThrow();
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "ga4", externalId: "1", status: "pending", detail: "x".repeat(400), now: NOW });
    const [row] = await dbs.staff.db.select().from(reportSources).where(eq(reportSources.businessId, live));
    expect(row?.detail?.length).toBe(300);
  });
});

const SITE = "https://kulkarni.example/";
const rowsOf = (businessId: string) => dbs.staff.db.select().from(reportSources).where(eq(reportSources.businessId, businessId));
const sourceRow = async (businessId: string, source: "gsc" | "ga4") => (await rowsOf(businessId)).find((row) => row.source === source);

describe("staff actions on the Google rows", () => {
  it("clears the verification wait only while the site is unverified", async () => {
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "awaiting_setup", provisionedAt: NOW, now: NOW });
    expect(await retryGoogleVerification(dbs.staff.db, live, NOW)).toBe(true);
    expect((await sourceRow(live, "gsc"))?.provisionedAt).toBeNull();
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "pending", verifiedAt: NOW, provisionedAt: NOW, now: NOW });
    expect(await retryGoogleVerification(dbs.staff.db, live, NOW)).toBe(false);
    expect((await sourceRow(live, "gsc"))?.provisionedAt).toEqual(NOW);
    expect(await retryGoogleVerification(dbs.staff.db, building, NOW)).toBe(false);
  });

  it("does not retry a detached site", async () => {
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "removed", provisionedAt: NOW, now: NOW });
    expect(await retryGoogleVerification(dbs.staff.db, live, NOW)).toBe(false);
  });

  it("detaches both sources and keeps the rows, then brings them back to waiting", async () => {
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "connected", verifiedAt: NOW, secondOwnerOk: true, now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "ga4", externalId: "123456789", status: "connected", measurementId: "G-ABC123XYZ", now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: building, source: "gsc", externalId: "https://birch.example/", status: "connected", now: NOW });
    expect(await detachGoogle(dbs.staff.db, live, NOW)).toBe(2);
    expect(await detachGoogle(dbs.staff.db, live, NOW)).toBe(0);
    expect((await rowsOf(live)).map((row) => [row.source, row.status, row.externalId, row.detail])).toEqual(
      expect.arrayContaining([["gsc", "removed", SITE, "Detached by staff"], ["ga4", "removed", "123456789", "Detached by staff"]]),
    );
    expect((await sourceRow(building, "gsc"))?.status).toBe("connected");
    expect(await listGscSites(dbs.staff.db)).toEqual([{ businessId: building, siteUrl: "https://birch.example/" }]);

    expect(await provisionGoogleAgain(dbs.staff.db, live, NOW)).toBe(2);
    expect(await provisionGoogleAgain(dbs.staff.db, live, NOW)).toBe(0);
    const [gsc, ga4] = [await sourceRow(live, "gsc"), await sourceRow(live, "ga4")];
    expect([gsc?.status, gsc?.detail, gsc?.verifiedAt, gsc?.secondOwnerOk]).toEqual(["pending", null, NOW, true]);
    expect([ga4?.status, ga4?.detail, ga4?.measurementId]).toEqual(["awaiting_setup", null, "G-ABC123XYZ"]);
  });

  it("sends an unverified site back to awaiting setup when it is provisioned again", async () => {
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "removed", now: NOW });
    await provisionGoogleAgain(dbs.staff.db, live, NOW);
    expect((await sourceRow(live, "gsc"))?.status).toBe("awaiting_setup");
  });
});

describe("Google account counts", () => {
  it("counts rows in the account that are not detached", async () => {
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "connected", now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "ga4", externalId: "1", status: "pending", now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: building, source: "gsc", externalId: "https://birch.example/", status: "removed", now: NOW });
    expect(await countGoogleSources(dbs.staff.db)).toEqual({ gsc: 1, ga4: 1 });
    await dbs.owner.db.update(reportSources).set({ googleSlot: 2 }).where(eq(reportSources.businessId, live));
    expect(await countGoogleSources(dbs.staff.db)).toEqual({ gsc: 0, ga4: 0 });
    expect(await countGoogleSources(dbs.staff.db, 2)).toEqual({ gsc: 1, ga4: 1 });
  });
});

describe("Google problems for Today", () => {
  const cutoffs = { unverifiedBefore: new Date("2026-10-31T04:00:00.000Z"), gscDataBefore: "2026-10-28", ga4DataBefore: "2026-10-31" };
  const age = (businessId: string, source: "gsc" | "ga4", createdAt: Date) =>
    dbs.owner.db.update(reportSources).set({ createdAt }).where(and(eq(reportSources.businessId, businessId), eq(reportSources.source, source)));
  const day = (businessId: string, metric: string, value: string) => dbs.staff.db.insert(metricDaily).values({ businessId, metric, day: value, value: 1 });

  it("lists a Search Console site unverified for too long, and not a newer one, a verified one or one on paused hosting", async () => {
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "awaiting_setup", now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: building, source: "gsc", externalId: "https://birch.example/", status: "awaiting_setup", now: NOW });
    expect(await listGoogleAttention(dbs.staff.db, cutoffs)).toEqual([]);
    const old = new Date("2026-10-29T04:00:00.000Z");
    await age(live, "gsc", old);
    expect(await listGoogleAttention(dbs.staff.db, cutoffs)).toEqual([{ kind: "unverified", businessId: live, businessName: "Kulkarni Physio", since: old }]);
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "awaiting_setup", verifiedAt: NOW, now: NOW });
    expect(await listGoogleAttention(dbs.staff.db, cutoffs)).toEqual([]);
    await saveProvisionedSource(dbs.staff.db, { businessId: live, source: "gsc", externalId: SITE, status: "awaiting_setup", verifiedAt: null, now: NOW });
    await dbs.owner.db.execute(sql`update website_hosting set paused_at = ${NOW.toISOString()} where business_id = ${live}`);
    expect(await listGoogleAttention(dbs.staff.db, cutoffs)).toEqual([]);
  });

  it("lists a connected source whose newest day is before its cutoff, and not one with no day, a fresh one, or one that is not connected", async () => {
    for (const source of ["gsc", "ga4"] as const) {
      await saveProvisionedSource(dbs.staff.db, { businessId: live, source, externalId: source === "gsc" ? SITE : "1", status: "connected", now: NOW });
    }
    await saveProvisionedSource(dbs.staff.db, { businessId: building, source: "gsc", externalId: "https://birch.example/", status: "connected", now: NOW });
    await saveProvisionedSource(dbs.staff.db, { businessId: building, source: "ga4", externalId: "2", status: "access_lost", now: NOW });
    expect(await listGoogleAttention(dbs.staff.db, cutoffs)).toEqual([]);
    await day(live, "gsc.clicks", "2026-10-27");
    await day(live, "ga4.visits", "2026-10-31");
    await day(building, "gsc.clicks", "2026-10-28");
    await day(building, "ga4.visits", "2026-10-01");
    expect(await listGoogleAttention(dbs.staff.db, cutoffs)).toEqual([{ kind: "no-data", businessId: live, businessName: "Kulkarni Physio", source: "gsc", latestDay: "2026-10-27" }]);
    await day(live, "ga4.visits", "2026-10-15");
    await dbs.owner.db.delete(metricDaily).where(and(eq(metricDaily.businessId, live), eq(metricDaily.day, "2026-10-31")));
    expect((await listGoogleAttention(dbs.staff.db, cutoffs)).map((row) => row.kind === "no-data" && row.source).sort()).toEqual(["ga4", "gsc"]);
  });
});
