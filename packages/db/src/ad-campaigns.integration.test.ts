import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  addAdCampaign,
  listAdCampaigns,
  removeAdCampaign,
  updateAdCampaign,
  type AdCampaignFigures,
} from "./queries/ad-campaigns";
import { latestSocialReach, upsertMonthlySnapshot, type SnapshotFigures } from "./queries/monthly-snapshots";
import { adCampaignSnapshots, businesses, businessMembers, users } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const VIEWER_A = "viewer-a";
const OWNER_B = "owner-b";
const STAFF = "staff-1";
const NOW = new Date("2026-11-03T09:00:00.000Z");
const MONTH = "2026-10-01";

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

const CAMPAIGN: AdCampaignFigures = {
  name: "Full body checkup, Dadar",
  platform: "meta",
  objective: "Leads",
  spendCents: 412_000,
  budgetCents: 500_000,
  impressions: 18_000,
  clicks: 320,
  leads: 9,
};
const BLANK_FIGURES: SnapshotFigures = {
  adSpendCents: null,
  adBudgetCents: null,
  adEnquiries: null,
  postsPublished: null,
  postsPlanned: null,
  keywordsPageOne: null,
  keywordsPageOnePrev: null,
  reach: null,
  followers: null,
  profileVisits: null,
};

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Asha", email: "asha@example.com" },
    { id: VIEWER_A, name: "Vani", email: "vani@example.com" },
    { id: OWNER_B, name: "Ben", email: "ben@example.com" },
    { id: STAFF, name: "Staff", email: "staff@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
      { slug: "riverside", name: "Riverside", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "riverside")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessA, userId: VIEWER_A, role: "viewer" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
});

function as<T>(userId: string, businessId: string, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  return withTenantScope(dbs.app.db, { userId, businessId }, work);
}

describe("ad campaign snapshots", () => {
  it("staff add, correct and remove a campaign, and a second one with the same name that month is refused", async () => {
    expect(await addAdCampaign(dbs.staff.db, { businessId: businessA, month: MONTH, figures: CAMPAIGN, staffId: STAFF })).toBe("saved");
    expect(await addAdCampaign(dbs.staff.db, { businessId: businessA, month: MONTH, figures: CAMPAIGN, staffId: STAFF })).toBe("duplicate");
    // The same name in another month, or for another business, is a different campaign.
    expect(await addAdCampaign(dbs.staff.db, { businessId: businessA, month: "2026-09-01", figures: CAMPAIGN, staffId: STAFF })).toBe("saved");
    expect(await addAdCampaign(dbs.staff.db, { businessId: businessB, month: MONTH, figures: CAMPAIGN, staffId: STAFF })).toBe("saved");

    const [row] = await listAdCampaigns(dbs.staff.db, businessA, MONTH);
    expect(row).toMatchObject({ name: CAMPAIGN.name, platform: "meta", spendCents: 412_000, leads: 9, enteredByStaffId: STAFF });
    const id = row?.id ?? "";

    const corrected = { ...CAMPAIGN, spendCents: 450_000, leads: null };
    expect(await updateAdCampaign(dbs.staff.db, { id, businessId: businessA, figures: corrected, staffId: STAFF, now: NOW })).toBe("saved");
    expect((await listAdCampaigns(dbs.staff.db, businessA, MONTH))[0]).toMatchObject({ spendCents: 450_000, leads: null, month: MONTH });

    // Another business's staff page cannot reach this row, and renaming into an existing name is refused.
    expect(await updateAdCampaign(dbs.staff.db, { id, businessId: businessB, figures: corrected, staffId: STAFF, now: NOW })).toBe("not-found");
    expect(await removeAdCampaign(dbs.staff.db, { id, businessId: businessB })).toBe(false);
    await addAdCampaign(dbs.staff.db, { businessId: businessA, month: MONTH, figures: { ...CAMPAIGN, name: "Winter checkup" }, staffId: STAFF });
    expect(await updateAdCampaign(dbs.staff.db, { id, businessId: businessA, figures: { ...CAMPAIGN, name: "Winter checkup" }, staffId: STAFF, now: NOW })).toBe("duplicate");

    expect(await removeAdCampaign(dbs.staff.db, { id, businessId: businessA })).toBe(true);
    expect(await removeAdCampaign(dbs.staff.db, { id, businessId: businessA })).toBe(false);
  });

  it("the database refuses a negative figure, a month that is not the first, a bad platform and a blank name", async () => {
    const insert = (over: Partial<typeof adCampaignSnapshots.$inferInsert>) =>
      captureErrorText(
        dbs.staff.db.insert(adCampaignSnapshots).values({ businessId: businessA, month: MONTH, name: "A", platform: "meta", objective: "Leads", spendCents: 1, enteredByStaffId: STAFF, ...over }),
      );
    expect(await insert({ spendCents: -1 })).toContain("ad_campaign_snapshots_figures_check");
    expect(await insert({ leads: -1 })).toContain("ad_campaign_snapshots_figures_check");
    expect(await insert({ month: "2026-10-15" })).toContain("ad_campaign_snapshots_month_check");
    expect(await insert({ platform: "tiktok" as never })).toContain("ad_campaign_snapshots_platform_check");
    expect(await insert({ name: "   " })).toContain("ad_campaign_snapshots_name_check");
  });

  it("a customer reads their own business's campaigns only, and cannot write any", async () => {
    await addAdCampaign(dbs.staff.db, { businessId: businessA, month: MONTH, figures: CAMPAIGN, staffId: STAFF });
    await addAdCampaign(dbs.staff.db, { businessId: businessB, month: MONTH, figures: { ...CAMPAIGN, name: "Riverside lunch" }, staffId: STAFF });

    expect((await as(OWNER_A, businessA, (tx) => listAdCampaigns(tx, businessA, MONTH))).map((row) => row.name)).toEqual([CAMPAIGN.name]);
    expect((await as(VIEWER_A, businessA, (tx) => listAdCampaigns(tx, businessA, MONTH))).map((row) => row.name)).toEqual([CAMPAIGN.name]);
    // Asking for the other business's rows by id returns none: the policy filters on the scoped business.
    expect(await as(OWNER_A, businessA, (tx) => listAdCampaigns(tx, businessB, MONTH))).toEqual([]);
    expect(await as(OWNER_B, businessB, (tx) => listAdCampaigns(tx, businessA, MONTH))).toEqual([]);

    const own = { businessId: businessA, month: MONTH, name: "Mine", platform: "meta" as const, objective: "Leads", spendCents: 1, enteredByStaffId: STAFF };
    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => tx.insert(adCampaignSnapshots).values(own)))).toContain("permission denied");
    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => tx.update(adCampaignSnapshots).set({ spendCents: 1 })))).toContain("permission denied");
    expect(await captureErrorText(as(OWNER_A, businessA, (tx) => tx.delete(adCampaignSnapshots)))).toContain("permission denied");
  });

  it("staff cannot move a campaign to another business or month: those columns are not updatable", async () => {
    await addAdCampaign(dbs.staff.db, { businessId: businessA, month: MONTH, figures: CAMPAIGN, staffId: STAFF });
    expect(await captureErrorText(dbs.staff.db.update(adCampaignSnapshots).set({ businessId: businessB }))).toContain("permission denied");
    expect(await captureErrorText(dbs.staff.db.update(adCampaignSnapshots).set({ month: "2026-09-01" }))).toContain("permission denied");
  });
});

describe("social reach on the monthly snapshot", () => {
  const save = (month: string, figures: Partial<SnapshotFigures>) =>
    upsertMonthlySnapshot(dbs.staff.db, { businessId: businessA, service: "social", month, figures: { ...BLANK_FIGURES, ...figures }, staffId: STAFF, now: NOW });

  it("is read back for the newest month that has any reach figure, by the customer too, and not for another business", async () => {
    expect(await as(OWNER_A, businessA, (tx) => latestSocialReach(tx, businessA))).toBeNull();
    await save("2026-08-01", { reach: 40_000 });
    await save("2026-09-01", { followers: 1_200, profileVisits: 310 });
    await save("2026-10-01", { adSpendCents: 100 });

    const latest = await as(OWNER_A, businessA, (tx) => latestSocialReach(tx, businessA));
    expect(latest).toMatchObject({ month: "2026-09-01", reach: null, followers: 1_200, profileVisits: 310 });
    expect(await as(OWNER_B, businessB, (tx) => latestSocialReach(tx, businessA))).toBeNull();
  });

  it("refuses a negative reach figure", async () => {
    await expect(save(MONTH, { reach: -5 })).rejects.toThrow();
  });
});
