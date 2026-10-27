import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sumCapturedPaymentsBetween } from "./queries/billing";
import { businesses, payments } from "./schema";
import { openTestDatabases, resetTestDatabase, type TestDatabases } from "./testing";

// November 2026 in India.
const FROM = new Date("2026-10-31T18:30:00.000Z");
const TO = new Date("2026-11-30T18:30:00.000Z");
const INSIDE = new Date("2026-11-10T06:00:00.000Z");

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

async function business(slug: string): Promise<string> {
  const [row] = await dbs.staff.db.insert(businesses).values({ slug, name: slug, currency: "INR" }).returning({ id: businesses.id });
  if (row === undefined) throw new Error("No business was inserted");
  return row.id;
}

describe("sumCapturedPaymentsBetween", () => {
  it("sums captured, applied payments inside the period, per currency", async () => {
    const businessId = await business("om-sweets");
    await dbs.staff.db.insert(payments).values([
      { businessId, provider: "fake", providerPaymentId: "in-1", kind: "renewal", status: "captured", amountCents: 299_900, currency: "INR", paidAt: INSIDE },
      { businessId, provider: "fake", providerPaymentId: "in-2", kind: "charge", status: "captured", amountCents: 100_000, currency: "INR", paidAt: INSIDE },
      { businessId, provider: "fake", providerPaymentId: "usd-1", kind: "renewal", status: "captured", amountCents: 6_500, currency: "USD", paidAt: INSIDE },
      { businessId, provider: "fake", providerPaymentId: "before", kind: "renewal", status: "captured", amountCents: 50_000, currency: "INR", paidAt: new Date("2026-10-31T18:29:59.000Z") },
      { businessId, provider: "fake", providerPaymentId: "at-end", kind: "renewal", status: "captured", amountCents: 50_000, currency: "INR", paidAt: TO },
      { businessId, provider: "fake", providerPaymentId: "failed", kind: "renewal", status: "failed", amountCents: 70_000, currency: "INR", paidAt: INSIDE },
      { businessId, provider: "fake", providerPaymentId: "unapplied", kind: "renewal", status: "captured", amountCents: 80_000, currency: "INR", paidAt: INSIDE, attentionReason: "already_paid", attentionRaisedAt: INSIDE },
    ]);

    // The database orders the currency enum as declared: USD, then INR.
    expect(await sumCapturedPaymentsBetween(dbs.staff.db, FROM, TO)).toEqual([
      { currency: "USD", amountCents: 6_500 },
      { currency: "INR", amountCents: 399_900 },
    ]);
  });

  it("returns nothing when no money came in", async () => {
    expect(await sumCapturedPaymentsBetween(dbs.staff.db, FROM, TO)).toEqual([]);
  });
});
