import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { breachRegister, users } from "./schema";
import { listBreaches, logBreach, updateBreach } from "./queries/breach-register";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "staff-asha";
const DETECTED = new Date("2026-10-12T08:00:00.000Z");
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

const INPUT = { recordedBy: STAFF, detectedAt: DETECTED, summary: "A staff laptop with a console session was lost.", dataCategories: ["contact details", "billing details"] };

describe("the breach register", () => {
  it("logs a breach as open with nothing reported yet, and lists the newest first", async () => {
    await logBreach(dbs.staff.db, INPUT);
    await logBreach(dbs.staff.db, { ...INPUT, detectedAt: new Date("2026-10-13T08:00:00.000Z"), summary: "A second one." });
    const rows = await listBreaches(dbs.staff.db);
    expect(rows.map((row) => row.summary)).toEqual(["A second one.", INPUT.summary]);
    expect(rows[1]).toMatchObject({
      status: "open",
      dataCategories: ["contact details", "billing details"],
      reportedCertInAt: null,
      reportedBoardAt: null,
      peopleNotifiedAt: null,
    });
  });

  it("records each report as it is made, and moves the status", async () => {
    const id = await logBreach(dbs.staff.db, INPUT);
    const certIn = new Date("2026-10-12T11:30:00.000Z");
    await updateBreach(dbs.staff.db, id, { reportedCertInAt: certIn, status: "contained" });
    await updateBreach(dbs.staff.db, id, { reportedBoardAt: new Date("2026-10-12T20:00:00.000Z"), peopleNotifiedAt: new Date("2026-10-13T06:00:00.000Z"), status: "closed" });
    const [row] = await listBreaches(dbs.staff.db);
    expect(row).toMatchObject({ status: "closed", reportedCertInAt: certIn });
    expect(row?.reportedBoardAt).toEqual(new Date("2026-10-12T20:00:00.000Z"));
    expect(row?.peopleNotifiedAt).toEqual(new Date("2026-10-13T06:00:00.000Z"));
  });

  it("never lets a report date be taken back once it is set", async () => {
    const id = await logBreach(dbs.staff.db, INPUT);
    await updateBreach(dbs.staff.db, id, { reportedCertInAt: new Date("2026-10-12T11:30:00.000Z") });
    await updateBreach(dbs.staff.db, id, { reportedCertInAt: new Date("2026-10-14T11:30:00.000Z") });
    const [row] = await listBreaches(dbs.staff.db);
    expect(row?.reportedCertInAt).toEqual(new Date("2026-10-12T11:30:00.000Z"));
  });

  it("cannot be deleted by the staff role until five years after closing, so a breach once logged stays in the register", async () => {
    await logBreach(dbs.staff.db, INPUT);
    // The retention run may delete closed records past five years (migration 0162); this one is simply not matched.
    expect(await dbs.staff.db.delete(breachRegister).returning({ id: breachRegister.id })).toEqual([]);
    expect(await dbs.owner.db.select().from(breachRegister)).toHaveLength(1);
  });

  it("is invisible to the customer's role and to the public form role", async () => {
    await logBreach(dbs.staff.db, INPUT);
    expect(await captureErrorText(dbs.app.db.select().from(breachRegister))).toContain("permission denied");
    expect(await captureErrorText(dbs.publicRole.db.select().from(breachRegister))).toContain("permission denied");
  });

  it("refuses an empty summary, an unknown status and a report dated before the breach was found", async () => {
    expect(await captureErrorText(logBreach(dbs.staff.db, { ...INPUT, summary: "" }))).toContain("breach_register_summary_check");
    const id = await logBreach(dbs.staff.db, INPUT);
    expect(await captureErrorText(updateBreach(dbs.staff.db, id, { status: "maybe" as never }))).toContain("breach_register_status_check");
    expect(await captureErrorText(updateBreach(dbs.staff.db, id, { reportedCertInAt: new Date("2026-10-01T00:00:00.000Z") }))).toContain("breach_register_dates_check");
  });
});
