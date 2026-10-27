import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBusiness } from "./queries/onboarding";
import { setupCallBookings, staffMembers, teamCalls, users, type TeamCall } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "calls-owner";
const OTHER_OWNER = "calls-other-owner";
const STAFF = "calls-staff";
const STARTS = new Date("2026-12-02T08:30:00.000Z");
const ENDS = new Date("2026-12-02T09:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let otherBusinessId = "";
let counter = 0;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  counter = 0;
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Priya Shah", email: `${OWNER}@example.com`, emailVerified: true },
    { id: OTHER_OWNER, name: "Arjun Rao", email: `${OTHER_OWNER}@example.com`, emailVerified: true },
    { id: STAFF, name: "Staff Member", email: `${STAFF}@example.com`, emailVerified: true },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
});

const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
const asOtherOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: otherBusinessId }, work);

/** Postgres reports a missing privilege as SQLSTATE 42501 and a failed check as 23514; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    return (error as { cause?: { code?: string } }).cause?.code;
  }
}

/** A booked call, added the way the dashboard adds one: through the customer's own connection. */
async function bookAsOwner(overrides: { reason?: string; note?: string | null; providerUri?: string | null } = {}): Promise<string> {
  counter += 1;
  const uri = overrides.providerUri === undefined ? `https://api.cal.com/v2/bookings/uid-${counter}` : overrides.providerUri;
  const rows = await asOwner((tx) =>
    tx
      .insert(teamCalls)
      .values({ businessId, reason: (overrides.reason ?? "social") as TeamCall["reason"], note: overrides.note ?? null, startsAt: STARTS, endsAt: ENDS, providerUri: uri })
      .returning({ id: teamCalls.id }),
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("The insert returned no id");
  return id;
}

const rowOf = async (id: string): Promise<TeamCall> => {
  const rows = await dbs.staff.db.select().from(teamCalls).where(eq(teamCalls.id, id));
  const row = rows[0];
  if (row === undefined) throw new Error("No such call");
  return row;
};

describe("what the customer role can do with a call", () => {
  it("books a call for its own business and reads it back, and no other business sees it", async () => {
    const id = await bookAsOwner({ note: "I want to try ads for braces in January." });
    const mine = await asOwner((tx) => tx.select().from(teamCalls));
    expect(mine.map((row) => row.id)).toEqual([id]);
    expect(mine[0]).toMatchObject({ status: "booked", source: "dashboard", reason: "social", heldAt: null, summary: null });
    expect(await asOtherOwner((tx) => tx.select().from(teamCalls))).toEqual([]);
  });

  it("cannot book a call for another business", async () => {
    const attempt = asOwner((tx) => tx.insert(teamCalls).values({ businessId: otherBusinessId, reason: "billing", startsAt: STARTS, endsAt: ENDS }));
    expect(await captureErrorText(attempt)).toMatch(/row-level security/);
  });

  it("cannot add a call that is already held, cancelled, summarised or from the booking page", async () => {
    const base = { businessId, reason: "billing" as const, startsAt: STARTS, endsAt: ENDS };
    const attempts = [
      { ...base, status: "held" as const, heldAt: STARTS, heldByStaffId: STAFF },
      { ...base, status: "cancelled" as const, cancelledAt: STARTS },
      { ...base, source: "booking_page" as const },
      { ...base, heldAt: STARTS, heldByStaffId: STAFF },
    ];
    for (const values of attempts) {
      expect(await sqlState(() => asOwner((tx) => tx.insert(teamCalls).values(values)))).toBeDefined();
    }
    expect(await dbs.staff.db.select().from(teamCalls)).toEqual([]);
  });

  it("cancels a call that has not happened, and can do nothing else to it", async () => {
    const id = await bookAsOwner();
    const now = new Date("2026-12-01T06:30:00.000Z");
    expect(await sqlState(() => asOwner((tx) => tx.update(teamCalls).set({ startsAt: new Date("2026-12-03T08:30:00.000Z"), endsAt: new Date("2026-12-03T09:00:00.000Z") }).where(eq(teamCalls.id, id))))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => tx.update(teamCalls).set({ note: "changed" }).where(eq(teamCalls.id, id))))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => tx.execute(sql`update team_calls set status = 'held', held_at = now(), held_by_staff_id = ${STAFF} where id = ${id}`)))).toBeDefined();
    expect(await sqlState(() => asOwner((tx) => tx.execute(sql`update team_calls set summary = 'Agreed', summary_at = now(), summary_by_staff_id = ${STAFF} where id = ${id}`)))).toBeDefined();
    await asOwner((tx) => tx.update(teamCalls).set({ status: "cancelled", cancelledAt: now }).where(eq(teamCalls.id, id)));
    expect((await rowOf(id)).status).toBe("cancelled");
  });

  it("cannot delete a call, and cannot touch another business's call", async () => {
    const id = await bookAsOwner();
    expect(await sqlState(() => asOwner((tx) => tx.delete(teamCalls).where(eq(teamCalls.id, id))))).toBe("42501");
    const cancelled = await asOtherOwner((tx) => tx.update(teamCalls).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(teamCalls.id, id)).returning({ id: teamCalls.id }));
    expect(cancelled).toEqual([]);
    expect((await rowOf(id)).status).toBe("booked");
  });
});

describe("the rule book for a call, for every writer", () => {
  it("lets staff mark a call held and write what was agreed, and only on a held call", async () => {
    const id = await bookAsOwner();
    const early = dbs.staff.db.update(teamCalls).set({ summary: "Agreed", summaryAt: new Date(), summaryByStaffId: STAFF }).where(eq(teamCalls.id, id));
    expect(await sqlState(() => early)).toBe("23514");
    await dbs.staff.db.update(teamCalls).set({ status: "held", heldAt: ENDS, heldByStaffId: STAFF }).where(eq(teamCalls.id, id));
    await dbs.staff.db.update(teamCalls).set({ summary: "Brighter photos, add Saturday timings", summaryAt: new Date(), summaryByStaffId: STAFF }).where(eq(teamCalls.id, id));
    expect(await rowOf(id)).toMatchObject({ status: "held", summary: "Brighter photos, add Saturday timings", heldByStaffId: STAFF });
  });

  it("keeps a call's business, reason, note and source fixed, even for staff", async () => {
    const id = await bookAsOwner({ note: "About ads" });
    for (const change of [{ reason: "billing" as const }, { note: "other words" }, { businessId: otherBusinessId }, { source: "booking_page" as const }]) {
      expect(await sqlState(() => dbs.staff.db.update(teamCalls).set(change).where(eq(teamCalls.id, id)))).toBe("42501");
    }
  });

  it("never revives a cancelled call, and never cancels a held one", async () => {
    const cancelledId = await bookAsOwner();
    await dbs.staff.db.update(teamCalls).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(teamCalls.id, cancelledId));
    expect(await sqlState(() => dbs.staff.db.update(teamCalls).set({ status: "booked", cancelledAt: null }).where(eq(teamCalls.id, cancelledId)))).toBe("23514");

    const heldId = await bookAsOwner();
    await dbs.staff.db.update(teamCalls).set({ status: "held", heldAt: ENDS, heldByStaffId: STAFF }).where(eq(teamCalls.id, heldId));
    expect(await sqlState(() => dbs.staff.db.update(teamCalls).set({ status: "cancelled", cancelledAt: new Date(), heldAt: null, heldByStaffId: null }).where(eq(teamCalls.id, heldId)))).toBe("23514");
  });

  it("moves a call to a new time and booking address (a reschedule from Cal.com's email)", async () => {
    const id = await bookAsOwner();
    const moved = { startsAt: new Date("2026-12-03T08:30:00.000Z"), endsAt: new Date("2026-12-03T09:00:00.000Z"), providerUri: "https://api.cal.com/v2/bookings/uid-new" };
    await dbs.staff.db.update(teamCalls).set(moved).where(eq(teamCalls.id, id));
    expect(await rowOf(id)).toMatchObject(moved);
  });

  it("refuses values the checks forbid", async () => {
    const base = { businessId, reason: "other" as const, startsAt: STARTS, endsAt: ENDS };
    const refused = [
      { ...base, endsAt: STARTS },
      { ...base, note: "x".repeat(501) },
      { ...base, note: "   " },
      { ...base, providerUri: "x".repeat(301) },
      { ...base, reason: "kickoff" as never },
    ];
    for (const values of refused) {
      expect(await sqlState(() => dbs.staff.db.insert(teamCalls).values(values)), JSON.stringify(values).slice(0, 80)).toBe("23514");
    }
  });

  it("allows one call per booking address, and any number with none", async () => {
    await bookAsOwner({ providerUri: "https://api.cal.com/v2/bookings/same" });
    expect(await sqlState(() => bookAsOwner({ providerUri: "https://api.cal.com/v2/bookings/same" }))).toBe("23505");
    await bookAsOwner({ providerUri: null });
    await bookAsOwner({ providerUri: null });
    expect(await dbs.staff.db.select().from(teamCalls)).toHaveLength(3);
  });
});

describe("the kickoff call's summary", () => {
  async function kickoff(held: boolean): Promise<void> {
    await dbs.staff.db.insert(setupCallBookings).values({ businessId, startsAt: STARTS, endsAt: ENDS, ...(held ? { heldAt: ENDS, heldByStaffId: STAFF } : {}) });
  }

  it("is written by staff once the call is held, and not before", async () => {
    await kickoff(false);
    const write = () => dbs.staff.db.update(setupCallBookings).set({ summary: "6 pages in blue and white", summaryAt: new Date(), summaryByStaffId: STAFF }).where(eq(setupCallBookings.businessId, businessId));
    expect(await sqlState(write)).toBe("23514");
    await dbs.staff.db.update(setupCallBookings).set({ heldAt: ENDS, heldByStaffId: STAFF }).where(eq(setupCallBookings.businessId, businessId));
    await write();
    const rows = await dbs.staff.db.select().from(setupCallBookings).where(eq(setupCallBookings.businessId, businessId));
    expect(rows[0]?.summary).toBe("6 pages in blue and white");
  });

  it("cannot be written or changed by the customer role", async () => {
    await kickoff(true);
    const attempt = () => asOwner((tx) => tx.update(setupCallBookings).set({ summary: "Mine", summaryAt: new Date(), summaryByStaffId: STAFF }).where(eq(setupCallBookings.businessId, businessId)));
    expect(await sqlState(attempt)).toBe("42501");
    const insert = () => asOtherOwner((tx) => tx.insert(setupCallBookings).values({ businessId: otherBusinessId, summary: "Mine", summaryAt: new Date(), summaryByStaffId: STAFF }));
    expect(await sqlState(insert)).toBe("42501");
  });
});
