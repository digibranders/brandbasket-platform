import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findSiteCheckState, findSiteHealthFacts, insertSiteCheck, listLiveWebsites, PHONE_SPEED_FAILED } from "./queries/site-checks";
import { businesses, businessMembers, domains, projects, siteChecks, users, websiteHosting } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const VIEWER_A = "viewer-a";
const OWNER_B = "owner-b";
const NOW = new Date("2026-11-03T09:00:00.000Z");
const MINUTE = 60_000;
const PERMISSION_DENIED = "permission denied";

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
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Asha", email: "asha@example.com" },
    { id: VIEWER_A, name: "Vani", email: "vani@example.com" },
    { id: OWNER_B, name: "Ben", email: "ben@example.com" },
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

function check(businessId: string, minutesAgo: number, status: "up" | "down" | "error", extra: Partial<typeof siteChecks.$inferInsert> = {}) {
  return insertSiteCheck(dbs.staff.db, { businessId, checkedAt: new Date(NOW.getTime() - minutesAgo * MINUTE), url: "https://cafe.example.com/", status, ...extra });
}

describe("site_checks row-level security", () => {
  it("lets a member read only their own business's checks", async () => {
    await check(businessA, 10, "up");
    await check(businessB, 10, "down");

    const own = await as(OWNER_A, businessA, (tx) => tx.select({ businessId: siteChecks.businessId }).from(siteChecks));
    expect(own).toEqual([{ businessId: businessA }]);
    const viewer = await as(VIEWER_A, businessA, (tx) => tx.select({ businessId: siteChecks.businessId }).from(siteChecks));
    expect(viewer).toEqual([{ businessId: businessA }]);
    const other = await as(OWNER_B, businessB, (tx) => tx.select({ status: siteChecks.status }).from(siteChecks));
    expect(other).toEqual([{ status: "down" }]);
  });

  it("gives the customer connection no way to write", async () => {
    await check(businessA, 10, "up");
    const insert = await captureErrorText(
      as(OWNER_A, businessA, (tx) => tx.insert(siteChecks).values({ businessId: businessA, checkedAt: NOW, url: "https://cafe.example.com/", status: "up" })),
    );
    expect(insert).toContain(PERMISSION_DENIED);
    const update = await captureErrorText(as(OWNER_A, businessA, (tx) => tx.update(siteChecks).set({ status: "down" })));
    expect(update).toContain(PERMISSION_DENIED);
    const remove = await captureErrorText(as(OWNER_A, businessA, (tx) => tx.delete(siteChecks)));
    expect(remove).toContain(PERMISSION_DENIED);
  });

  it("lets staff read and delete every row", async () => {
    await check(businessA, 10, "up");
    await check(businessB, 10, "up");
    expect(await dbs.staff.db.select().from(siteChecks)).toHaveLength(2);
    await dbs.staff.db.delete(siteChecks).where(sql`true`);
    expect(await dbs.staff.db.select().from(siteChecks)).toHaveLength(0);
  });

  it("refuses a score outside 0 to 100 and a status it does not know", async () => {
    expect(await captureErrorText(check(businessA, 1, "up", { phoneSpeedScore: 101 }))).toMatch(/site_checks_phone_speed_score_check/);
    expect(await captureErrorText(dbs.staff.db.execute(sql`insert into site_checks (id, business_id, checked_at, url, status) values (gen_random_uuid(), ${businessA}, now(), 'https://cafe.example.com/', 'slow')`))).toMatch(
      /site_checks_status_check/,
    );
  });
});

describe("findSiteHealthFacts", () => {
  it("is empty before the first check", async () => {
    const facts = await as(OWNER_A, businessA, (tx) => findSiteHealthFacts(tx, new Date(NOW.getTime() - 30 * 1440 * MINUTE)));
    expect(facts).toEqual({ latest: null, firstCheckedAt: null, up: 0, down: 0, certificate: null, phoneSpeed: null });
  });

  it("reads the latest result, the tallies in the window, the certificate and the speed, skipping error rows", async () => {
    const expires = new Date("2027-02-04T00:00:00.000Z");
    await check(businessA, 31 * 1440, "down");
    await check(businessA, 120, "up", { sslExpiresAt: expires, phoneSpeedScore: 82, phoneLcpMs: 1800 });
    await check(businessA, 20, "down");
    await check(businessA, 10, "up");
    await check(businessA, 1, "error", { error: "boom" });
    await check(businessB, 5, "down");

    const facts = await as(OWNER_A, businessA, (tx) => findSiteHealthFacts(tx, new Date(NOW.getTime() - 30 * 1440 * MINUTE)));
    expect(facts.latest).toEqual({ status: "up", checkedAt: new Date(NOW.getTime() - 10 * MINUTE) });
    expect(facts.firstCheckedAt).toEqual(new Date(NOW.getTime() - 31 * 1440 * MINUTE));
    expect({ up: facts.up, down: facts.down }).toEqual({ up: 2, down: 1 });
    expect(facts.certificate).toEqual({ expiresAt: expires, checkedAt: new Date(NOW.getTime() - 120 * MINUTE) });
    expect(facts.phoneSpeed).toEqual({ score: 82, checkedAt: new Date(NOW.getTime() - 120 * MINUTE) });
  });
});

describe("the site health job's reads", () => {
  it("lists a business whose latest project is live and has a primary domain, unless its hosting is paused", async () => {
    await dbs.staff.db.insert(projects).values([
      { businessId: businessA, status: "live", createdAt: new Date(NOW.getTime() - 60 * MINUTE) },
      { businessId: businessB, status: "live", createdAt: new Date(NOW.getTime() - 60 * MINUTE) },
    ]);
    await dbs.staff.db.insert(domains).values([
      { businessId: businessA, hostname: "cafe.example.com", isPrimary: true, status: "active" },
      { businessId: businessB, hostname: "riverside.example.com", isPrimary: true, status: "active" },
    ]);
    expect(await listLiveWebsites(dbs.staff.db)).toHaveLength(2);

    await dbs.staff.db.insert(websiteHosting).values({ businessId: businessB, vercelProjectId: "prj_abc", pausedAt: NOW });
    expect(await listLiveWebsites(dbs.staff.db)).toEqual([{ businessId: businessA, businessName: "Chennai Cafe", hostname: "cafe.example.com" }]);

    // A newer project that is not live (a redesign being built) means the business's latest project is not live.
    await dbs.staff.db.insert(projects).values({ businessId: businessA, kind: "redesign", status: "onboarding", createdAt: NOW });
    expect(await listLiveWebsites(dbs.staff.db)).toEqual([]);
  });

  it("reads the recent results newest first and the last PageSpeed attempt, failed or not", async () => {
    expect(await findSiteCheckState(dbs.staff.db, businessA)).toEqual({ recent: [], lastSpeedAttemptAt: null });
    await check(businessA, 40, "up", { phoneSpeedScore: 70 });
    await check(businessA, 30, "up");
    await check(businessA, 20, "error", { error: `${PHONE_SPEED_FAILED}: quota` });
    await check(businessA, 15, "down");
    await check(businessA, 10, "down");
    expect(await findSiteCheckState(dbs.staff.db, businessA)).toEqual({
      recent: [
        { status: "down", checkedAt: new Date(NOW.getTime() - 10 * MINUTE) },
        { status: "down", checkedAt: new Date(NOW.getTime() - 15 * MINUTE) },
        { status: "up", checkedAt: new Date(NOW.getTime() - 30 * MINUTE) },
      ],
      lastSpeedAttemptAt: new Date(NOW.getTime() - 20 * MINUTE),
    });
  });
});
