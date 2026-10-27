import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { recordFailedPayment } from "./queries/staff-payments";
import { businesses, payments, users } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF_USER = "staff-user";
const NOV_11 = new Date("2026-11-11T06:30:00.000Z");
const NO_SUCH_BUSINESS = "01920000-0000-7000-8000-000000000999";

let dbs: TestDatabases;
let businessId = "";

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: STAFF_USER, name: "Riya Kapoor", email: "riya@example.com", emailVerified: true });
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "om-sweets", name: "Om Sweets", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
});

const failure = {
  provider: "razorpay",
  providerPaymentId: "pay_failed_1",
  kind: "renewal",
  amountCents: 299_900,
  currency: "INR",
  failureReason: "Card declined by the bank",
  failedAt: NOV_11,
} as const;

describe("recordFailedPayment", () => {
  it("records a failed attempt once, with no paid time", async () => {
    expect(await recordFailedPayment(dbs.staff.db, { ...failure, businessId })).toBe("recorded");
    expect(await recordFailedPayment(dbs.staff.db, { ...failure, businessId })).toBe("already-recorded");

    const rows = await dbs.staff.db.select().from(payments).where(eq(payments.providerPaymentId, "pay_failed_1"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessId,
      status: "failed",
      paidAt: null,
      failureReason: "Card declined by the bank",
      createdAt: NOV_11,
    });
  });

  it("records nothing for a business that does not exist", async () => {
    expect(await recordFailedPayment(dbs.staff.db, { ...failure, businessId: NO_SUCH_BUSINESS })).toBe("unknown-business");
    expect(await recordFailedPayment(dbs.staff.db, { ...failure, businessId: "not-a-uuid" })).toBe("unknown-business");
    expect(await dbs.staff.db.select().from(payments)).toHaveLength(0);
  });
});
