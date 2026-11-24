import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearKickoffPromptState,
  clearKickoffPromptStateForBusiness,
  isKickoffPromptDue,
  KICKOFF_PROMPT_REPEAT_MS,
  listKickoffsStartingSoon,
  listPendingKickoffPrompts,
  markKickoffFirstNotified,
  markKickoffPromptAnswered,
  markKickoffPromptsShown,
  markKickoffReminderPushed,
} from "./queries/kickoff-prompts";
import { moveSetupCallBooking, recordSetupCallBooking } from "./queries/setup-calls";
import { businesses, kickoffPromptState, setupCallBookings, users } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-11-17T09:00:00.000Z");
const STAFF = "staff-a";
const minutes = (count: number): Date => new Date(NOW.getTime() + count * 60_000);

let dbs: TestDatabases;
let one = "";
let two = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff-a@example.com", emailVerified: true });
  const rows = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "one", name: "One Cafe", currency: "INR" },
      { slug: "two", name: "Two Cafe", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  one = rows.find((row) => row.slug === "one")?.id ?? "";
  two = rows.find((row) => row.slug === "two")?.id ?? "";
});

async function book(businessId: string, startsAt: Date, endsAt: Date, heldAt: Date | null = null): Promise<string> {
  const [row] = await dbs.staff.db.insert(setupCallBookings).values({ businessId, startsAt, endsAt, heldAt, heldByStaffId: heldAt === null ? null : STAFF }).returning({ id: setupCallBookings.id });
  return row?.id ?? "";
}

const stateOf = async (callId: string) => (await dbs.staff.db.select().from(kickoffPromptState).where(eq(kickoffPromptState.callId, callId)))[0];

describe("pending kickoff prompts", () => {
  it("lists every call that has ended and is not marked held, oldest first, with its state", async () => {
    const first = await book(one, minutes(-120), minutes(-90));
    const second = await book(two, minutes(-40), minutes(-10));
    const [three] = await dbs.staff.db.insert(businesses).values({ slug: "three", name: "Three", currency: "INR" }).returning({ id: businesses.id });
    await book(three?.id ?? "", minutes(10), minutes(40));
    const rows = await listPendingKickoffPrompts(dbs.staff.db, { now: NOW, lookBackDays: 14 });
    expect(rows.map((row) => [row.callId, row.businessName, row.lastPopupShownAt])).toEqual([
      [first, "One Cafe", null],
      [second, "Two Cafe", null],
    ]);
  });

  it("leaves out a held call, an answered call and a call older than the look-back window", async () => {
    await book(one, minutes(-120), minutes(-90), minutes(-60));
    const answered = await book(two, minutes(-40), minutes(-10));
    await markKickoffPromptAnswered(dbs.staff.db, two, NOW);
    expect(await stateOf(answered)).toMatchObject({ answeredAt: NOW });
    expect(await listPendingKickoffPrompts(dbs.staff.db, { now: NOW, lookBackDays: 14 })).toEqual([]);
    const [old] = await dbs.staff.db.insert(businesses).values({ slug: "old", name: "Old", currency: "INR" }).returning({ id: businesses.id });
    await book(old?.id ?? "", minutes(-20 * 24 * 60), minutes(-20 * 24 * 60 + 30));
    expect(await listPendingKickoffPrompts(dbs.staff.db, { now: NOW, lookBackDays: 14 })).toEqual([]);
  });

  it("records that the popup was shown, and says it is due again only after 15 minutes", async () => {
    const callId = await book(one, minutes(-40), minutes(-10));
    expect(isKickoffPromptDue({ answeredAt: null, lastPopupShownAt: null }, NOW)).toBe(true);
    await markKickoffPromptsShown(dbs.staff.db, [callId], NOW);
    const [row] = await listPendingKickoffPrompts(dbs.staff.db, { now: NOW, lookBackDays: 14 });
    expect(row?.lastPopupShownAt).toEqual(NOW);
    expect(isKickoffPromptDue(row ?? { answeredAt: null, lastPopupShownAt: null }, minutes(14))).toBe(false);
    expect(isKickoffPromptDue(row ?? { answeredAt: null, lastPopupShownAt: null }, new Date(NOW.getTime() + KICKOFF_PROMPT_REPEAT_MS))).toBe(true);
  });

  it("keeps the first-notified and reminder marks once set", async () => {
    const callId = await book(one, minutes(-200), minutes(-170));
    await markKickoffFirstNotified(dbs.staff.db, callId, NOW);
    await markKickoffFirstNotified(dbs.staff.db, callId, minutes(5));
    await markKickoffReminderPushed(dbs.staff.db, callId, minutes(6));
    expect(await stateOf(callId)).toMatchObject({ firstNotifiedAt: NOW, reminderPushedAt: minutes(6) });
  });
});

describe("calls starting soon", () => {
  it("lists a call starting within the hour, not one already over, held or far ahead", async () => {
    const soon = await book(one, minutes(45), minutes(75));
    await book(two, minutes(61), minutes(91));
    const [held] = await dbs.staff.db.insert(businesses).values({ slug: "held", name: "Held", currency: "INR" }).returning({ id: businesses.id });
    await book(held?.id ?? "", minutes(20), minutes(50), minutes(-5));
    const rows = await listKickoffsStartingSoon(dbs.staff.db, { now: NOW, withinMs: 3_600_000 });
    expect(rows.map((row) => row.callId)).toEqual([soon]);
  });
});

describe("prompt state when the time moves", () => {
  it("is cleared for the business when the customer books a new time", async () => {
    const callId = await book(one, minutes(-40), minutes(-10));
    await markKickoffFirstNotified(dbs.staff.db, callId, NOW);
    await recordSetupCallBooking(dbs.staff.db, { businessId: one, inviteeUri: null, now: NOW, startsAt: minutes(300), endsAt: minutes(330) });
    await clearKickoffPromptStateForBusiness(dbs.staff.db, one);
    expect(await stateOf(callId)).toBeUndefined();
  });

  it("is cleared when the booking service moves the call", async () => {
    const callId = await book(one, minutes(-40), minutes(-10));
    await dbs.staff.db.update(setupCallBookings).set({ inviteeUri: "https://api.cal.com/v2/bookings/a" }).where(eq(setupCallBookings.id, callId));
    await markKickoffFirstNotified(dbs.staff.db, callId, NOW);
    const moved = await moveSetupCallBooking(dbs.staff.db, { fromInviteeUri: "https://api.cal.com/v2/bookings/a", toInviteeUri: "https://api.cal.com/v2/bookings/b", startsAt: minutes(300), endsAt: minutes(330), now: NOW });
    expect(moved).toBe(true);
    expect(await stateOf(callId)).toBeUndefined();
  });

  it("clearKickoffPromptState on a call with no state does nothing", async () => {
    const callId = await book(one, minutes(-40), minutes(-10));
    await expect(clearKickoffPromptState(dbs.staff.db, callId)).resolves.toBeUndefined();
  });
});
