import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listProvisionCandidates, saveProvisionedSource } from "./queries/google-provisioning";
import { saveWebsiteHosting } from "./queries/website-hosting";
import { listGa4Properties, listGscSites } from "./queries/site-visits";
import { businesses, domains, projects, reportSources } from "./schema";
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
