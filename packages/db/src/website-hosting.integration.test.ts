import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listHostedSites, recordHostingSync, saveWebsiteHosting } from "./queries/website-hosting";
import { businesses, projects, websiteHosting } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-28T10:00:00.000Z");
const PROJECT = "prj_abc123";
const TEAM = "team_xyz789";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "smile-dental", name: "Smile Dental Clinic" },
      { slug: "harbour-salon", name: "Harbour Salon" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "smile-dental")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "harbour-salon")?.id ?? "";
});

describe("website hosting", () => {
  it("saves a project and lists it with whether the business has a live project", async () => {
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: TEAM });
    expect(await listHostedSites(dbs.staff.db, businessA)).toEqual([
      { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: TEAM, hostPause: false, pausedAt: null, lastError: null, hasLiveProject: false },
    ]);

    await dbs.staff.db.insert(projects).values({ businessId: businessA, status: "live" });
    expect((await listHostedSites(dbs.staff.db, businessA))[0]?.hasLiveProject).toBe(true);
  });

  it("keeps the host-pause choice when the project is saved again", async () => {
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: null });
    await dbs.staff.db.update(websiteHosting).set({ hostPause: true }).where(eq(websiteHosting.businessId, businessA));
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: "prj_other", vercelTeamId: null });
    expect((await listHostedSites(dbs.staff.db, businessA))[0]?.hostPause).toBe(true);
  });

  it("does not count a project that is still being built", async () => {
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: null });
    await dbs.staff.db.insert(projects).values({ businessId: businessA, status: "building" });
    expect((await listHostedSites(dbs.staff.db))[0]?.hasLiveProject).toBe(false);
  });

  it("lists one business's site, every site, or nothing for an id that is not one", async () => {
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: null });
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessB, vercelProjectId: "prj_other", vercelTeamId: null });
    expect(await listHostedSites(dbs.staff.db)).toHaveLength(2);
    expect(await listHostedSites(dbs.staff.db, businessB)).toHaveLength(1);
    expect(await listHostedSites(dbs.staff.db, "not-a-uuid")).toEqual([]);
  });

  it("records a pause and clears it again", async () => {
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: null });
    await recordHostingSync(dbs.staff.db, businessA, { checkedAt: NOW, pausedAt: NOW, lastError: null });
    expect((await listHostedSites(dbs.staff.db, businessA))[0]?.pausedAt).toEqual(NOW);

    await recordHostingSync(dbs.staff.db, businessA, { checkedAt: NOW, pausedAt: null, lastError: null });
    expect((await listHostedSites(dbs.staff.db, businessA))[0]?.pausedAt).toBeNull();
  });

  it("keeps the paused time when the same project is saved again, and forgets it for a different one", async () => {
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: null });
    await recordHostingSync(dbs.staff.db, businessA, { checkedAt: NOW, pausedAt: NOW, lastError: "boom" });

    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: TEAM });
    expect((await listHostedSites(dbs.staff.db, businessA))[0]).toMatchObject({ pausedAt: NOW, lastError: "boom", vercelTeamId: TEAM });

    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: "prj_new", vercelTeamId: TEAM });
    expect((await listHostedSites(dbs.staff.db, businessA))[0]).toMatchObject({ vercelProjectId: "prj_new", pausedAt: null, lastError: null });
  });

  it("cuts a long error to the column's limit", async () => {
    await saveWebsiteHosting(dbs.staff.db, { businessId: businessA, vercelProjectId: PROJECT, vercelTeamId: null });
    await recordHostingSync(dbs.staff.db, businessA, { checkedAt: NOW, pausedAt: null, lastError: "x".repeat(900) });
    expect((await listHostedSites(dbs.staff.db, businessA))[0]?.lastError).toHaveLength(500);
  });

  it("refuses a project id that is not an id, and a second row for the same business", async () => {
    const notAnId = await captureErrorText(
      dbs.staff.db.insert(websiteHosting).values({ businessId: businessA, vercelProjectId: "my-site" }),
    );
    expect(notAnId).toMatch(/website_hosting_project_id_check/);

    await dbs.staff.db.insert(websiteHosting).values({ businessId: businessA, vercelProjectId: PROJECT });
    const twice = await captureErrorText(dbs.staff.db.insert(websiteHosting).values({ businessId: businessA, vercelProjectId: "prj_two" }));
    expect(twice).toMatch(/website_hosting_business_id_unique/);
  });

  it("gives the customer's own database role and the public role nothing", async () => {
    await dbs.staff.db.insert(websiteHosting).values({ businessId: businessA, vercelProjectId: PROJECT });
    expect(await captureErrorText(dbs.app.db.select().from(websiteHosting).where(eq(websiteHosting.businessId, businessA)))).toContain("permission denied");
    expect(await captureErrorText(dbs.publicRole.db.select().from(websiteHosting))).toContain("permission denied");
  });
});
