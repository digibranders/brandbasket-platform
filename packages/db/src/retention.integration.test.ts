import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { countExpiredRetention, purgeExpiredRetention } from "./queries/retention";
import { erasedUserEmail } from "./queries/account-erasure";
import {
  ACCOUNT_EXIT_REASONS,
  accountExitFeedback,
  accountOtps,
  breachRegister,
  consentRecords,
  directoryEnquiries,
  directoryReviewComments,
  directoryReviews,
  directoryVisitors,
  leads,
  privacyRequests,
  rateLimitBuckets,
  sessions,
  setupInvites,
  staffAccessLog,
  staffMembers,
  users,
  verifications,
} from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const NOW = new Date("2026-10-12T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const ahead = (ms: number): Date => new Date(NOW.getTime() + ms);
/** `months` calendar months before NOW, plus or minus a day, so each fixture sits clearly on one side of its line. */
const monthsAgo = (months: number, dayOffset: number): Date => {
  const at = new Date(NOW);
  at.setUTCMonth(at.getUTCMonth() - months);
  return new Date(at.getTime() + dayOffset * DAY);
};
const NOTHING_SCHEDULED = { leads: 0, enquiries: 0, visitors: 0, exitFeedback: 0, privacyRequests: 0, breachRecords: 0, staffAccessLog: 0, consentRecords: 0 };

let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: "user-1", name: "Asha", email: "asha@example.com" });
  await dbs.owner.db.insert(sessions).values([
    { id: "s-live", token: "t1", userId: "user-1", expiresAt: ahead(DAY) },
    { id: "s-just-over", token: "t2", userId: "user-1", expiresAt: ago(60 * 60 * 1000) },
    { id: "s-long-over", token: "t3", userId: "user-1", expiresAt: ago(10 * DAY) },
  ]);
  await dbs.owner.db.insert(verifications).values([
    { id: "v-live", identifier: "reset:a", value: "x", expiresAt: ahead(DAY) },
    { id: "v-long-over", identifier: "reset:b", value: "x", expiresAt: ago(10 * DAY) },
  ]);
  await dbs.owner.db.insert(rateLimitBuckets).values([
    { key: "lead:phone:+919820011223", windowStart: ago(60 * 60 * 1000), count: 2 },
    { key: "lead:phone:+919820011223", windowStart: ago(5 * DAY), count: 3 },
    { key: "dir-review-otp:ip:203.0.113.9", windowStart: ago(30 * DAY), count: 1 },
  ]);
  await dbs.owner.db.insert(accountOtps).values([
    { id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b", purpose: "signup", phone: "+919820011223", codeHash: "h", expiresAt: ago(3 * 60 * 60 * 1000) },
    { id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c", purpose: "signup", phone: "+919820011224", codeHash: "h", expiresAt: ahead(60 * 1000) },
  ]);
});

describe("the technical-expiry purge", () => {
  it("counts what it would remove without touching anything", async () => {
    const counts = await countExpiredRetention(dbs.staff.db, NOW);
    expect(counts).toEqual({ sessions: 1, verifications: 1, rateLimitBuckets: 2, accountOtps: 1, ...NOTHING_SCHEDULED });
    expect(await dbs.owner.db.select().from(sessions)).toHaveLength(3);
    expect(await dbs.owner.db.select().from(rateLimitBuckets)).toHaveLength(3);
  });

  it("removes sessions and verifications a day past their end, windows over two days old, and codes an hour past theirs", async () => {
    const counts = await purgeExpiredRetention(dbs.staff.db, NOW);
    expect(counts).toEqual({ sessions: 1, verifications: 1, rateLimitBuckets: 2, accountOtps: 1, ...NOTHING_SCHEDULED });
    expect((await dbs.owner.db.select({ id: sessions.id }).from(sessions)).map((row) => row.id).sort()).toEqual(["s-just-over", "s-live"]);
    expect((await dbs.owner.db.select({ id: verifications.id }).from(verifications)).map((row) => row.id)).toEqual(["v-live"]);
    const buckets = await dbs.owner.db.select().from(rateLimitBuckets);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.count).toBe(2);
    expect(await dbs.owner.db.select().from(accountOtps)).toHaveLength(1);
  });

  it("finds nothing the second time", async () => {
    await purgeExpiredRetention(dbs.staff.db, NOW);
    expect(await purgeExpiredRetention(dbs.staff.db, NOW)).toEqual({ sessions: 0, verifications: 0, rateLimitBuckets: 0, accountOtps: 0, ...NOTHING_SCHEDULED });
  });
});

describe("the approved retention schedule (M1 in docs/privacy/PRIVACY-PLAN.md)", () => {
  const OLD_LEAD = "0199a1b2-0000-7000-8000-000000000001";
  const FRESH_LEAD = "0199a1b2-0000-7000-8000-000000000002";
  const CUSTOMER_LEAD = "0199a1b2-0000-7000-8000-000000000003";
  const QUIET = "+919820000001";
  const POSTED = "+919820000002";
  const ACTIVE = "+919820000003";
  const ids = async <T extends { id: string }>(rows: Promise<T[]>): Promise<string[]> => (await rows).map((row) => row.id).sort();

  beforeEach(async () => {
    const db = dbs.owner.db;
    await db.insert(leads).values([
      // Quiet for over a year and never a customer: goes, with the invite sent to it.
      { id: OLD_LEAD, name: "Old", businessName: "Old Co", email: "old@example.com", phone: "+919820011001", status: "lost", createdAt: monthsAgo(14, 0), updatedAt: monthsAgo(12, -1) },
      { id: FRESH_LEAD, name: "Fresh", businessName: "Fresh Co", email: "fresh@example.com", phone: "+919820011002", status: "call_done", createdAt: monthsAgo(14, 0), updatedAt: monthsAgo(12, 1) },
      // A lead that became a customer is part of the account, which has its own erasure.
      { id: CUSTOMER_LEAD, name: "Paid", businessName: "Paid Co", email: "paid@example.com", phone: "+919820011003", status: "paid", createdAt: monthsAgo(30, 0), updatedAt: monthsAgo(30, 0) },
    ]);
    await db.insert(staffMembers).values({ userId: "user-1" });
    await db.insert(setupInvites).values({ createdByStaffId: "user-1", leadId: OLD_LEAD, email: "old@example.com", businessName: "Old Co", tokenHash: "invite-old", expiresAt: monthsAgo(13, 0) });

    const enquiry = { kind: "business" as const, listingKey: "dentists/thane/naupada/smile-dental", businessName: "Smile Dental", serviceLabel: "Dentists", areaLabel: "Naupada", name: "Ravi", phone: "+919820011004" };
    await db.insert(directoryEnquiries).values([
      { ...enquiry, message: "old", createdAt: monthsAgo(12, -1) },
      { ...enquiry, message: "fresh", createdAt: monthsAgo(12, 1) },
    ]);

    await db.insert(directoryVisitors).values([
      { phone: QUIET, name: "Quiet", lastSeenAt: monthsAgo(12, -1) },
      { phone: POSTED, name: "Posted", lastSeenAt: monthsAgo(24, 0) },
      { phone: ACTIVE, name: "Active", lastSeenAt: monthsAgo(12, 1) },
    ]);
    // A live post keeps its author's account, however long ago they were last seen.
    await db.insert(directoryReviews).values({ listingKey: "dentists/thane/naupada/smile-dental", businessName: "Smile Dental", reviewerName: "Posted", phone: POSTED, rating: 4, highlights: [] });

    await db.insert(accountExitFeedback).values([
      { reason: ACCOUNT_EXIT_REASONS[0], outcome: "deleted", comment: "old", createdAt: monthsAgo(12, -1) },
      { reason: ACCOUNT_EXIT_REASONS[0], outcome: "deleted", comment: "fresh", createdAt: monthsAgo(12, 1) },
    ]);

    const request = { kind: "access", channel: "email", subjectName: "Meera", subjectContact: "meera@example.com", receivedAt: monthsAgo(40, 0), dueAt: monthsAgo(39, 0) };
    await db.insert(privacyRequests).values([
      { ...request, reference: "PR-OLD", status: "closed", outcome: "fulfilled", closedAt: monthsAgo(36, -1) },
      { ...request, reference: "PR-FRESH", status: "closed", outcome: "fulfilled", closedAt: monthsAgo(36, 1) },
      // Still open after three years: never removed while it is open.
      { ...request, reference: "PR-OPEN", status: "in_progress" },
    ]);

    await db.insert(breachRegister).values([
      { recordedBy: "user-1", summary: "old", detectedAt: monthsAgo(70, 0), status: "closed", updatedAt: monthsAgo(60, -1) },
      { recordedBy: "user-1", summary: "fresh", detectedAt: monthsAgo(70, 0), status: "closed", updatedAt: monthsAgo(60, 1) },
      { recordedBy: "user-1", summary: "open", detectedAt: monthsAgo(70, 0), status: "open", updatedAt: monthsAgo(60, -1) },
    ]);

    await db.insert(staffAccessLog).values([
      { staffUserId: "user-1", action: "open_account", createdAt: ago(401 * DAY) },
      { staffUserId: "user-1", action: "open_account", createdAt: ago(399 * DAY) },
    ]);
  });

  it("counts what it would remove without touching anything", async () => {
    const counts = await countExpiredRetention(dbs.staff.db, NOW);
    expect(counts).toMatchObject({ leads: 1, enquiries: 1, visitors: 1, exitFeedback: 1, privacyRequests: 1, breachRecords: 1, staffAccessLog: 1 });
    expect(await dbs.owner.db.select().from(leads)).toHaveLength(3);
  });

  it("removes unconverted leads quiet for 12 months, with their invites, and keeps customers' leads", async () => {
    expect(await purgeExpiredRetention(dbs.staff.db, NOW)).toMatchObject({ leads: 1 });
    expect(await ids(dbs.owner.db.select({ id: leads.id }).from(leads))).toEqual([FRESH_LEAD, CUSTOMER_LEAD].sort());
    expect(await dbs.owner.db.select().from(setupInvites)).toHaveLength(0);
  });

  it("removes enquiries and exit feedback after 12 months", async () => {
    await purgeExpiredRetention(dbs.staff.db, NOW);
    expect((await dbs.owner.db.select({ message: directoryEnquiries.message }).from(directoryEnquiries)).map((row) => row.message)).toEqual(["fresh"]);
    expect((await dbs.owner.db.select({ comment: accountExitFeedback.comment }).from(accountExitFeedback)).map((row) => row.comment)).toEqual(["fresh"]);
  });

  it("removes a visitor account after 12 months unseen only when it has no review or comment left", async () => {
    await dbs.owner.db.insert(directoryVisitors).values({ phone: "+919820000004", name: "Commenter", lastSeenAt: monthsAgo(20, 0) });
    const [review] = await dbs.owner.db.select({ id: directoryReviews.id }).from(directoryReviews);
    await dbs.owner.db.insert(directoryReviewComments).values({ reviewId: review?.id ?? "", commenterName: "Commenter", phone: "+919820000004", text: "Agreed." });
    expect(await purgeExpiredRetention(dbs.staff.db, NOW)).toMatchObject({ visitors: 1 });
    expect((await dbs.owner.db.select({ phone: directoryVisitors.phone }).from(directoryVisitors)).map((row) => row.phone).sort()).toEqual([POSTED, ACTIVE, "+919820000004"].sort());
  });

  it("removes closed privacy requests after 3 years and closed breach records after 5, never open ones", async () => {
    expect(await purgeExpiredRetention(dbs.staff.db, NOW)).toMatchObject({ privacyRequests: 1, breachRecords: 1 });
    expect((await dbs.owner.db.select({ reference: privacyRequests.reference }).from(privacyRequests)).map((row) => row.reference).sort()).toEqual(["PR-FRESH", "PR-OPEN"]);
    expect((await dbs.owner.db.select({ summary: breachRegister.summary }).from(breachRegister)).map((row) => row.summary).sort()).toEqual(["fresh", "open"]);
  });

  it("removes staff access log rows after 400 days", async () => {
    expect(await purgeExpiredRetention(dbs.staff.db, NOW)).toMatchObject({ staffAccessLog: 1 });
    expect(await dbs.owner.db.select().from(staffAccessLog)).toHaveLength(1);
  });

  it("lets the staff role delete none of those records before its time, whatever it asks for", async () => {
    // The database checks against its own clock, so these rows are stamped with the real time, not the fixed NOW.
    const justNow = new Date();
    const db = dbs.owner.db;
    await db.insert(staffAccessLog).values({ staffUserId: "user-1", action: "recent", createdAt: justNow });
    await db.insert(privacyRequests).values({ reference: "PR-RECENT", kind: "access", channel: "email", subjectName: "Meera", subjectContact: "m@example.com", receivedAt: justNow, dueAt: justNow, status: "closed", outcome: "fulfilled", closedAt: justNow });
    await db.insert(breachRegister).values({ recordedBy: "user-1", summary: "recent", detectedAt: justNow, status: "closed", updatedAt: justNow });
    await db.insert(consentRecords).values({ subjectType: "lead", subjectRef: "gone", purpose: "lead_contact", noticeVersion: "2026-10-13.4", channel: "website", subjectErasedAt: justNow });

    await dbs.staff.db.delete(staffAccessLog);
    await dbs.staff.db.delete(privacyRequests);
    await dbs.staff.db.delete(breachRegister);
    await dbs.staff.db.delete(consentRecords);

    expect((await db.select({ action: staffAccessLog.action }).from(staffAccessLog)).map((row) => row.action)).toContain("recent");
    expect((await db.select({ reference: privacyRequests.reference }).from(privacyRequests)).map((row) => row.reference)).toEqual(expect.arrayContaining(["PR-RECENT", "PR-OPEN"]));
    expect((await db.select({ summary: breachRegister.summary }).from(breachRegister)).map((row) => row.summary)).toEqual(expect.arrayContaining(["recent", "open"]));
    expect(await db.select().from(consentRecords)).toHaveLength(1);
  });

  it("marks consent records once the data they cover is gone, and removes them 3 years after that", async () => {
    const consent = { purpose: "lead_contact", noticeVersion: "2026-10-13.4", channel: "website" };
    await dbs.owner.db.insert(consentRecords).values([
      { ...consent, subjectType: "lead", subjectRef: FRESH_LEAD },
      { ...consent, subjectType: "lead", subjectRef: OLD_LEAD },
      { ...consent, subjectType: "user", subjectRef: "user-1" },
      { ...consent, subjectType: "lead", subjectRef: "0199a1b2-0000-7000-8000-0000000000aa", subjectErasedAt: monthsAgo(36, -1) },
      { ...consent, subjectType: "lead", subjectRef: "0199a1b2-0000-7000-8000-0000000000bb", subjectErasedAt: monthsAgo(36, 1) },
    ]);
    expect(await purgeExpiredRetention(dbs.staff.db, NOW)).toMatchObject({ consentRecords: 1 });
    const markedRefs = async (): Promise<string[]> =>
      (await dbs.owner.db.select({ ref: consentRecords.subjectRef, erasedAt: consentRecords.subjectErasedAt }).from(consentRecords))
        .filter((row) => row.erasedAt !== null)
        .map((row) => row.ref)
        .sort();
    expect(await dbs.owner.db.select().from(consentRecords)).toHaveLength(4);
    // The old lead went in this same run, so its record is marked; the live lead and the user are not.
    expect(await markedRefs()).toEqual([OLD_LEAD, "0199a1b2-0000-7000-8000-0000000000bb"].sort());

    // An erased account counts as gone.
    await dbs.owner.db.update(users).set({ email: erasedUserEmail("user-1") });
    await purgeExpiredRetention(dbs.staff.db, NOW);
    expect(await markedRefs()).toEqual([OLD_LEAD, "0199a1b2-0000-7000-8000-0000000000bb", "user-1"].sort());
  });

  it("finds nothing the second time", async () => {
    await purgeExpiredRetention(dbs.staff.db, NOW);
    expect(await countExpiredRetention(dbs.staff.db, NOW)).toMatchObject(NOTHING_SCHEDULED);
  });
});
