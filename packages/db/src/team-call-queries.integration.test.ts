import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { insertBusiness } from "./queries/onboarding";
import { markSetupCallHeld, saveSetupCallSummary, clearSetupCallHeld, findSetupCallBooking } from "./queries/setup-calls";
import {
  cancelTeamCall,
  cancelTeamCallByUri,
  clearTeamCallHeld,
  findTeamCall,
  listTeamCalls,
  markTeamCallHeld,
  moveTeamCallByUri,
  recordBookedCallFromWebhook,
  recordTeamCall,
  saveTeamCallSummary,
} from "./queries/team-calls";
import { businessMembers, setupCallBookings, staffMembers, teamCalls, users } from "./schema";
import { withTenantScope } from "./scope";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const OWNER = "tcq-owner";
const OTHER_OWNER = "tcq-other-owner";
const STAFF = "tcq-staff";
const NOW = new Date("2026-12-01T06:30:00.000Z");
const STARTS = new Date("2026-12-02T08:30:00.000Z");
const ENDS = new Date("2026-12-02T09:00:00.000Z");
const URI = "https://api.cal.com/v2/bookings/uid-1";

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
    { id: OWNER, name: "Priya Shah", email: "Priya@Example.com", emailVerified: true },
    { id: OTHER_OWNER, name: "Arjun Rao", email: "arjun@example.com", emailVerified: true },
    { id: STAFF, name: "Staff Member", email: "staff@example.com", emailVerified: true },
  ]);
  await dbs.staff.db.insert(staffMembers).values({ userId: STAFF });
  businessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Sai Dental Care", "INR"))).id;
  otherBusinessId = (await dbs.staff.db.transaction((tx) => insertBusiness(tx, "Birch Dental", "INR"))).id;
  await dbs.staff.db.insert(businessMembers).values([
    { businessId, userId: OWNER, role: "owner" },
    { businessId: otherBusinessId, userId: OTHER_OWNER, role: "owner" },
  ]);
});

const asOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, work);
const asOtherOwner = <T>(work: Parameters<typeof withTenantScope<T>>[2]) => withTenantScope(dbs.app.db, { userId: OTHER_OWNER, businessId: otherBusinessId }, work);

const input = (overrides: Partial<Parameters<typeof recordTeamCall>[1]> = {}): Parameters<typeof recordTeamCall>[1] => ({
  businessId,
  reason: "social",
  note: "Ads for braces",
  startsAt: STARTS,
  endsAt: ENDS,
  providerUri: URI,
  ...overrides,
});

async function heldKickoff(): Promise<void> {
  await markSetupCallHeld(dbs.staff.db, { businessId, staffId: STAFF, now: NOW });
}

describe("the customer's calls", () => {
  it("records a booked call once, whatever the number of tries", async () => {
    const first = await asOwner((tx) => recordTeamCall(tx, input()));
    const again = await asOwner((tx) => recordTeamCall(tx, input({ note: "Different words" })));
    expect(first.created).toBe(true);
    expect(again).toEqual({ id: first.id, created: false });
    const rows = await asOwner((tx) => listTeamCalls(tx, businessId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.note).toBe("Ads for braces");
  });

  it("records every call that has no booking address, and lists the newest first", async () => {
    await asOwner((tx) => recordTeamCall(tx, input({ providerUri: null })));
    await asOwner((tx) => recordTeamCall(tx, input({ providerUri: null, startsAt: new Date("2026-12-05T08:30:00.000Z"), endsAt: new Date("2026-12-05T09:00:00.000Z") })));
    const rows = await asOwner((tx) => listTeamCalls(tx, businessId));
    expect(rows.map((row) => row.startsAt.toISOString())).toEqual(["2026-12-05T08:30:00.000Z", "2026-12-02T08:30:00.000Z"]);
  });

  it("shows a business only its own calls", async () => {
    const mine = await asOwner((tx) => recordTeamCall(tx, input()));
    expect(await asOtherOwner((tx) => listTeamCalls(tx, otherBusinessId))).toEqual([]);
    expect(await asOtherOwner((tx) => findTeamCall(tx, otherBusinessId, mine.id))).toBeNull();
    expect((await asOwner((tx) => findTeamCall(tx, businessId, mine.id)))?.reason).toBe("social");
  });

  it("cancels a call that is still ahead, once, and not another business's", async () => {
    const { id } = await asOwner((tx) => recordTeamCall(tx, input()));
    expect(await asOtherOwner((tx) => cancelTeamCall(tx, { id, businessId: otherBusinessId, now: NOW }))).toBe(false);
    expect(await asOwner((tx) => cancelTeamCall(tx, { id, businessId, now: NOW }))).toBe(true);
    expect(await asOwner((tx) => cancelTeamCall(tx, { id, businessId, now: NOW }))).toBe(false);
    expect((await asOwner((tx) => findTeamCall(tx, businessId, id)))).toMatchObject({ status: "cancelled", cancelledAt: NOW });
  });

  it("does not cancel a call that has started", async () => {
    const { id } = await asOwner((tx) => recordTeamCall(tx, input()));
    expect(await asOwner((tx) => cancelTeamCall(tx, { id, businessId, now: new Date("2026-12-02T08:45:00.000Z") }))).toBe(false);
  });
});

describe("staff and the call", () => {
  it("marks a call held only after it has started, and unmarks it", async () => {
    const { id } = await asOwner((tx) => recordTeamCall(tx, input()));
    expect(await markTeamCallHeld(dbs.staff.db, { id, businessId, staffId: STAFF, now: NOW })).toBe(false);
    const after = new Date("2026-12-02T09:10:00.000Z");
    expect(await markTeamCallHeld(dbs.staff.db, { id, businessId, staffId: STAFF, now: after })).toBe(true);
    expect(await markTeamCallHeld(dbs.staff.db, { id, businessId, staffId: STAFF, now: after })).toBe(false);
    expect(await findTeamCall(dbs.staff.db, businessId, id)).toMatchObject({ status: "held", heldAt: after, heldByStaffId: STAFF });
    expect(await clearTeamCallHeld(dbs.staff.db, { id, businessId, now: after })).toBe(true);
    expect(await findTeamCall(dbs.staff.db, businessId, id)).toMatchObject({ status: "booked", heldAt: null, heldByStaffId: null });
  });

  it("writes, changes and clears what was agreed, only on a held call, and drops it when the mark is undone", async () => {
    const { id } = await asOwner((tx) => recordTeamCall(tx, input()));
    const after = new Date("2026-12-02T09:10:00.000Z");
    expect(await saveTeamCallSummary(dbs.staff.db, { id, businessId, staffId: STAFF, summary: "Too early", now: after })).toBe(false);
    await markTeamCallHeld(dbs.staff.db, { id, businessId, staffId: STAFF, now: after });
    expect(await saveTeamCallSummary(dbs.staff.db, { id, businessId, staffId: STAFF, summary: "Try braces ads in January", now: after })).toBe(true);
    expect((await findTeamCall(dbs.staff.db, businessId, id))?.summary).toBe("Try braces ads in January");
    expect(await saveTeamCallSummary(dbs.staff.db, { id, businessId, staffId: STAFF, summary: "Braces ads from 5 January", now: after })).toBe(true);
    expect(await saveTeamCallSummary(dbs.staff.db, { id, businessId, staffId: STAFF, summary: null, now: after })).toBe(true);
    expect(await findTeamCall(dbs.staff.db, businessId, id)).toMatchObject({ summary: null, summaryAt: null, summaryByStaffId: null });
    await saveTeamCallSummary(dbs.staff.db, { id, businessId, staffId: STAFF, summary: "Agreed", now: after });
    await clearTeamCallHeld(dbs.staff.db, { id, businessId, now: after });
    expect((await findTeamCall(dbs.staff.db, businessId, id))?.summary).toBeNull();
  });

  it("will not save a call's summary under another business", async () => {
    const { id } = await asOwner((tx) => recordTeamCall(tx, input()));
    const after = new Date("2026-12-02T09:10:00.000Z");
    await markTeamCallHeld(dbs.staff.db, { id, businessId, staffId: STAFF, now: after });
    expect(await saveTeamCallSummary(dbs.staff.db, { id, businessId: otherBusinessId, staffId: STAFF, summary: "Wrong", now: after })).toBe(false);
  });

  it("writes the kickoff call's summary once it is held, drops it when the mark is undone, and refuses it before", async () => {
    await dbs.staff.db.insert(setupCallBookings).values({ businessId, startsAt: STARTS, endsAt: ENDS });
    expect(await saveSetupCallSummary(dbs.staff.db, { businessId, staffId: STAFF, summary: "Too early", now: NOW })).toBe(false);
    await heldKickoff();
    expect(await saveSetupCallSummary(dbs.staff.db, { businessId, staffId: STAFF, summary: "6 pages in blue and white", now: NOW })).toBe(true);
    expect((await findSetupCallBooking(dbs.staff.db, businessId))?.summary).toBe("6 pages in blue and white");
    expect(await clearSetupCallHeld(dbs.staff.db, businessId, NOW)).toBe(true);
    expect(await findSetupCallBooking(dbs.staff.db, businessId)).toMatchObject({ summary: null, summaryAt: null, heldAt: null });
  });
});

describe("what Cal.com tells us", () => {
  it("cancels a booked call by its booking address, once", async () => {
    const { id } = await asOwner((tx) => recordTeamCall(tx, input()));
    expect(await cancelTeamCallByUri(dbs.staff.db, "https://api.cal.com/v2/bookings/unknown", NOW)).toBe(false);
    expect(await cancelTeamCallByUri(dbs.staff.db, URI, NOW)).toBe(true);
    expect(await cancelTeamCallByUri(dbs.staff.db, URI, NOW)).toBe(false);
    expect((await findTeamCall(dbs.staff.db, businessId, id))?.status).toBe("cancelled");
  });

  it("leaves a call that was held as it is when its booking is cancelled afterwards", async () => {
    const { id } = await asOwner((tx) => recordTeamCall(tx, input()));
    await markTeamCallHeld(dbs.staff.db, { id, businessId, staffId: STAFF, now: new Date("2026-12-02T09:10:00.000Z") });
    expect(await cancelTeamCallByUri(dbs.staff.db, URI, NOW)).toBe(false);
    expect((await findTeamCall(dbs.staff.db, businessId, id))?.status).toBe("held");
  });

  it("moves a booked call to the booking Cal.com rescheduled it to", async () => {
    const { id } = await asOwner((tx) => recordTeamCall(tx, input()));
    const to = { fromProviderUri: URI, toProviderUri: "https://api.cal.com/v2/bookings/uid-2", startsAt: new Date("2026-12-03T08:30:00.000Z"), endsAt: new Date("2026-12-03T09:00:00.000Z"), now: NOW };
    expect(await moveTeamCallByUri(dbs.staff.db, to)).toBe(true);
    expect(await findTeamCall(dbs.staff.db, businessId, id)).toMatchObject({ providerUri: to.toProviderUri, startsAt: to.startsAt, endsAt: to.endsAt });
    expect(await moveTeamCallByUri(dbs.staff.db, to)).toBe(false);
  });

  it("cancels the old call instead of moving it when the booking it moved to is already recorded (the new booking's notice came first)", async () => {
    const old = await asOwner((tx) => recordTeamCall(tx, input()));
    const next = await asOwner((tx) => recordTeamCall(tx, input({ providerUri: "https://api.cal.com/v2/bookings/uid-2", startsAt: new Date("2026-12-03T08:30:00.000Z"), endsAt: new Date("2026-12-03T09:00:00.000Z") })));
    const to = { fromProviderUri: URI, toProviderUri: "https://api.cal.com/v2/bookings/uid-2", startsAt: new Date("2026-12-03T08:30:00.000Z"), endsAt: new Date("2026-12-03T09:00:00.000Z"), now: NOW };
    expect(await moveTeamCallByUri(dbs.staff.db, to)).toBe(true);
    expect((await findTeamCall(dbs.staff.db, businessId, old.id))?.status).toBe("cancelled");
    expect((await findTeamCall(dbs.staff.db, businessId, next.id))?.status).toBe("booked");
  });

  describe("a new booking", () => {
    const created = (overrides: Partial<Parameters<typeof recordBookedCallFromWebhook>[1]> = {}): Parameters<typeof recordBookedCallFromWebhook>[1] => ({
      providerUri: URI,
      startsAt: STARTS,
      endsAt: ENDS,
      attendeeEmails: ["priya@example.com"],
      businessHint: null,
      purpose: null,
      reason: "billing",
      note: "About my invoice",
      ...overrides,
    });

    it("is recorded for the business of the person who booked, when the kickoff has been held", async () => {
      await heldKickoff();
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created())).toBe("recorded");
      const rows = await listTeamCalls(dbs.staff.db, businessId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source: "booking_page", reason: "billing", note: "About my invoice", providerUri: URI, status: "booked" });
    });

    it("is known already when the dashboard recorded it first, or when it is recorded twice", async () => {
      await heldKickoff();
      await asOwner((tx) => recordTeamCall(tx, input()));
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ purpose: "call" }))).toBe("known");
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ providerUri: "https://api.cal.com/v2/bookings/uid-9" }))).toBe("recorded");
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ providerUri: "https://api.cal.com/v2/bookings/uid-9" }))).toBe("known");
    });

    it("keeps the dashboard as the source when the dashboard made the booking", async () => {
      await heldKickoff();
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ purpose: "call", reason: "search", note: null }))).toBe("recorded");
      expect((await listTeamCalls(dbs.staff.db, businessId))[0]).toMatchObject({ source: "dashboard", reason: "search", note: null });
    });

    it("ignores the kickoff call's booking, and any booking before the kickoff has been held", async () => {
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created())).toBe("ignored");
      await heldKickoff();
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ purpose: "kickoff" }))).toBe("ignored");
      await dbs.staff.db.update(setupCallBookings).set({ inviteeUri: "https://api.cal.com/v2/bookings/uid-k" }).where(eq(setupCallBookings.businessId, businessId));
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ providerUri: "https://api.cal.com/v2/bookings/uid-k" }))).toBe("ignored");
      expect(await listTeamCalls(dbs.staff.db, businessId)).toEqual([]);
    });

    it("ignores a booking by someone who is not a customer, and one with no clear business", async () => {
      await heldKickoff();
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ attendeeEmails: ["stranger@example.com"] }))).toBe("ignored");
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ attendeeEmails: [] }))).toBe("ignored");
      await dbs.staff.db.insert(businessMembers).values({ businessId: otherBusinessId, userId: OWNER, role: "owner" });
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created())).toBe("ignored");
    });

    it("uses the business the booking names only when the person belongs to it", async () => {
      await heldKickoff();
      await dbs.staff.db.insert(businessMembers).values({ businessId: otherBusinessId, userId: OWNER, role: "owner" });
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ businessHint: businessId }))).toBe("recorded");
      expect(await recordBookedCallFromWebhook(dbs.staff.db, created({ providerUri: URI + "-b", businessHint: "01a0f71b-8402-7d48-a90a-207e8c8a882c" }))).toBe("ignored");
    });

    it("falls back to 'other' for a reason it does not know, and trims a long note", async () => {
      await heldKickoff();
      await recordBookedCallFromWebhook(dbs.staff.db, created({ reason: "kickoff", note: `  ${"x".repeat(600)}  ` }));
      const row = (await listTeamCalls(dbs.staff.db, businessId))[0];
      expect(row?.reason).toBe("other");
      expect(row?.note).toHaveLength(500);
    });
  });
});
