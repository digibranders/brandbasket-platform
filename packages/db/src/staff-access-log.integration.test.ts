import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listRecentStaffAccess, recordStaffAccess, tallyStaffAccessSince } from "./queries/staff-access-log";
import { staffAccessLog, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF_ID = "staff-asha";
const BUSINESS_ID = "0197c2a0-0000-7000-8000-000000000001";
let dbs: TestDatabases;

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});
beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: STAFF_ID, name: "Asha", email: "asha@brandbasket.in", emailVerified: true });
});

describe("the staff access log", () => {
  it("records who did what to what, newest first", async () => {
    await recordStaffAccess(dbs.staff.db, { staffUserId: STAFF_ID, action: "client.view", targetType: "business", targetId: BUSINESS_ID, businessId: BUSINESS_ID, ipAddress: "203.0.113.9" });
    await recordStaffAccess(dbs.staff.db, { staffUserId: STAFF_ID, action: "invoice.export", detail: "month=2026-10 rows=42" });

    const rows = await listRecentStaffAccess(dbs.staff.db, 10);
    expect(rows.map((row) => row.action)).toEqual(["invoice.export", "client.view"]);
    expect(rows[1]).toMatchObject({ staffUserId: STAFF_ID, staffEmail: "asha@brandbasket.in", targetType: "business", businessId: BUSINESS_ID, ipAddress: "203.0.113.9", result: "ok" });
    expect(rows[0]?.detail).toBe("month=2026-10 rows=42");
  });

  it("cannot be edited through the staff role, nor deleted before its 400 days, so a record cannot be erased by the people it describes", async () => {
    await recordStaffAccess(dbs.staff.db, { staffUserId: STAFF_ID, action: "lead.view", targetId: "lead-1" });
    const edit = await captureErrorText(dbs.staff.db.update(staffAccessLog).set({ action: "nothing" }));
    expect(edit).toContain("permission denied");
    // The retention run may delete rows past 400 days (migration 0162); a recent row is simply not matched.
    expect(await dbs.staff.db.delete(staffAccessLog).returning({ id: staffAccessLog.id })).toEqual([]);
    expect(await dbs.owner.db.select().from(staffAccessLog)).toHaveLength(1);
  });

  it("is invisible to the customer's own database role", async () => {
    await recordStaffAccess(dbs.staff.db, { staffUserId: STAFF_ID, action: "lead.view" });
    expect(await captureErrorText(dbs.app.db.select().from(staffAccessLog))).toContain("permission denied");
  });

  it("refuses a result it does not know and an empty action", async () => {
    const badResult = await captureErrorText(
      dbs.staff.db.execute(sql`insert into staff_access_log (id, staff_user_id, action, result) values (${uuidv7()}, ${STAFF_ID}, 'lead.view', 'maybe')`),
    );
    const emptyAction = await captureErrorText(recordStaffAccess(dbs.staff.db, { staffUserId: STAFF_ID, action: "" }));
    expect(badResult).toContain("staff_access_log_result_check");
    expect(emptyAction).toContain("staff_access_log_action_check");
  });
});

describe("the nightly tally of staff access", () => {
  it("counts each staff member's actions by result since a moment, leaving out what came before", async () => {
    await dbs.owner.db.insert(users).values({ id: "staff-ravi", name: "Ravi", email: "ravi@brandbasket.in", emailVerified: true });
    for (let n = 0; n < 3; n += 1) await recordStaffAccess(dbs.staff.db, { staffUserId: STAFF_ID, action: "invoice.export" });
    await recordStaffAccess(dbs.staff.db, { staffUserId: STAFF_ID, action: "staff.sign_in", result: "failed" });
    await recordStaffAccess(dbs.staff.db, { staffUserId: STAFF_ID, action: "staff.sign_in", result: "ok" });
    await recordStaffAccess(dbs.staff.db, { staffUserId: "staff-ravi", action: "invoice.export" });
    // An old record, a day and a half ago.
    await dbs.owner.db.execute(sql`insert into staff_access_log (id, staff_user_id, action, result, created_at) values (${uuidv7()}, ${STAFF_ID}, 'invoice.export', 'ok', now() - interval '36 hours')`);

    const tally = await tallyStaffAccessSince(dbs.staff.db, new Date(Date.now() - 24 * 60 * 60 * 1000));
    const find = (staff: string, action: string, result: string) => tally.find((row) => row.staffEmail === staff && row.action === action && row.result === result)?.count;
    expect(find("asha@brandbasket.in", "invoice.export", "ok")).toBe(3);
    expect(find("asha@brandbasket.in", "staff.sign_in", "failed")).toBe(1);
    expect(find("asha@brandbasket.in", "staff.sign_in", "ok")).toBe(1);
    expect(find("ravi@brandbasket.in", "invoice.export", "ok")).toBe(1);
    expect(tally).toHaveLength(4);
  });
});
