import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addActivityEvent, listActivityEvents, removeActivityEvent } from "./queries/activity-events";
import { countChatbotLeadsSince } from "./queries/chatbots";
import { listMonthlySnapshots, upsertMonthlySnapshot, type SnapshotFigures } from "./queries/monthly-snapshots";
import { insertBusiness } from "./queries/onboarding";
import { listServiceSetups, saveServiceSetup } from "./queries/service-setup";
import { clearSetupCallHeld, findSetupCallBooking, markSetupCallHeld } from "./queries/setup-calls";
import { chatbotLeads, chatbots, setupCallBookings, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "owner-a";
const OTHER_OWNER = "owner-b";
const STAFF = "staff-a";
const NOW = new Date("2026-10-27T08:00:00.000Z");

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
  await dbs.staff.db.insert(users).values([
    { id: OWNER, name: "Meera Shah", email: `${OWNER}@example.com`, emailVerified: true },
    { id: OTHER_OWNER, name: "Arjun Rao", email: `${OTHER_OWNER}@example.com`, emailVerified: true },
    { id: STAFF, name: "Staff Member", email: `${STAFF}@example.com`, emailVerified: true },
  ]);
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Aster Physio", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(setupCallBookings).values({ businessId });
});

/** Postgres reports a missing privilege as SQLSTATE 42501; drizzle wraps the driver error as `cause`. */
async function sqlState(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
    return undefined;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code;
  }
}

describe("who may mark a kickoff call as held", () => {
  it("lets staff mark it", async () => {
    await dbs.staff.db
      .update(setupCallBookings)
      .set({ heldAt: new Date("2026-10-26T06:00:00.000Z"), heldByStaffId: STAFF })
      .where(eq(setupCallBookings.businessId, businessId));
    const [row] = await dbs.staff.db.select().from(setupCallBookings).where(eq(setupCallBookings.businessId, businessId));
    expect(row?.heldByStaffId).toBe(STAFF);
  });

  it("the customer role cannot mark its own call held", async () => {
    const state = await sqlState(() =>
      withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
        tx.execute(sql`update setup_call_bookings set held_at = now() where business_id = ${businessId}`),
      ),
    );
    expect(state).toBe("42501");
  });

  it("the customer role cannot insert a booking that is already held", async () => {
    await dbs.staff.db.delete(setupCallBookings).where(eq(setupCallBookings.businessId, businessId));
    const state = await sqlState(() =>
      withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
        tx.execute(sql`insert into setup_call_bookings (id, business_id, held_by_staff_id) values (gen_random_uuid(), ${businessId}, ${STAFF})`),
      ),
    );
    expect(state).toBe("42501");
  });

  it("the customer role can still change the booking's own columns", async () => {
    await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) =>
      tx.execute(sql`update setup_call_bookings set invitee_uri = 'https://api.cal.com/v2/bookings/x', updated_at = now() where business_id = ${businessId}`),
    );
    const [row] = await dbs.staff.db.select().from(setupCallBookings).where(eq(setupCallBookings.businessId, businessId));
    expect(row?.inviteeUri).toBe("https://api.cal.com/v2/bookings/x");
  });
});

const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
const asOtherOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) =>
  withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: otherBusinessId }, work);

describe("marking the kickoff call held", () => {
  it("sets the time and the staff member on an existing booking, and the customer sees it", async () => {
    expect(await markSetupCallHeld(dbs.staff.db, { businessId, staffId: STAFF, now: NOW })).toBe(true);
    const booking = await asOwner((tx) => findSetupCallBooking(tx, businessId));
    expect(booking?.heldAt).toEqual(NOW);
    expect(booking?.heldByStaffId).toBe(STAFF);
  });

  it("inserts a held row with no times when the call was held by phone", async () => {
    expect(await markSetupCallHeld(dbs.staff.db, { businessId: otherBusinessId, staffId: STAFF, now: NOW })).toBe(true);
    const booking = await asOtherOwner((tx) => findSetupCallBooking(tx, otherBusinessId));
    expect(booking).toMatchObject({ heldAt: NOW, heldByStaffId: STAFF, startsAt: null, endsAt: null });
  });

  it("is undone by clearSetupCallHeld, which says false when nothing was held", async () => {
    expect(await clearSetupCallHeld(dbs.staff.db, businessId, NOW)).toBe(false);
    await markSetupCallHeld(dbs.staff.db, { businessId, staffId: STAFF, now: NOW });
    expect(await clearSetupCallHeld(dbs.staff.db, businessId, NOW)).toBe(true);
    const booking = await asOwner((tx) => findSetupCallBooking(tx, businessId));
    expect(booking?.heldAt).toBeNull();
    expect(booking?.heldByStaffId).toBeNull();
    expect(await clearSetupCallHeld(dbs.staff.db, businessId, NOW)).toBe(false);
  });

  it("refuses the customer connection, so it must run as staff", async () => {
    expect(await sqlState(() => asOwner((tx) => markSetupCallHeld(tx, { businessId, staffId: STAFF, now: NOW })))).toBe("42501");
    expect(await sqlState(() => asOwner((tx) => clearSetupCallHeld(tx, businessId, NOW)))).toBeUndefined();
    await markSetupCallHeld(dbs.staff.db, { businessId, staffId: STAFF, now: NOW });
    expect(await sqlState(() => asOwner((tx) => clearSetupCallHeld(tx, businessId, NOW)))).toBe("42501");
    const booking = await asOwner((tx) => findSetupCallBooking(tx, businessId));
    expect(booking?.heldAt).toEqual(NOW);
  });
});

describe("a customer's saved setup answers", () => {
  it("are inserted, then merged by a later save, and a blank string is kept as a blank", async () => {
    await asOwner((tx) => saveServiceSetup(tx, { businessId, service: "social", answers: { instagramUrl: "https://instagram.com/aster" }, now: NOW }));
    await asOwner((tx) => saveServiceSetup(tx, { businessId, service: "social", answers: { facebookUrl: "https://facebook.com/aster", instagramUrl: "" }, now: NOW }));
    const [row, ...rest] = await asOwner((tx) => listServiceSetups(tx, businessId));
    expect(rest).toHaveLength(0);
    expect(row?.answers).toEqual({ instagramUrl: "", facebookUrl: "https://facebook.com/aster" });
  });

  it("list one row per service", async () => {
    await asOwner((tx) => saveServiceSetup(tx, { businessId, service: "social", answers: { a: "1" }, now: NOW }));
    await asOwner((tx) => saveServiceSetup(tx, { businessId, service: "search", answers: { b: "2" }, now: NOW }));
    await asOwner((tx) => saveServiceSetup(tx, { businessId, service: "search", answers: { c: "3" }, now: NOW }));
    const rows = await asOwner((tx) => listServiceSetups(tx, businessId));
    expect(rows.map((row) => row.service).sort()).toEqual(["search", "social"]);
  });

  it("are neither readable nor writable by another business's customer", async () => {
    await asOwner((tx) => saveServiceSetup(tx, { businessId, service: "social", answers: { a: "1" }, now: NOW }));
    expect(await asOtherOwner((tx) => listServiceSetups(tx, businessId))).toEqual([]);
    await expect(
      asOtherOwner((tx) => saveServiceSetup(tx, { businessId, service: "social", answers: { a: "hijacked" }, now: NOW })),
    ).rejects.toThrow();
    const [row] = await asOwner((tx) => listServiceSetups(tx, businessId));
    expect(row?.answers).toEqual({ a: "1" });
  });
});

describe("dated updates for a customer", () => {
  it("are added by staff and read by the customer newest first, up to the limit", async () => {
    const at = (day: number) => new Date(`2026-10-${day}T08:00:00.000Z`);
    await addActivityEvent(dbs.staff.db, { businessId, service: "social", title: "Second post live", occurredAt: at(20), staffId: STAFF });
    await addActivityEvent(dbs.staff.db, { businessId, service: null, title: "Newest line", occurredAt: at(25), staffId: STAFF });
    await addActivityEvent(dbs.staff.db, { businessId, service: "website", title: "Oldest line", occurredAt: at(10), staffId: STAFF });
    const all = await asOwner((tx) => listActivityEvents(tx, businessId, 10));
    expect(all.map((event) => event.title)).toEqual(["Newest line", "Second post live", "Oldest line"]);
    expect(all[0]?.service).toBeNull();
    const two = await asOwner((tx) => listActivityEvents(tx, businessId, 2));
    expect(two.map((event) => event.title)).toEqual(["Newest line", "Second post live"]);
  });

  it("cannot be added by the customer role", async () => {
    const state = await sqlState(() =>
      asOwner((tx) => addActivityEvent(tx, { businessId, service: null, title: "Made up by me", occurredAt: NOW, staffId: STAFF })),
    );
    expect(state).toBe("42501");
  });

  it("are invisible to another business", async () => {
    await addActivityEvent(dbs.staff.db, { businessId, service: null, title: "Private line", occurredAt: NOW, staffId: STAFF });
    expect(await asOtherOwner((tx) => listActivityEvents(tx, businessId, 10))).toEqual([]);
  });

  it("are removed by id for the right business only", async () => {
    await addActivityEvent(dbs.staff.db, { businessId, service: null, title: "Added by mistake", occurredAt: NOW, staffId: STAFF });
    const [event] = await listActivityEvents(dbs.staff.db, businessId, 10);
    const id = event?.id ?? "";
    expect(await removeActivityEvent(dbs.staff.db, { id, businessId: otherBusinessId })).toBe(false);
    expect(await removeActivityEvent(dbs.staff.db, { id, businessId })).toBe(true);
    expect(await listActivityEvents(dbs.staff.db, businessId, 10)).toEqual([]);
    expect(await removeActivityEvent(dbs.staff.db, { id, businessId })).toBe(false);
  });
});

describe("a business's monthly numbers", () => {
  const MONTH = "2026-11-01";
  const none: SnapshotFigures = {
    adSpendCents: null,
    adBudgetCents: null,
    adEnquiries: null,
    postsPublished: null,
    postsPlanned: null,
    keywordsPageOne: null,
    keywordsPageOnePrev: null,
  };
  const save = (figures: SnapshotFigures, month = MONTH, db: Parameters<typeof upsertMonthlySnapshot>[0] = dbs.staff.db) =>
    upsertMonthlySnapshot(db, { businessId, service: "social", month, figures, staffId: STAFF, now: NOW });

  it("are inserted, then updated in place for the same service and month, and null clears a figure", async () => {
    await save({ ...none, adSpendCents: 120000, adEnquiries: 9 });
    await save({ ...none, adSpendCents: 150000, postsPublished: 12 });
    const rows = await listMonthlySnapshots(dbs.staff.db, businessId, MONTH);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ adSpendCents: 150000, adEnquiries: null, postsPublished: 12, updatedByStaffId: STAFF });
  });

  it("refuse a month that is not the first day", async () => {
    await expect(save(none, "2026-11-15")).rejects.toThrow();
  });

  it("are readable by the customer for their own month and not writable", async () => {
    await save({ ...none, adEnquiries: 4 });
    const own = await asOwner((tx) => listMonthlySnapshots(tx, businessId, MONTH));
    expect(own[0]?.adEnquiries).toBe(4);
    expect(await asOtherOwner((tx) => listMonthlySnapshots(tx, businessId, MONTH))).toEqual([]);
    expect(await sqlState(() => asOwner((tx) => save({ ...none, adEnquiries: 99 }, MONTH, tx)))).toBe("42501");
  });
});

describe("counting chatbot leads since a date", () => {
  it("counts only that business's leads captured on or after the date", async () => {
    const [bot] = await dbs.staff.db.insert(chatbots).values({ businessId, name: "Website assistant", oyechatsBotId: 501 }).returning();
    const [otherBot] = await dbs.staff.db.insert(chatbots).values({ businessId: otherBusinessId, name: "Website assistant", oyechatsBotId: 502 }).returning();
    const lead = (chatbotId: string, owner: string, sessionId: string, capturedAt: string) => ({
      chatbotId,
      businessId: owner,
      sessionId,
      capturedAt: new Date(capturedAt),
    });
    await dbs.staff.db.insert(chatbotLeads).values([
      lead(bot?.id ?? "", businessId, "s1", "2026-09-30T18:29:59.000Z"),
      lead(bot?.id ?? "", businessId, "s2", "2026-09-30T18:30:00.000Z"),
      lead(bot?.id ?? "", businessId, "s3", "2026-10-20T10:00:00.000Z"),
      lead(otherBot?.id ?? "", otherBusinessId, "s4", "2026-10-20T10:00:00.000Z"),
    ]);
    const since = new Date("2026-09-30T18:30:00.000Z");
    expect(await asOwner((tx) => countChatbotLeadsSince(tx, businessId, since))).toBe(2);
    expect(await asOtherOwner((tx) => countChatbotLeadsSince(tx, otherBusinessId, since))).toBe(1);
    expect(await asOwner((tx) => countChatbotLeadsSince(tx, businessId, new Date("2026-11-01T00:00:00.000Z")))).toBe(0);
  });
});
