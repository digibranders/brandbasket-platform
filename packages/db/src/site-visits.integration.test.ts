import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eraseEnquirerDetails, eraseExpiredEnquiryDetails } from "./queries/account-erasure";
import { recordEnquiryContents } from "./queries/enquiries";
import { countExpiredRetention, purgeExpiredRetention } from "./queries/retention";
import { insertBusiness } from "./queries/onboarding";
import { upsertBreakdown, upsertDailyMetrics, upsertReportSource } from "./queries/reports";
import { findAnalyticsConnection, latestGa4Day, listGa4Properties, listVisitDays, listVisitLists } from "./queries/site-visits";
import { businessMembers, enquiries, metricBreakdowns, metricDaily, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "sv-owner";
const OTHER_OWNER = "sv-other-owner";
const NOW = new Date("2026-11-03T04:00:00.000Z");
const MONTH = "2026-11-01";

let dbs: TestDatabases;
let businessId = "";
let otherBusinessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([OWNER, OTHER_OWNER].map((id) => ({ id, name: id, email: `${id}@example.com`, emailVerified: true })));
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Kulkarni Physio", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId: otherBusinessId, userId: OTHER_OWNER, role: "owner" },
  ]);
});

const staff = () => dbs.staff.db;
const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);

async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

describe("the customer's read of visits (migration 0219)", () => {
  beforeEach(async () => {
    for (const [id, visits] of [[businessId, 12], [otherBusinessId, 99]] as const) {
      await upsertDailyMetrics(staff(), id, [
        { metric: "own.visits", day: "2026-11-01", value: visits },
        { metric: "own.visitors", day: "2026-11-01", value: 8 },
        { metric: "own.calls", day: "2026-11-01", value: 2 },
        { metric: "ga4.visits", day: "2026-11-01", value: visits + 1 },
        { metric: "own.visits", day: "2026-10-01", value: 5 },
      ], NOW);
      await upsertBreakdown(staff(), { businessId: id, source: "own", month: MONTH, dimension: "page", rows: [{ key: "/", count: visits }], now: NOW });
      await upsertBreakdown(staff(), { businessId: id, source: "own", month: MONTH, dimension: "device", rows: [{ key: "mobile", count: 3 }], now: NOW });
    }
  });

  it("returns only the business's own visit numbers for the source and the dates asked", async () => {
    const days = await asOwner((tx) => listVisitDays(tx, "own", "2026-11-01", "2026-11-30"));
    expect(days.map((row) => [row.metric, row.day, row.value])).toEqual([["visitors", "2026-11-01", 8], ["visits", "2026-11-01", 12]]);
    expect((await asOwner((tx) => listVisitDays(tx, "ga4", "2026-11-01", "2026-11-30"))).map((row) => [row.metric, row.value])).toEqual([["visits", 13]]);
  });

  it("returns only the lists the Website screen reads, for the business", async () => {
    const lists = await asOwner((tx) => listVisitLists(tx, "own", MONTH));
    expect(lists.map((list) => [list.dimension, list.rows])).toEqual([["page", [{ key: "/", count: 12 }]]]);
  });

  it("cannot read another business's rows at all, whatever the query asks for", async () => {
    expect((await asOwner((tx) => tx.select().from(metricDaily).where(eq(metricDaily.businessId, otherBusinessId)))).length).toBe(0);
    expect((await asOwner((tx) => tx.select().from(metricBreakdowns).where(eq(metricBreakdowns.businessId, otherBusinessId)))).length).toBe(0);
  });

  it("cannot write them", async () => {
    expect(await sqlState(() => asOwner((tx) => tx.insert(metricDaily).values({ businessId, metric: "own.visits", day: "2026-11-02", value: 1000 })))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => tx.insert(metricBreakdowns).values({ businessId, source: "own", month: MONTH, dimension: "page", rows: [] })))).toBe("42501");
  });

  it("needs a tenant scope", async () => {
    await expect(dbs.app.db.transaction((tx) => listVisitDays(tx, "own", "2026-11-01", "2026-11-30"))).rejects.toThrow();
  });
});

describe("the Google Analytics connection", () => {
  it("is read by the customer for their own business only, and listed with its property for the nightly job", async () => {
    await upsertReportSource(staff(), { businessId, source: "ga4", externalId: "412345678", now: NOW });
    await upsertReportSource(staff(), { businessId: otherBusinessId, source: "ga4", externalId: "512345678", now: NOW });
    expect(await asOwner((tx) => findAnalyticsConnection(tx))).toMatchObject({ externalId: "412345678", status: "pending" });
    expect((await listGa4Properties(staff())).map((row) => row.propertyId).sort()).toEqual(["412345678", "512345678"]);
  });

  it("has no connection until staff set a property, and latestGa4Day follows the pulled days", async () => {
    expect(await asOwner((tx) => findAnalyticsConnection(tx))).toBeNull();
    expect(await latestGa4Day(staff(), businessId)).toBeNull();
    await upsertDailyMetrics(staff(), businessId, [{ metric: "ga4.visits", day: "2026-11-01", value: 1 }, { metric: "ga4.visits", day: "2026-11-02", value: 1 }, { metric: "own.visits", day: "2026-11-03", value: 1 }], NOW);
    expect(await latestGa4Day(staff(), businessId)).toBe("2026-11-02");
  });
});

describe("form contents and their retention (gate G2)", () => {
  const input = (overrides: Partial<Parameters<typeof recordEnquiryContents>[1]> = {}) => ({
    businessId,
    kind: "form" as const,
    source: "Website",
    name: "Asha Rao",
    phone: "9820012345",
    email: "Asha@Example.com",
    message: "Do you treat knee pain?",
    receivedAt: new Date("2026-11-01T05:00:00.000Z"),
    retainUntil: new Date("2027-11-01T05:00:00.000Z"),
    sourceRef: "form:1",
    ...overrides,
  });

  it("stores the contents with the date they must go, and a repeat adds nothing", async () => {
    expect(await recordEnquiryContents(staff(), input())).toBe(true);
    expect(await recordEnquiryContents(staff(), input())).toBe(false);
    const [row] = await staff().select().from(enquiries).where(eq(enquiries.businessId, businessId));
    expect(row).toMatchObject({ kind: "form", name: "Asha Rao", retainUntil: new Date("2027-11-01T05:00:00.000Z"), detailsErasedAt: null });
  });

  it("refuses a row with no details, and a retention date that is not after receipt", async () => {
    await expect(recordEnquiryContents(staff(), input({ name: " ", phone: null, email: null, message: "" }))).rejects.toThrow("at least one");
    await expect(recordEnquiryContents(staff(), input({ retainUntil: new Date("2026-11-01T05:00:00.000Z") }))).rejects.toThrow("after receivedAt");
    // The date is fixed at insert: not even staff may move it.
    await recordEnquiryContents(staff(), input());
    expect(await sqlState(() => staff().execute(sql`update enquiries set retain_until = received_at + interval '100 years'`))).toBe("42501");
  });

  it("erases the details of expired rows only, keeps the rows, and the database refuses an erased row that still holds details", async () => {
    await recordEnquiryContents(staff(), input({ sourceRef: "form:old", retainUntil: new Date("2026-12-01T00:00:00.000Z") }));
    await recordEnquiryContents(staff(), input({ sourceRef: "form:new", receivedAt: new Date("2026-11-02T05:00:00.000Z") }));
    expect(await eraseExpiredEnquiryDetails(staff(), new Date("2026-12-02T00:00:00.000Z"))).toBe(1);
    const rows = await staff().select().from(enquiries).orderBy(enquiries.sourceRef);
    expect(rows.map((row) => [row.sourceRef, row.name, row.detailsErasedAt !== null])).toEqual([["form:new", "Asha Rao", false], ["form:old", null, true]]);
    expect(await eraseExpiredEnquiryDetails(staff(), new Date("2026-12-02T00:00:00.000Z"))).toBe(0);
    expect(await sqlState(() => staff().execute(sql`update enquiries set name = 'Back again' where source_ref = 'form:old'`))).toBe("23514");
  });

  it("erases one enquirer's details by email address (any case) or phone number, in one business only", async () => {
    await recordEnquiryContents(staff(), input({ sourceRef: "form:a" }));
    await recordEnquiryContents(staff(), input({ sourceRef: "form:b", email: null, name: "Asha", phone: "9820012345" }));
    await recordEnquiryContents(staff(), input({ businessId: otherBusinessId, sourceRef: "form:c" }));
    expect(await eraseEnquirerDetails(staff(), { businessId, email: "asha@example.com", now: NOW })).toBe(1);
    expect(await eraseEnquirerDetails(staff(), { businessId, phone: "9820012345", now: NOW })).toBe(1);
    const remaining = await staff().select().from(enquiries).where(eq(enquiries.name, "Asha Rao"));
    expect(remaining.map((row) => row.businessId)).toEqual([otherBusinessId]);
    await expect(eraseEnquirerDetails(staff(), { businessId, now: NOW })).rejects.toThrow("email address or a phone number");
  });

  it("is part of the nightly retention run: counted on a dry run, erased by the purge, rows kept", async () => {
    await recordEnquiryContents(staff(), input({ sourceRef: "form:due", retainUntil: new Date("2026-12-01T00:00:00.000Z") }));
    await recordEnquiryContents(staff(), input({ sourceRef: "form:later" }));
    const later = new Date("2026-12-05T00:00:00.000Z");
    expect(await countExpiredRetention(staff(), later)).toMatchObject({ enquiryDetails: 1 });
    expect(await purgeExpiredRetention(staff(), later)).toMatchObject({ enquiryDetails: 1 });
    expect(await countExpiredRetention(staff(), later)).toMatchObject({ enquiryDetails: 0 });
    expect(await staff().select().from(enquiries)).toHaveLength(2);
  });

  it("does not let a customer change the retention columns", async () => {
    await recordEnquiryContents(staff(), input());
    expect(await sqlState(() => asOwner((tx) => tx.update(enquiries).set({ retainUntil: new Date("2099-01-01T00:00:00.000Z") })))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => tx.update(enquiries).set({ name: null })))).toBe("42501");
  });
});
