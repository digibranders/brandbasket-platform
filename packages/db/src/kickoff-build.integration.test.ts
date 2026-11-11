import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, insertSubscription } from "./queries/billing";
import { firstPreviewDueAfterKickoff, KICKOFF_FALLBACK_START_HOURS, listKickoffBoard, listKickoffsToStart, markProjectReadyAfterKickoff } from "./queries/kickoff-build";
import { recordKickoffOutcome } from "./queries/setup-call-outcomes";
import { clearUnheldKickoffBooking } from "./queries/setup-calls";
import { insertOnboardingProject } from "./queries/projects";
import { bundledAddOns, businesses, projects, setupCallBookings, users } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF = "staff-a";
const NOW = new Date("2026-10-30T12:00:00.000Z");
const ENDED = new Date("2026-10-30T09:00:00.000Z");
const DUE = new Date("2026-11-01T09:00:00.000Z");

let dbs: TestDatabases;
let siteId = "";
let socialId = "";
let subscriptionOf: Record<string, string> = {};

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

async function business(slug: string, services: readonly string[]): Promise<string> {
  const [row] = await dbs.staff.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  const id = row?.id ?? "";
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No INR plan seeded");
  const subscription = await insertSubscription(dbs.staff.db, { businessId: id, planId: plan.id, provider: "fake", providerSubscriptionId: `fake_sub_${slug}` });
  subscriptionOf[id] = subscription.id;
  for (const addOn of services) {
    await dbs.staff.db.insert(bundledAddOns).values({ businessId: id, subscriptionId: subscription.id, addOn, listAmountCents: 299_900, netAmountCents: 299_900, taxRateBasisPoints: 1_800, status: "active" });
  }
  await dbs.staff.db.transaction((tx) => insertOnboardingProject(tx, id));
  return id;
}

const statusOf = async (businessId: string) => (await dbs.staff.db.select().from(projects).where(eq(projects.businessId, businessId)))[0];

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: STAFF, name: "Staff", email: `${STAFF}@example.com`, emailVerified: true });
  subscriptionOf = {};
  siteId = await business("site-business", ["managed-website", "social-media"]);
  socialId = await business("social-business", ["social-media"]);
});

describe("markProjectReadyAfterKickoff", () => {
  it("moves a Website Management project from onboarding to submitted with the preview date, and leaves the checklist stamp null", async () => {
    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: siteId, dueAt: DUE, now: NOW })).toBe(true);
    const project = await statusOf(siteId);
    expect(project).toMatchObject({ status: "submitted", onboardingSubmittedAt: null });
    expect(project?.slaDueAt?.toISOString()).toBe(DUE.toISOString());
  });

  it("is recorded in the project's history by the database", async () => {
    await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: siteId, dueAt: DUE, now: NOW });
    const events = await dbs.owner.db.execute(`select status from project_events where business_id = '${siteId}' order by occurred_at`);
    expect((events.rows as { status: string }[]).map((row) => row.status)).toContain("submitted");
  });

  it("does nothing the second time, and does not move the date", async () => {
    await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: siteId, dueAt: DUE, now: NOW });
    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: siteId, dueAt: new Date("2026-12-01T00:00:00Z"), now: NOW })).toBe(false);
    expect((await statusOf(siteId))?.slaDueAt?.toISOString()).toBe(DUE.toISOString());
  });

  it("leaves a business without Website Management alone", async () => {
    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: socialId, dueAt: DUE, now: NOW })).toBe(false);
    expect((await statusOf(socialId))?.status).toBe("onboarding");
  });

  it("leaves a project that has already moved on alone", async () => {
    await dbs.staff.db.update(projects).set({ status: "building" }).where(eq(projects.businessId, siteId));
    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: siteId, dueAt: DUE, now: NOW })).toBe(false);
    expect((await statusOf(siteId))?.status).toBe("building");
  });

  it("does not count a Website Management line that is no longer active", async () => {
    await dbs.staff.db.update(bundledAddOns).set({ status: "removed" }).where(eq(bundledAddOns.businessId, siteId));
    expect(await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: siteId, dueAt: DUE, now: NOW })).toBe(false);
  });
});

describe("listKickoffsToStart", () => {
  const booking = (businessId: string, values: Partial<typeof setupCallBookings.$inferInsert>) => dbs.staff.db.insert(setupCallBookings).values({ businessId, ...values });

  it("lists a call that ended before the cut-off, and one staff marked held, and not one still ahead or already started", async () => {
    await booking(siteId, { startsAt: new Date("2026-10-30T08:30:00Z"), endsAt: ENDED });
    expect((await listKickoffsToStart(dbs.staff.db, { endedBefore: NOW })).map((row) => row.businessId)).toEqual([siteId]);
    expect(await listKickoffsToStart(dbs.staff.db, { endedBefore: new Date("2026-10-30T08:00:00Z") })).toEqual([]);

    await dbs.staff.db.delete(setupCallBookings);
    await booking(siteId, { heldAt: NOW, heldByStaffId: STAFF });
    expect((await listKickoffsToStart(dbs.staff.db, { endedBefore: new Date("2026-10-01T00:00:00Z") })).map((row) => row.businessId)).toEqual([siteId]);

    await markProjectReadyAfterKickoff(dbs.staff.db, { businessId: siteId, dueAt: DUE, now: NOW });
    expect(await listKickoffsToStart(dbs.staff.db, { endedBefore: NOW })).toEqual([]);
  });

  it("with confirmedOnly, lists only the calls staff marked held, and the default still lists an ended call", async () => {
    await booking(siteId, { startsAt: new Date("2026-10-30T08:30:00Z"), endsAt: ENDED });
    await booking(socialId, { startsAt: new Date("2026-10-30T10:30:00Z"), endsAt: new Date("2026-10-30T11:00:00Z"), heldAt: NOW, heldByStaffId: STAFF });

    const everything = await listKickoffsToStart(dbs.staff.db, { endedBefore: NOW });
    expect(everything.map((row) => row.businessId).sort()).toEqual([siteId, socialId].sort());
    expect((await listKickoffsToStart(dbs.staff.db, { endedBefore: NOW, confirmedOnly: false })).map((row) => row.businessId).sort()).toEqual([siteId, socialId].sort());

    expect((await listKickoffsToStart(dbs.staff.db, { endedBefore: NOW, confirmedOnly: true })).map((row) => row.businessId)).toEqual([socialId]);
  });

  it("with confirmedOnly, ignores an ended call that staff have not marked held, even long after it ended", async () => {
    await booking(siteId, { startsAt: new Date("2026-10-01T08:30:00Z"), endsAt: new Date("2026-10-01T09:00:00Z") });
    expect(await listKickoffsToStart(dbs.staff.db, { endedBefore: NOW, confirmedOnly: true })).toEqual([]);
    expect((await listKickoffsToStart(dbs.staff.db, { endedBefore: NOW })).map((row) => row.businessId)).toEqual([siteId]);
  });
});

describe("which kickoffs the sweep starts (the cut-off it passes is KICKOFF_FALLBACK_START_HOURS before now)", () => {
  const HOUR = 3_600_000;
  const cutoff = (now: Date) => new Date(now.getTime() - KICKOFF_FALLBACK_START_HOURS * HOUR);
  const endedHoursAgo = (hours: number) => ({ startsAt: new Date(NOW.getTime() - (hours + 0.5) * HOUR), endsAt: new Date(NOW.getTime() - hours * HOUR) });
  const startable = async (now: Date = NOW) => (await listKickoffsToStart(dbs.staff.db, { endedBefore: cutoff(now) })).map((row) => row.businessId);
  const booking = (businessId: string, values: Partial<typeof setupCallBookings.$inferInsert>) => dbs.staff.db.insert(setupCallBookings).values({ businessId, ...values });

  it("starts a call staff marked held, even one that ended a minute ago", async () => {
    await booking(siteId, { ...endedHoursAgo(0.02), heldAt: NOW, heldByStaffId: STAFF });
    expect(await startable()).toEqual([siteId]);
  });

  it("does not start an unmarked call before 24 hours have passed since it ended", async () => {
    await booking(siteId, endedHoursAgo(23));
    expect(await startable()).toEqual([]);
  });

  it("starts an unmarked call once 24 hours have passed since it ended", async () => {
    await booking(siteId, endedHoursAgo(25));
    expect(await startable()).toEqual([siteId]);
  });

  it("never starts a call staff marked as not attended, however long ago it ended", async () => {
    const { startsAt, endsAt } = endedHoursAgo(30);
    await booking(siteId, { startsAt, endsAt });
    expect(await startable()).toEqual([siteId]);

    // What the wrap-up's "did not attend" buttons do: the booking goes and the outcome keeps the call's times.
    expect(await clearUnheldKickoffBooking(dbs.staff.db, siteId)).toBe(true);
    await recordKickoffOutcome(dbs.staff.db, { businessId: siteId, outcome: "customer_no_show", note: null, startsAt, endsAt, staffId: STAFF, now: NOW });

    expect(await startable()).toEqual([]);
    expect(await startable(new Date(NOW.getTime() + 365 * 24 * HOUR))).toEqual([]);
    expect((await statusOf(siteId))?.status).toBe("onboarding");
  });

  it("follows the new call after a no-show by the same rule", async () => {
    await booking(siteId, endedHoursAgo(30));
    await clearUnheldKickoffBooking(dbs.staff.db, siteId);
    await recordKickoffOutcome(dbs.staff.db, { businessId: siteId, outcome: "team_no_show", note: null, startsAt: null, endsAt: null, staffId: STAFF, now: NOW });
    await booking(siteId, endedHoursAgo(2));
    expect(await startable()).toEqual([]);
    expect(await startable(new Date(NOW.getTime() + 23 * HOUR))).toEqual([siteId]);
  });
});

describe("firstPreviewDueAfterKickoff", () => {
  it("is 48 hours after the call was held, else after it ended", () => {
    expect(firstPreviewDueAfterKickoff({ endsAt: ENDED, heldAt: null, now: NOW }).toISOString()).toBe(DUE.toISOString());
    expect(firstPreviewDueAfterKickoff({ endsAt: ENDED, heldAt: new Date("2026-10-30T10:00:00Z"), now: NOW }).toISOString()).toBe("2026-11-01T10:00:00.000Z");
  });

  it("never promises a date already past: a late start is due a day from now", () => {
    expect(firstPreviewDueAfterKickoff({ endsAt: new Date("2026-10-20T09:00:00Z"), heldAt: null, now: NOW }).toISOString()).toBe("2026-10-31T12:00:00.000Z");
  });

  it("counts from now when it has no time at all", () => {
    expect(firstPreviewDueAfterKickoff({ endsAt: null, heldAt: null, now: NOW }).toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });
});

describe("listKickoffBoard", () => {
  it("lists recent and coming kickoffs with the business, its project and what it pays for, newest first, and not an old one", async () => {
    await dbs.staff.db.insert(setupCallBookings).values([
      { businessId: siteId, startsAt: new Date("2026-10-30T08:30:00Z"), endsAt: ENDED },
      { businessId: socialId, startsAt: new Date("2026-09-01T08:30:00Z"), endsAt: new Date("2026-09-01T09:00:00Z") },
    ]);
    const board = await listKickoffBoard(dbs.staff.db, { now: NOW, lookBackDays: 7 });
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ businessId: siteId, businessName: "site-business", projectStatus: "onboarding", hasWebsite: true, services: ["managed-website", "social-media"], heldAt: null });
    expect(board[0]?.endsAt?.toISOString()).toBe(ENDED.toISOString());
  });
});
