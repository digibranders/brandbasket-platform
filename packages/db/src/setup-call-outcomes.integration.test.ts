import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findLatestKickoffOutcome, recordKickoffOutcome } from "./queries/setup-call-outcomes";
import { businesses, setupCallOutcomes, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

const STAFF = "sco-staff";
const EARLIER = new Date("2026-10-27T10:00:00.000Z");
const LATER = new Date("2026-10-28T10:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff-sco@example.com", emailVerified: true });
  const [business] = await dbs.owner.db.insert(businesses).values({ slug: "kestrel-cafe", name: "Kestrel Cafe", currency: "INR" }).returning({ id: businesses.id });
  if (business === undefined) throw new Error("Seed business was not inserted");
  businessId = business.id;
});

describe("setup call outcomes", () => {
  it("returns nothing before an outcome is recorded", async () => {
    expect(await findLatestKickoffOutcome(dbs.staff.db, businessId)).toBeNull();
  });

  it("records an outcome with the call's times and returns the newest one", async () => {
    await recordKickoffOutcome(dbs.staff.db, {
      businessId,
      outcome: "customer_no_show",
      note: "Called twice, no answer",
      startsAt: new Date("2026-10-26T09:00:00.000Z"),
      endsAt: new Date("2026-10-26T09:30:00.000Z"),
      staffId: STAFF,
      now: EARLIER,
    });
    await recordKickoffOutcome(dbs.staff.db, {
      businessId,
      outcome: "completed",
      note: null,
      startsAt: null,
      endsAt: null,
      staffId: STAFF,
      now: LATER,
    });

    expect(await findLatestKickoffOutcome(dbs.staff.db, businessId)).toEqual({
      outcome: "completed",
      note: null,
      recordedAt: LATER,
      recordedByStaffId: STAFF,
    });
    const rows = await dbs.owner.db.select().from(setupCallOutcomes).where(eq(setupCallOutcomes.businessId, businessId));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.outcome === "customer_no_show")).toMatchObject({
      note: "Called twice, no answer",
      callStartsAt: new Date("2026-10-26T09:00:00.000Z"),
      callEndsAt: new Date("2026-10-26T09:30:00.000Z"),
    });
  });

  it("lets staff insert and read, but not change or remove a recorded outcome", async () => {
    await recordKickoffOutcome(dbs.staff.db, { businessId, outcome: "unknown", note: null, startsAt: null, endsAt: null, staffId: STAFF, now: EARLIER });

    expect(await captureErrorText(dbs.staff.db.update(setupCallOutcomes).set({ note: "Changed later" }))).toMatch(/permission denied/);
    expect(await captureErrorText(dbs.staff.db.delete(setupCallOutcomes))).toMatch(/permission denied/);
  });

  it("gives the customer's role no access to the table", async () => {
    expect(await captureErrorText(dbs.app.db.select().from(setupCallOutcomes))).toMatch(/permission denied/);
  });
});
