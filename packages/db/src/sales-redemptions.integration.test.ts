import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createAffiliate } from "./queries/affiliates";
import { findActivePlan, insertSubscription, recordPaymentAndActivate, type Plan } from "./queries/billing";
import { createReferralCode } from "./queries/referrals";
import { listDueSalesRedemptions, markSalesRedemptionDelivered, markSalesRedemptionFailed } from "./queries/sales-redemptions";
import { businessMembers, businesses, users } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF_USER = "staff-user";
const OWNER_USER = "owner-user";
const NOW = new Date("2026-11-23T12:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

async function pay(codeId: string | null, suffix: string, forBusiness: string = businessId): Promise<string> {
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId: forBusiness,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${suffix}`,
    ...(codeId === null ? {} : { referralCodeId: codeId, discountAmountCents: 50_000 }),
  });
  const input = {
    businessId: forBusiness,
    subscriptionId: subscription.id,
    provider: "fake" as const,
    providerPaymentId: `fake_pay_${suffix}`,
    kind: "initial" as const,
    amountCents: 249_900,
    currency: "INR" as const,
    paidAt: NOW,
    paidThroughAt: NOW,
    commitmentEndsAt: NOW,
    currentPeriodEnd: NOW,
  };
  const first = await recordPaymentAndActivate(dbs.staff.db, input);
  await recordPaymentAndActivate(dbs.staff.db, input);
  return first.payment.id;
}

async function coupon(code: string, affiliateId: string | null = null): Promise<string> {
  const created = await createReferralCode(dbs.staff.db, {
    code,
    currency: "INR",
    affiliateId,
    discount: { kind: "amount", amountCents: 50_000 },
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
  });
  return created.id;
}

beforeAll(async () => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.owner.db.insert(users).values([
    { id: STAFF_USER, name: "Staff", email: "staff@example.com", emailVerified: true },
    { id: OWNER_USER, name: "Owner", email: "owner@acme.test", emailVerified: true },
  ]);
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "acme", name: "Acme Dental", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  await dbs.owner.db.insert(businessMembers).values({ businessId, userId: OWNER_USER, role: "owner" });
  const active = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (active === null) throw new Error("No active INR plan was seeded");
  plan = active;
});

// The database stamps a new row with its own clock, so "later" is an hour past the real time, whatever day the test runs.
const later = new Date(Date.now() + 3_600_000);

describe("sales redemption queue", () => {
  it("queues a captured payment on a plain coupon once, even when the provider delivers it twice", async () => {
    const codeId = await coupon("PRIYA10");
    const paymentId = await pay(codeId, "a");
    const due = await listDueSalesRedemptions(dbs.staff.db, later, 10);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      couponCode: "PRIYA10",
      businessId,
      businessName: "Acme Dental",
      clientEmail: "owner@acme.test",
      paymentId,
      paymentKind: "initial",
      amountCents: 249_900,
      currency: "INR",
    });
  });

  it("queues nothing for an affiliate's code or for a payment with no code", async () => {
    const affiliate = await createAffiliate(dbs.staff.db, {
      name: "Asha Nair",
      email: null,
      phone: "+919876543210",
      reward: { kind: "amount", amountCents: 20_000 },
      rewardCurrency: "INR",
      rewardCycles: null,
      notes: null,
      createdByStaffId: STAFF_USER,
    });
    await pay(await coupon("ASHA500", affiliate.id), "b");
    const other = await dbs.owner.db.insert(businesses).values({ slug: "other", name: "Other Co", currency: "INR" }).returning({ id: businesses.id });
    await pay(null, "c", other[0]?.id ?? "");
    expect(await listDueSalesRedemptions(dbs.staff.db, later, 10)).toHaveLength(0);
  });

  it("stops listing a delivered row and backs a failed one off", async () => {
    await pay(await coupon("PRIYA10"), "d");
    const [row] = await listDueSalesRedemptions(dbs.staff.db, later, 10);
    if (row === undefined) throw new Error("expected a queued redemption");
    await markSalesRedemptionFailed(dbs.staff.db, row.eventId, "Fynix answered 500", row.attempts, later);
    expect(await listDueSalesRedemptions(dbs.staff.db, later, 10)).toHaveLength(0);
    const retry = await listDueSalesRedemptions(dbs.staff.db, new Date(later.getTime() + 2 * 60_000), 10);
    expect(retry).toHaveLength(1);
    expect(retry[0]?.attempts).toBe(1);
    await markSalesRedemptionDelivered(dbs.staff.db, row.eventId, later);
    expect(await listDueSalesRedemptions(dbs.staff.db, new Date(later.getTime() + 3_600_000), 10)).toHaveLength(0);
  });
});
