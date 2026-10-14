import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createListingAccountBusiness, decideDirectoryClaim } from "./queries/directory-ads";
import {
  InvalidDirectoryDealError,
  createDirectoryDeal,
  listDealsOnShowForStaff,
  listOwnDeals,
  readDealsOnShow,
  removeDirectoryDeal,
  takeDownDirectoryDeal,
  updateDirectoryDeal,
  type DirectoryDealFields,
} from "./queries/directory-deals";
import { users } from "./schema";
import { withTenantScope, type ScopedTransaction } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "staff-1";
const OWNERS = ["owner-a", "owner-b"] as const;
const KEYS = ["dentists/thane/naupada/smile-dental", "dentists/thane/naupada/bright-teeth"] as const;
const NOW = new Date("2026-10-07T06:30:00.000Z");
const TODAY = "2026-10-07";

let dbs: TestDatabases;
let business: string[] = [];
let claims: string[] = [];

function id(index: number): string {
  const value = business[index];
  if (value === undefined) throw new Error(`No business ${index}`);
  return value;
}

function asBusiness<T>(index: number, work: (tx: ScopedTransaction) => Promise<T>): Promise<T> {
  const owner = OWNERS[index];
  if (owner === undefined) throw new Error(`No owner ${index}`);
  return withTenantScope(dbs.app.db, { userId: owner, businessId: id(index) }, work);
}

function fields(overrides: Partial<DirectoryDealFields> = {}): DirectoryDealFields {
  return { title: "20% off your first haircut", badge: "20% off", terms: "Weekdays before 5 pm", startsOn: TODAY, endsOn: "2026-10-31", ...overrides };
}

async function post(index: number, overrides: Partial<DirectoryDealFields> = {}) {
  const outcome = await createDirectoryDeal(dbs.staff.db, { businessId: id(index), userId: OWNERS[index] ?? "", fields: fields(overrides), today: TODAY });
  if (outcome.kind !== "created") throw new Error(`The deal was refused: ${outcome.kind}`);
  return outcome.deal;
}

async function approveClaim(index: number): Promise<void> {
  const claimId = claims[index];
  if (claimId === undefined) throw new Error(`No claim ${index}`);
  await decideDirectoryClaim(dbs.staff.db, { claimId, approve: true, staffId: STAFF, now: NOW });
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: STAFF, name: "Staff", email: "staff@example.com" },
    ...OWNERS.map((owner, index) => ({ id: owner, name: `Owner ${index}`, email: `${owner}@example.com`, emailVerified: true })),
  ]);
  business = [];
  claims = [];
  for (const [index, owner] of OWNERS.entries()) {
    const created = await createListingAccountBusiness(dbs.staff.db, {
      userId: owner,
      listingKey: KEYS[index] ?? "",
      businessName: `Clinic ${index}`,
      phone: `+9198200000${index}0`,
    });
    business.push(created.businessId);
    claims.push(created.claimId);
  }
});

describe("posting a deal", () => {
  it("is live at once, trimmed, and readable by its owner only", async () => {
    const deal = await post(0, { title: "  Free check-up  " });
    expect(deal).toMatchObject({ businessId: id(0), title: "Free check-up", status: "live", takenDownReason: null });
    expect(await asBusiness(0, (tx) => listOwnDeals(tx, id(0)))).toEqual([deal]);
    expect(await asBusiness(1, (tx) => listOwnDeals(tx, id(0)))).toEqual([]);
  });

  it("refuses bad fields and a deal that runs too long, saving nothing", async () => {
    await expect(createDirectoryDeal(dbs.staff.db, { businessId: id(0), userId: "owner-a", fields: fields({ title: "  " }), today: TODAY })).rejects.toThrow(InvalidDirectoryDealError);
    await expect(createDirectoryDeal(dbs.staff.db, { businessId: id(0), userId: "owner-a", fields: fields({ badge: "x".repeat(21) }), today: TODAY })).rejects.toThrow(InvalidDirectoryDealError);
    await expect(createDirectoryDeal(dbs.staff.db, { businessId: id(0), userId: "owner-a", fields: fields({ endsOn: "2026-10-06" }), today: TODAY })).rejects.toThrow(InvalidDirectoryDealError);
    await expect(createDirectoryDeal(dbs.staff.db, { businessId: id(0), userId: "owner-a", fields: fields({ endsOn: "2027-01-05" }), today: TODAY })).rejects.toThrow(InvalidDirectoryDealError);
    await expect(createDirectoryDeal(dbs.staff.db, { businessId: id(0), userId: "owner-a", fields: fields({ endsOn: "2026-02-30" }), today: TODAY })).rejects.toThrow(InvalidDirectoryDealError);
    expect(await listOwnDeals(dbs.staff.db, id(0))).toEqual([]);
  });

  it("allows five running deals and refuses a sixth until one ends or is removed", async () => {
    const posted = [];
    for (let n = 0; n < 5; n += 1) posted.push(await post(0, { title: `Deal ${String(n)}` }));
    expect(await createDirectoryDeal(dbs.staff.db, { businessId: id(0), userId: "owner-a", fields: fields(), today: TODAY })).toEqual({ kind: "limit" });
    // Another business is not held by it.
    await post(1);
    const first = posted[0];
    if (first === undefined) throw new Error("No first deal");
    expect(await removeDirectoryDeal(dbs.staff.db, { businessId: id(0), dealId: first.id, now: NOW })).toBe(true);
    await post(0);
  });

  it("does not count a deal that has already ended against the limit", async () => {
    for (let n = 0; n < 5; n += 1) await post(0, { startsOn: "2026-09-01", endsOn: "2026-09-30" });
    await post(0);
  });

  it("needs a claim that has not been rejected", async () => {
    const stranger = await dbs.staff.db.insert(users).values({ id: "owner-c", name: "C", email: "c@example.com" });
    void stranger;
    const rejectedClaim = claims[1];
    if (rejectedClaim === undefined) throw new Error("No claim");
    await decideDirectoryClaim(dbs.staff.db, { claimId: rejectedClaim, approve: false, staffId: STAFF, now: NOW });
    expect(await createDirectoryDeal(dbs.staff.db, { businessId: id(1), userId: "owner-b", fields: fields(), today: TODAY })).toEqual({ kind: "no-claim" });
  });
});

describe("changing and removing", () => {
  it("lets an owner edit and remove only their own deal", async () => {
    const deal = await post(0);
    expect(await updateDirectoryDeal(dbs.staff.db, { businessId: id(1), dealId: deal.id, fields: fields({ title: "Hijack" }) })).toBe(false);
    expect(await updateDirectoryDeal(dbs.staff.db, { businessId: id(0), dealId: deal.id, fields: fields({ title: "New title" }) })).toBe(true);
    expect((await listOwnDeals(dbs.staff.db, id(0)))[0]?.title).toBe("New title");
    expect(await removeDirectoryDeal(dbs.staff.db, { businessId: id(1), dealId: deal.id, now: NOW })).toBe(false);
    expect(await removeDirectoryDeal(dbs.staff.db, { businessId: id(0), dealId: deal.id, now: NOW })).toBe(true);
    expect(await listOwnDeals(dbs.staff.db, id(0))).toEqual([]);
    expect(await updateDirectoryDeal(dbs.staff.db, { businessId: id(0), dealId: deal.id, fields: fields() })).toBe(false);
  });

  it("answers false for something that is not a deal id", async () => {
    expect(await updateDirectoryDeal(dbs.staff.db, { businessId: id(0), dealId: "nope", fields: fields() })).toBe(false);
    expect(await removeDirectoryDeal(dbs.staff.db, { businessId: id(0), dealId: "nope", now: NOW })).toBe(false);
    expect(await takeDownDirectoryDeal(dbs.staff.db, { dealId: "nope", staffId: STAFF, reason: "x", now: NOW })).toBe(false);
  });
});

describe("staff take-down", () => {
  it("takes a deal off every list, tells the owner why, and cannot be undone by editing", async () => {
    await approveClaim(0);
    const deal = await post(0);
    expect(await takeDownDirectoryDeal(dbs.staff.db, { dealId: deal.id, staffId: STAFF, reason: "  Not a real offer  ", now: NOW })).toBe(true);
    expect(await takeDownDirectoryDeal(dbs.staff.db, { dealId: deal.id, staffId: STAFF, reason: "again", now: NOW })).toBe(false);
    expect(await readDealsOnShow(dbs.staff.db, TODAY)).toEqual([]);
    expect(await listDealsOnShowForStaff(dbs.staff.db, TODAY)).toEqual([]);
    const own = await asBusiness(0, (tx) => listOwnDeals(tx, id(0)));
    expect(own[0]).toMatchObject({ status: "taken_down", takenDownReason: "Not a real offer" });
    expect(await updateDirectoryDeal(dbs.staff.db, { businessId: id(0), dealId: deal.id, fields: fields() })).toBe(false);
    await expect(takeDownDirectoryDeal(dbs.staff.db, { dealId: deal.id, staffId: STAFF, reason: " ", now: NOW })).rejects.toThrow(InvalidDirectoryDealError);
  });
});

describe("what is on show", () => {
  it("shows a live deal from its first day to its last, once its claim is approved", async () => {
    const deal = await post(0, { startsOn: "2026-10-08", endsOn: "2026-10-10" });
    await approveClaim(0);
    expect(await readDealsOnShow(dbs.staff.db, "2026-10-07")).toEqual([]);
    for (const day of ["2026-10-08", "2026-10-09", "2026-10-10"]) {
      expect((await readDealsOnShow(dbs.staff.db, day)).map((row) => row.id)).toEqual([deal.id]);
    }
    expect(await readDealsOnShow(dbs.staff.db, "2026-10-11")).toEqual([]);
    expect((await readDealsOnShow(dbs.staff.db, "2026-10-09"))[0]).toMatchObject({ listingKey: KEYS[0], businessName: "Clinic 0", placeId: null });
  });

  it("holds back a deal whose claim is not approved yet, but shows it to staff", async () => {
    await post(0);
    expect(await readDealsOnShow(dbs.staff.db, TODAY)).toEqual([]);
    expect(await listDealsOnShowForStaff(dbs.staff.db, TODAY)).toHaveLength(1);
    await approveClaim(0);
    expect(await readDealsOnShow(dbs.staff.db, TODAY)).toHaveLength(1);
  });

  it("lists newest first", async () => {
    await approveClaim(0);
    await approveClaim(1);
    const older = await post(0);
    const newer = await post(1);
    expect((await readDealsOnShow(dbs.staff.db, TODAY)).map((row) => row.id)).toEqual([newer.id, older.id]);
  });
});
