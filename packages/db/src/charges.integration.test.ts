import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  findBillingState,
  findFirstPayment,
  findActivePlan,
  insertSubscription,
  listReceiptsForBusiness,
  recordPaymentAndActivate,
} from "./queries/billing";
import {
  ChargeNotFoundError,
  countPaidBlogBlocks,
  findChargeByPaymentId,
  findChargeByProviderOrder,
  findChargeForBusiness,
  findOpenChargeOfKind,
  insertCharge,
  InvalidChargeError,
  listChargesForBusiness,
  openBlogPostsCharge,
  recordChargePayment,
  setChargeProviderOrder,
  waiveCharge,
  type NewCharge,
} from "./queries/charges";
import { businesses, businessMembers, charges, payments, pressReleases, users } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STAFF = "staff-1";
const NOW = new Date("2026-10-02T09:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

/** 2 extra hours at ₹1,425 each, GST included: 285,000 charged. */
function hoursCharge(businessId: string, overrides: Partial<NewCharge> = {}): NewCharge {
  return {
    businessId,
    kind: "change_hours",
    description: "Extra change hours",
    quantity: 2,
    unitAmountCents: 142_500,
    taxRateBasisPoints: 1800,
    amountCents: 285_000,
    currency: "INR",
    createdByStaffId: STAFF,
    ...overrides,
  };
}

function blogCharge(businessId: string): NewCharge {
  return {
    businessId,
    kind: "blog_posts",
    description: "100 more blog posts",
    quantity: 1,
    unitAmountCents: 47_500,
    taxRateBasisPoints: 1800,
    amountCents: 47_500,
    currency: "INR",
    createdByStaffId: null,
  };
}

function payFor(chargeId: string, businessId: string, providerPaymentId: string, amountCents = 285_000) {
  return {
    chargeId,
    businessId,
    provider: "fake" as const,
    providerPaymentId,
    amountCents,
    currency: "INR" as const,
    paidAt: NOW,
    now: NOW,
  };
}

function asOwner<T>(businessId: string, userId: string, work: Parameters<typeof withTenantScope<T>>[2]): Promise<T> {
  return withTenantScope(dbs.app.db, { userId, businessId }, work);
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.staff.db.insert(users).values([
    { id: OWNER_A, name: "Asha", email: "asha@example.com" },
    { id: OWNER_B, name: "Ben", email: "ben@example.com" },
    { id: STAFF, name: "Staff", email: "staff@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
      { slug: "riverside", name: "Riverside", currency: "USD" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "riverside")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
});

describe("adding and reading charges", () => {
  it("lets the customer read their own open charges, and nobody else's", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));

    const own = await asOwner(businessA, OWNER_A, (tx) => listChargesForBusiness(tx, businessA, { status: "open", limit: 10 }));
    const other = await asOwner(businessB, OWNER_B, (tx) => findChargeForBusiness(tx, businessA, charge.id));

    expect(own.map((row) => row.id)).toEqual([charge.id]);
    expect(own[0]).toMatchObject({ status: "open", amountCents: 285_000, quantity: 2, createdByStaffId: STAFF });
    expect(other).toBeNull();
  });

  it("never lets the customer's connection write a charge", async () => {
    const error = await captureErrorText(
      asOwner(businessA, OWNER_A, (tx) => tx.insert(charges).values(hoursCharge(businessA))),
    );
    expect(error).toMatch(/permission denied/i);
  });

  it("refuses a charge that makes no sense", async () => {
    await expect(insertCharge(dbs.staff.db, hoursCharge(businessA, { description: " padded " }))).rejects.toThrow(
      InvalidChargeError,
    );
    await expect(insertCharge(dbs.staff.db, hoursCharge(businessA, { quantity: 0 }))).rejects.toThrow(InvalidChargeError);
    await expect(insertCharge(dbs.staff.db, hoursCharge(businessA, { amountCents: 100 }))).rejects.toThrow(
      InvalidChargeError,
    );
  });
});

describe("recordChargePayment", () => {
  it("settles the charge and gives it a receipt with its own description and tax", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));

    const result = await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_charge_1"));

    expect(result).toMatchObject({ outcome: "paid", alreadyRecorded: false });
    expect(result.payment).toMatchObject({ kind: "charge", subscriptionId: null, amountCents: 285_000, attentionReason: null });
    expect(await findChargeForBusiness(dbs.staff.db, businessA, charge.id)).toMatchObject({
      status: "paid",
      paymentId: result.payment.id,
      paidAt: NOW,
    });
    const receipts = await asOwner(businessA, OWNER_A, (tx) => listReceiptsForBusiness(tx, businessA, 10));
    expect(receipts[0]).toMatchObject({
      kind: "charge",
      chargeDescription: "Extra change hours",
      chargeQuantity: 2,
      taxRateBasisPoints: 1800,
      planName: null,
      sequence: 1,
    });
  });

  it("finds the charge a payment settled, for that business only", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    const other = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    const result = await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_charge_by_payment"));

    expect(await findChargeByPaymentId(dbs.staff.db, businessA, result.payment.id)).toMatchObject({ id: charge.id, status: "paid" });
    expect(await findChargeByPaymentId(dbs.staff.db, businessB, result.payment.id)).toBeNull();
    expect(await findChargeByPaymentId(dbs.staff.db, businessA, "0192f3c4-0000-7000-8000-00000000dead")).toBeNull();
    // An open charge has no payment, so no payment id leads to it.
    expect(other.paymentId).toBeNull();
  });

  it("records a redelivered payment once", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_charge_1"));

    const again = await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_charge_1"));

    expect(again).toMatchObject({ outcome: "paid", alreadyRecorded: true });
    expect(await dbs.staff.db.select({ id: payments.id }).from(payments)).toHaveLength(1);
  });

  it("keeps a wrong amount on record for staff and leaves the charge open", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));

    const result = await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_short", 100_000));

    expect(result.outcome).toBe("amount-mismatch");
    expect(result.payment.attentionReason).toBe("amount_mismatch");
    expect((await findChargeForBusiness(dbs.staff.db, businessA, charge.id))?.status).toBe("open");
  });

  it("flags a second payment for a charge that was already settled", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_first"));

    const second = await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_second"));

    expect(second.outcome).toBe("not-open");
    expect(second.payment.attentionReason).toBe("already_paid");
  });

  it("flags a payment for a waived charge instead of reopening it", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    expect(await waiveCharge(dbs.staff.db, { chargeId: charge.id, businessId: businessA, staffId: STAFF, now: NOW })).toBe(true);

    const result = await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_late"));

    expect(result.outcome).toBe("not-open");
    expect((await findChargeForBusiness(dbs.staff.db, businessA, charge.id))?.status).toBe("waived");
  });

  it("records a bank transfer with who recorded it", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));

    const result = await recordChargePayment(dbs.staff.db, {
      ...payFor(charge.id, businessA, "manual_charge_1"),
      provider: "manual",
      manual: { recordedByStaffId: STAFF, reference: "NEFT 123", receivedOn: "2026-10-01" },
    });

    expect(result.outcome).toBe("paid");
    const [row] = await dbs.staff.db.select({ ref: payments.manualReference }).from(payments).where(eq(payments.id, result.payment.id));
    expect(row?.ref).toBe("NEFT 123");
  });

  it("refuses a charge from another business", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    await expect(recordChargePayment(dbs.staff.db, payFor(charge.id, businessB, "fake_pay_x"))).rejects.toThrow(
      ChargeNotFoundError,
    );
  });

  it("never counts a paid extra as the plan's first payment, or as a plan payment under review", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_extra"));
    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_duplicate"));

    expect(await findFirstPayment(dbs.staff.db, businessA)).toBeNull();
    expect((await findBillingState(dbs.staff.db, businessA))?.paymentUnderReview).toBe(false);
  });
});

describe("a paid press release", () => {
  function pressReleaseCharge(businessId: string): NewCharge {
    return {
      businessId,
      kind: "press_release",
      description: "Press release",
      quantity: 1,
      unitAmountCents: 700_000,
      taxRateBasisPoints: 1800,
      amountCents: 700_000,
      currency: "INR",
      createdByStaffId: null,
    };
  }

  it("starts its status row, waiting for the team, in the same transaction as the payment", async () => {
    const charge = await insertCharge(dbs.staff.db, pressReleaseCharge(businessA));
    expect(await dbs.staff.db.select().from(pressReleases)).toEqual([]);

    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_press", 700_000));

    const rows = await dbs.staff.db.select().from(pressReleases);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ businessId: businessA, chargeId: charge.id, status: "waiting", statusChangedAt: null });
  });

  it("starts it once, however many times the payment is delivered", async () => {
    const charge = await insertCharge(dbs.staff.db, pressReleaseCharge(businessA));
    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_press", 700_000));
    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_press", 700_000));
    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_press_duplicate", 700_000));

    expect(await dbs.staff.db.select().from(pressReleases)).toHaveLength(1);
  });

  it("starts nothing for a wrong amount, and nothing for any other kind of charge", async () => {
    const press = await insertCharge(dbs.staff.db, pressReleaseCharge(businessA));
    await recordChargePayment(dbs.staff.db, payFor(press.id, businessA, "fake_pay_short", 100));
    const hours = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    await recordChargePayment(dbs.staff.db, payFor(hours.id, businessA, "fake_pay_hours"));

    expect(await dbs.staff.db.select().from(pressReleases)).toEqual([]);
  });
});

describe("finding the open charge of a kind", () => {
  it("returns the newest open charge of that kind for the business, and nothing for a paid one, another kind or another business", async () => {
    expect(await findOpenChargeOfKind(dbs.staff.db, businessA, "blog_posts")).toBeNull();

    const older = await insertCharge(dbs.staff.db, hoursCharge(businessA, { kind: "change_hours" }));
    const newer = await insertCharge(dbs.staff.db, hoursCharge(businessA, { kind: "change_hours" }));
    await insertCharge(dbs.staff.db, blogCharge(businessA));

    expect((await findOpenChargeOfKind(dbs.staff.db, businessA, "change_hours"))?.id).toBe(newer.id);
    expect(await findOpenChargeOfKind(dbs.staff.db, businessB, "change_hours")).toBeNull();

    await recordChargePayment(dbs.staff.db, payFor(newer.id, businessA, "fake_pay_newer"));
    expect((await findOpenChargeOfKind(dbs.staff.db, businessA, "change_hours"))?.id).toBe(older.id);
  });

  it("works through the customer's own connection", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));

    const own = await asOwner(businessA, OWNER_A, (tx) => findOpenChargeOfKind(tx, businessA, "change_hours"));
    const other = await asOwner(businessB, OWNER_B, (tx) => findOpenChargeOfKind(tx, businessA, "change_hours"));

    expect(own?.id).toBe(charge.id);
    expect(other).toBeNull();
  });
});

describe("online payment attempts", () => {
  it("matches a provider order back to its charge, and only while the charge is open", async () => {
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    const set = { chargeId: charge.id, businessId: businessA, provider: "razorpay" as const, providerOrderId: "order_1" };

    expect(await setChargeProviderOrder(dbs.staff.db, set)).toBe(true);
    expect((await findChargeByProviderOrder(dbs.staff.db, "razorpay", "order_1"))?.id).toBe(charge.id);

    await waiveCharge(dbs.staff.db, { chargeId: charge.id, businessId: businessA, staffId: STAFF, now: NOW });
    expect(await setChargeProviderOrder(dbs.staff.db, { ...set, providerOrderId: "order_2" })).toBe(false);
  });
});

describe("blog post unlocks", () => {
  it("reuses the open unlock instead of adding a second", async () => {
    const first = await openBlogPostsCharge(dbs.staff.db, blogCharge(businessA));
    const second = await openBlogPostsCharge(dbs.staff.db, blogCharge(businessA));

    expect(second.id).toBe(first.id);
    expect(await listChargesForBusiness(dbs.staff.db, businessA, { limit: 10 })).toHaveLength(1);
  });

  it("counts only paid blocks", async () => {
    const unlock = await openBlogPostsCharge(dbs.staff.db, blogCharge(businessA));
    expect(await countPaidBlogBlocks(dbs.staff.db, businessA)).toBe(0);

    await recordChargePayment(dbs.staff.db, payFor(unlock.id, businessA, "fake_pay_blog", 47_500));
    const next = await openBlogPostsCharge(dbs.staff.db, blogCharge(businessA));

    expect(next.id).not.toBe(unlock.id);
    expect(await asOwner(businessA, OWNER_A, (tx) => countPaidBlogBlocks(tx, businessA))).toBe(1);
  });
});

describe("plan payments are unaffected", () => {
  it("still numbers a charge receipt after the plan's own", async () => {
    const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
    if (plan === null) throw new Error("No INR plan seeded");
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId: businessA,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_a",
    });
    await recordPaymentAndActivate(dbs.staff.db, {
      businessId: businessA,
      subscriptionId: subscription.id,
      provider: "fake",
      providerPaymentId: "fake_pay_plan",
      kind: "initial",
      amountCents: 299_900,
      currency: "INR",
      paidAt: NOW,
      paidThroughAt: NOW,
      commitmentEndsAt: NOW,
      currentPeriodEnd: NOW,
    });
    const charge = await insertCharge(dbs.staff.db, hoursCharge(businessA));
    await recordChargePayment(dbs.staff.db, payFor(charge.id, businessA, "fake_pay_charge"));

    const receipts = await listReceiptsForBusiness(dbs.staff.db, businessA, 10);

    expect(receipts.map((receipt) => [receipt.kind, receipt.sequence, receipt.chargeDescription])).toEqual([
      ["charge", 2, "Extra change hours"],
      ["initial", 1, null],
    ]);
    expect(receipts[1]?.taxRateBasisPoints).toBe(1800);
  });
});
