import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { privacyRequestOtps, privacyRequests, users } from "./schema";
import {
  claimPrivacyRequestOtpAttempt,
  closePrivacyRequest,
  createPrivacyRequestOtp,
  findPrivacyRequestOtp,
  listOpenPrivacyRequests,
  listPrivacyRequests,
  logPrivacyRequest,
  markPrivacyRequestsReminded,
  newPrivacyRequestReference,
  purgeExpiredPrivacyRequestOtps,
  receiveVerifiedPrivacyRequest,
  updatePrivacyRequest,
} from "./queries/privacy-requests";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "staff-asha";
const RECEIVED = new Date("2026-11-01T06:00:00.000Z");
const DUE = new Date("2026-12-01T06:00:00.000Z");
const NOW_FOR_REMINDERS = new Date("2026-11-20T10:00:00.000Z");
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: STAFF, name: "Asha", email: "asha@fynix.digital", emailVerified: true });
});

const INPUT = {
  kind: "access",
  channel: "email",
  subjectName: "Meera",
  subjectContact: "meera@example.com",
  details: "Please send me what you hold about me.",
  receivedAt: RECEIVED,
  dueAt: DUE,
} as const;

describe("the privacy request tracker", () => {
  it("logs a request as received, with a reference to quote, and lists open ones soonest due first then closed ones", async () => {
    const later = await logPrivacyRequest(dbs.staff.db, { ...INPUT, subjectContact: "later@example.com", dueAt: new Date("2026-12-10T00:00:00.000Z") });
    const sooner = await logPrivacyRequest(dbs.staff.db, INPUT);
    const done = await logPrivacyRequest(dbs.staff.db, { ...INPUT, subjectContact: "done@example.com" });
    await closePrivacyRequest(dbs.staff.db, done.id, { outcome: "fulfilled", resolution: "Sent the export.", closedAt: new Date("2026-11-05T00:00:00.000Z"), closedBy: STAFF });

    const rows = await listPrivacyRequests(dbs.staff.db);
    expect(rows.map((row) => row.id)).toEqual([sooner.id, later.id, done.id]);
    expect(sooner.reference).toMatch(/^PR-[2-9A-HJKMNP-Z]{8}$/);
    expect(rows[0]).toMatchObject({ status: "received", identityVerifiedAt: null, closedAt: null, outcome: null, handledBy: null, subjectContact: "meera@example.com" });
  });

  it("moves an open request on, and keeps an identity check once it is made", async () => {
    const { id } = await logPrivacyRequest(dbs.staff.db, INPUT);
    const first = new Date("2026-11-02T09:00:00.000Z");
    expect(await updatePrivacyRequest(dbs.staff.db, id, { status: "verifying", handledBy: STAFF })).toBe(true);
    expect(await updatePrivacyRequest(dbs.staff.db, id, { status: "in_progress", identityVerifiedAt: first })).toBe(true);
    await updatePrivacyRequest(dbs.staff.db, id, { identityVerifiedAt: new Date("2026-11-09T09:00:00.000Z") });
    const [row] = await listPrivacyRequests(dbs.staff.db);
    expect(row).toMatchObject({ status: "in_progress", handledBy: STAFF });
    expect(row?.identityVerifiedAt).toEqual(first);
  });

  it("closes a request once, and leaves a closed request closed", async () => {
    const { id } = await logPrivacyRequest(dbs.staff.db, INPUT);
    const closedAt = new Date("2026-11-20T10:00:00.000Z");
    expect(await closePrivacyRequest(dbs.staff.db, id, { outcome: "fulfilled", resolution: "Sent the export.", closedAt, closedBy: STAFF })).toBe(true);
    expect(await closePrivacyRequest(dbs.staff.db, id, { outcome: "refused", resolution: "Changed my mind.", closedAt: new Date("2026-12-30T00:00:00.000Z"), closedBy: STAFF })).toBe(false);
    expect(await updatePrivacyRequest(dbs.staff.db, id, { status: "received" })).toBe(false);
    const [row] = await listPrivacyRequests(dbs.staff.db);
    expect(row).toMatchObject({ status: "closed", outcome: "fulfilled", resolution: "Sent the export.", handledBy: STAFF });
    expect(row?.closedAt).toEqual(closedAt);
  });

  it("cannot be deleted by the staff role until three years after closing, so a request once received stays in the tracker", async () => {
    await logPrivacyRequest(dbs.staff.db, INPUT);
    // The retention run may delete closed requests past three years (migration 0162); this one is simply not matched.
    expect(await dbs.staff.db.delete(privacyRequests).returning({ id: privacyRequests.id })).toEqual([]);
    expect(await dbs.owner.db.select().from(privacyRequests)).toHaveLength(1);
  });

  it("is invisible to the customer's role and to the public form role", async () => {
    await logPrivacyRequest(dbs.staff.db, INPUT);
    expect(await captureErrorText(dbs.app.db.select().from(privacyRequests))).toContain("permission denied");
    expect(await captureErrorText(dbs.publicRole.db.select().from(privacyRequests))).toContain("permission denied");
  });

  it("refuses an unknown kind, an empty contact, a due date before receipt and a closed row with no outcome", async () => {
    expect(await captureErrorText(logPrivacyRequest(dbs.staff.db, { ...INPUT, kind: "sell" as never }))).toContain("privacy_requests_kind_check");
    expect(await captureErrorText(logPrivacyRequest(dbs.staff.db, { ...INPUT, subjectContact: "" }))).toContain("privacy_requests_contact_check");
    expect(await captureErrorText(logPrivacyRequest(dbs.staff.db, { ...INPUT, dueAt: new Date("2026-10-01T00:00:00.000Z") }))).toContain("privacy_requests_due_check");
    const { id } = await logPrivacyRequest(dbs.staff.db, INPUT);
    expect(await captureErrorText(dbs.owner.db.update(privacyRequests).set({ status: "closed" }))).toContain("privacy_requests_closed_check");
    expect(id).toBeTruthy();
  });

  it("gives every request its own reference, and refuses a repeat", async () => {
    expect(newPrivacyRequestReference()).not.toBe(newPrivacyRequestReference());
    const { id } = await logPrivacyRequest(dbs.staff.db, INPUT);
    const [stored] = await dbs.owner.db.select().from(privacyRequests);
    expect(stored?.id).toBe(id);
    expect(await captureErrorText(dbs.owner.db.insert(privacyRequests).values({ ...INPUT, reference: stored?.reference ?? "", subjectContact: "x@example.com" }))).toContain("privacy_requests_reference_idx");
  });
});

describe("the code that proves a public-form request", () => {
  const NOW = new Date("2026-11-01T06:00:00.000Z");
  const OTP_ID = "0198f2c0-0000-7000-8000-000000000001";
  const OTP = {
    id: OTP_ID,
    email: "meera@example.com",
    codeHash: "hash",
    payload: { kind: "erasure", name: "Meera", details: "Delete my account.", noticeVersion: "2026-10-13" },
    expiresAt: new Date(NOW.getTime() + 10 * 60 * 1000),
  } as const;
  const attempt = { otpId: OTP_ID, maxAttempts: 5, now: NOW };

  it("turns a confirmed code into a received request with the identity check stamped, and deletes the code", async () => {
    await createPrivacyRequestOtp(dbs.staff.db, OTP);
    expect(await claimPrivacyRequestOtpAttempt(dbs.staff.db, attempt)).toEqual({ attempts: 1 });
    const dueAt = new Date("2026-12-01T06:00:00.000Z");
    const received = await receiveVerifiedPrivacyRequest(dbs.staff.db, { ...attempt, dueAt });
    expect(received).toMatchObject({ dueAt });
    expect(received?.reference ?? "").toMatch(/^PR-/);

    const [row] = await listPrivacyRequests(dbs.staff.db);
    expect(row).toMatchObject({ kind: "erasure", channel: "web", subjectName: "Meera", subjectContact: "meera@example.com", status: "received", details: "Delete my account." });
    expect(row?.identityVerifiedAt).toEqual(NOW);
    expect(row?.receivedAt).toEqual(NOW);
    expect(await findPrivacyRequestOtp(dbs.staff.db, OTP_ID)).toBeNull();
  });

  it("creates nothing for a second confirm, an expired code or one past its tries", async () => {
    await createPrivacyRequestOtp(dbs.staff.db, OTP);
    const dueAt = new Date("2026-12-01T06:00:00.000Z");
    expect(await receiveVerifiedPrivacyRequest(dbs.staff.db, { ...attempt, dueAt })).not.toBeNull();
    expect(await receiveVerifiedPrivacyRequest(dbs.staff.db, { ...attempt, dueAt })).toBeNull();

    await createPrivacyRequestOtp(dbs.staff.db, { ...OTP, id: "0198f2c0-0000-7000-8000-000000000002" });
    const late = { otpId: "0198f2c0-0000-7000-8000-000000000002", maxAttempts: 5, now: new Date(NOW.getTime() + 11 * 60 * 1000), dueAt };
    expect(await receiveVerifiedPrivacyRequest(dbs.staff.db, late)).toBeNull();
    expect(await claimPrivacyRequestOtpAttempt(dbs.staff.db, late)).toBeNull();
    expect(await dbs.owner.db.select().from(privacyRequests)).toHaveLength(1);
  });

  it("gives out exactly the tries it has, and no more", async () => {
    await createPrivacyRequestOtp(dbs.staff.db, OTP);
    for (let n = 1; n <= 5; n += 1) expect(await claimPrivacyRequestOtpAttempt(dbs.staff.db, attempt)).toEqual({ attempts: n });
    expect(await claimPrivacyRequestOtpAttempt(dbs.staff.db, attempt)).toBeNull();
    expect(await receiveVerifiedPrivacyRequest(dbs.staff.db, { ...attempt, dueAt: NOW })).not.toBeNull();
  });

  it("purges codes an hour after they expire and keeps the rest", async () => {
    await createPrivacyRequestOtp(dbs.staff.db, OTP);
    await createPrivacyRequestOtp(dbs.staff.db, { ...OTP, id: "0198f2c0-0000-7000-8000-000000000003", expiresAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000) });
    expect(await purgeExpiredPrivacyRequestOtps(dbs.staff.db, NOW)).toBe(1);
    expect(await dbs.owner.db.select().from(privacyRequestOtps)).toHaveLength(1);
  });

  it("is invisible to the customer's role and to the public form role, and refuses a malformed address", async () => {
    await createPrivacyRequestOtp(dbs.staff.db, OTP);
    expect(await captureErrorText(dbs.app.db.select().from(privacyRequestOtps))).toContain("permission denied");
    expect(await captureErrorText(dbs.publicRole.db.select().from(privacyRequestOtps))).toContain("permission denied");
    expect(await captureErrorText(createPrivacyRequestOtp(dbs.staff.db, { ...OTP, id: "0198f2c0-0000-7000-8000-000000000004", email: "98765" }))).toContain("privacy_request_otps_email_check");
  });
});

describe("the reminder record", () => {
  it("lists only open requests, soonest due first, each starting at stage 0", async () => {
    const later = await logPrivacyRequest(dbs.staff.db, { ...INPUT, dueAt: new Date("2026-12-10T00:00:00.000Z") });
    const sooner = await logPrivacyRequest(dbs.staff.db, INPUT);
    const done = await logPrivacyRequest(dbs.staff.db, INPUT);
    await closePrivacyRequest(dbs.staff.db, done.id, { outcome: "refused", resolution: "Not ours.", closedAt: new Date("2026-11-05T00:00:00.000Z"), closedBy: STAFF });
    const open = await listOpenPrivacyRequests(dbs.staff.db);
    expect(open.map((row) => row.id)).toEqual([sooner.id, later.id]);
    expect(open.map((row) => row.reminderStage)).toEqual([0, 0]);
  });

  it("raises the stage, never lowers it, and leaves a closed request alone", async () => {
    const { id } = await logPrivacyRequest(dbs.staff.db, INPUT);
    expect(await markPrivacyRequestsReminded(dbs.staff.db, [{ id, stage: 2 }])).toBe(1);
    expect(await markPrivacyRequestsReminded(dbs.staff.db, [{ id, stage: 1 }])).toBe(0);
    expect(await markPrivacyRequestsReminded(dbs.staff.db, [{ id, stage: 2 }])).toBe(0);
    expect((await listOpenPrivacyRequests(dbs.staff.db))[0]?.reminderStage).toBe(2);
    await closePrivacyRequest(dbs.staff.db, id, { outcome: "fulfilled", resolution: "Done.", closedAt: NOW_FOR_REMINDERS, closedBy: STAFF });
    expect(await markPrivacyRequestsReminded(dbs.staff.db, [{ id, stage: 3 }])).toBe(0);
  });

  it("refuses a stage outside 0 to 3", async () => {
    await logPrivacyRequest(dbs.staff.db, INPUT);
    expect(await captureErrorText(dbs.owner.db.update(privacyRequests).set({ reminderStage: 4 }))).toContain("privacy_requests_reminder_stage_check");
  });
});
