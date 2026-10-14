import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listConsents, recordConsent, withdrawConsent } from "./queries/consent-records";
import { consentRecords } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const SUBJECT = { type: "user", ref: "user-owner-1" } as const;
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
});

describe("consent records", () => {
  it("keeps what a person agreed to, with the notice version they saw", async () => {
    await recordConsent(dbs.staff.db, { subject: SUBJECT, purpose: "account_terms", noticeVersion: "pre-dpdp", channel: "web", ipHash: "abc123" });

    const rows = await listConsents(dbs.staff.db, SUBJECT);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ purpose: "account_terms", event: "given", noticeVersion: "pre-dpdp", language: "en", channel: "web", ipHash: "abc123" });
  });

  it("records a withdrawal as a new row and keeps the agreement it ends", async () => {
    await recordConsent(dbs.staff.db, { subject: SUBJECT, purpose: "account_terms", noticeVersion: "pre-dpdp", channel: "web" });
    await withdrawConsent(dbs.staff.db, { subject: SUBJECT, purpose: "account_terms", noticeVersion: "pre-dpdp", channel: "web" });

    const rows = await listConsents(dbs.staff.db, SUBJECT);
    expect(rows.map((row) => row.event)).toEqual(["given", "withdrawn"]);
  });

  it("lists only the subject asked for, oldest first", async () => {
    await recordConsent(dbs.staff.db, { subject: SUBJECT, purpose: "account_terms", noticeVersion: "v1", channel: "web" });
    await recordConsent(dbs.staff.db, { subject: { type: "user", ref: "someone-else" }, purpose: "account_terms", noticeVersion: "v1", channel: "web" });
    await recordConsent(dbs.staff.db, { subject: SUBJECT, purpose: "lead_contact", noticeVersion: "v2", channel: "web" });

    const rows = await listConsents(dbs.staff.db, SUBJECT);
    expect(rows.map((row) => row.purpose)).toEqual(["account_terms", "lead_contact"]);
  });

  it("cannot be edited, back-dated or deleted early, so a record cannot be changed after the fact", async () => {
    await recordConsent(dbs.staff.db, { subject: SUBJECT, purpose: "account_terms", noticeVersion: "pre-dpdp", channel: "web" });
    expect(await captureErrorText(dbs.staff.db.update(consentRecords).set({ noticeVersion: "other" }))).toContain("permission denied");
    // Only the erasure mark may be set, and only to now (migration 0162): an old date would let the row go at once.
    expect(await captureErrorText(dbs.staff.db.update(consentRecords).set({ subjectErasedAt: new Date("2020-01-01T00:00:00.000Z") }))).toContain("row-level security");
    expect(await dbs.staff.db.delete(consentRecords).returning({ id: consentRecords.id })).toEqual([]);
    expect(await dbs.owner.db.select().from(consentRecords)).toHaveLength(1);
  });

  it("lets the public form role add a record but not read any", async () => {
    await recordConsent(dbs.publicRole.db, { subject: { type: "lead", ref: "lead-1" }, purpose: "lead_contact", noticeVersion: "pre-dpdp", channel: "web" });
    expect(await dbs.owner.db.select().from(consentRecords)).toHaveLength(1);
    expect(await captureErrorText(dbs.publicRole.db.select().from(consentRecords))).toContain("permission denied");
  });

  it("is invisible to the customer's own database role", async () => {
    await recordConsent(dbs.staff.db, { subject: SUBJECT, purpose: "account_terms", noticeVersion: "pre-dpdp", channel: "web" });
    expect(await captureErrorText(dbs.app.db.select().from(consentRecords))).toContain("permission denied");
  });

  it("refuses an unknown event, an empty purpose and an empty notice version", async () => {
    const badEvent = await captureErrorText(
      dbs.staff.db.execute(
        sql`insert into consent_records (id, subject_type, subject_ref, purpose, event, notice_version, channel) values (${uuidv7()}, 'user', 'u', 'account_terms', 'maybe', 'v1', 'web')`,
      ),
    );
    const emptyPurpose = await captureErrorText(recordConsent(dbs.staff.db, { subject: SUBJECT, purpose: "", noticeVersion: "v1", channel: "web" }));
    const emptyVersion = await captureErrorText(recordConsent(dbs.staff.db, { subject: SUBJECT, purpose: "account_terms", noticeVersion: "", channel: "web" }));
    expect(badEvent).toContain("consent_records_event_check");
    expect(emptyPurpose).toContain("consent_records_purpose_check");
    expect(emptyVersion).toContain("consent_records_notice_version_check");
  });
});
