import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, insertSubscription, recordPaymentAndActivate, type Plan } from "./queries/billing";
import {
  countReferralRedemptions,
  createReferralCode,
  deleteReferralCode,
  findBusinessReferralCode,
  findReferralCodeById,
  findRedeemableReferralCode,
  listReferralCodes,
  listReferralRedemptions,
  setBusinessReferralCode,
  updateReferralCode,
} from "./queries/referrals";
import { createAffiliate, updateAffiliate } from "./queries/affiliates";
import { businesses, referralCodes, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, seedDollarPlanForTests,
  seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF_USER = "staff-user";
const NOW = new Date("2026-09-22T12:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";

async function requirePlan(currency: "USD" | "INR"): Promise<Plan> {
  const plan = await findActivePlan(dbs.staff.db, currency, "managed");
  if (plan === null) throw new Error(`No active ${currency} plan was seeded`);
  return plan;
}

function addMonths(from: Date, months: number): Date {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/** A business that redeemed `codeId` and paid: the only thing that counts as a redemption. */
async function redeem(codeId: string, discountAmountCents: number, suffix: string): Promise<void> {
  const plan = await requirePlan("USD");
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${suffix}`,
    referralCodeId: codeId,
    discountAmountCents,
  });
  const paidThrough = addMonths(NOW, plan.initialTermMonths);
  await recordPaymentAndActivate(dbs.staff.db, {
    businessId,
    subscriptionId: subscription.id,
    provider: "fake",
    providerPaymentId: `fake_pay_${suffix}`,
    kind: "initial",
    amountCents: plan.initialAmountCents - discountAmountCents,
    currency: plan.currency,
    paidAt: NOW,
    paidThroughAt: paidThrough,
    commitmentEndsAt: paidThrough,
    currentPeriodEnd: paidThrough,
  });
}

async function seedAffiliate(): Promise<string> {
  const affiliate = await createAffiliate(dbs.staff.db, {
    name: "Asha Nair",
    email: "asha@example.com",
    phone: null,
    reward: { kind: "amount", amountCents: 1_000 },
    rewardCurrency: "USD",
    rewardCycles: null,
    notes: null,
    createdByStaffId: STAFF_USER,
  });
  return affiliate.id;
}

async function seedCode(overrides: Partial<Parameters<typeof createReferralCode>[1]> = {}): Promise<string> {
  const created = await createReferralCode(dbs.staff.db, {
    code: "SAVE15",
    currency: "USD",
    affiliateId: null,
    discount: { kind: "amount", amountCents: 1_125 },
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
    ...overrides,
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
  await seedDollarPlanForTests(dbs.owner);
  await dbs.owner.db
    .insert(users)
    .values({ id: STAFF_USER, name: "Staff", email: "staff@example.com", emailVerified: true });
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "curry-cook", name: "Curry Cook", currency: "USD" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
});

describe("createReferralCode", () => {
  it("stores the code and reads it back by id", async () => {
    const id = await seedCode();
    const found = await findReferralCodeById(dbs.staff.db, id);
    expect(found).toMatchObject({
      code: "SAVE15",
      currency: "USD",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 1_125 },
      active: true,
    });
  });

  it("stores a percentage discount and reads it back as a percentage", async () => {
    const id = await seedCode({ code: "TENPCT", discount: { kind: "percent", basisPoints: 1_250 } });
    const found = await findReferralCodeById(dbs.staff.db, id);
    expect(found?.discount).toEqual({ kind: "percent", basisPoints: 1_250 });
    const listed = await listReferralCodes(dbs.staff.db, "coupon", 10);
    expect(listed[0]).toMatchObject({ discount: { kind: "percent", basisPoints: 1_250 } });
  });

  it("refuses a percentage discount outside 0.01% to 99% at the database", async () => {
    for (const basisPoints of [0, 9_901, 10_000]) {
      const message = await captureErrorText(
        seedCode({ code: `PCT${basisPoints}`, discount: { kind: "percent", basisPoints } }),
      );
      expect(message).toContain("referral_codes_discount_check");
    }
  });

  it("stores an affiliate code with no discount", async () => {
    const affiliateId = await seedAffiliate();
    const id = await seedCode({ code: "PRIYA", affiliateId, discount: null });
    expect(await findReferralCodeById(dbs.staff.db, id)).toMatchObject({ affiliateId, discount: null });
  });

  it("refuses a coupon with no discount at the database", async () => {
    const message = await captureErrorText(seedCode({ code: "NOTHING", discount: null }));
    expect(message).toContain("referral_codes_discount_check");
  });

  it("refuses a row that sets both halves of a pair, whichever kind it claims", async () => {
    const id = await seedCode();
    const both = await captureErrorText(
      dbs.staff.db.update(referralCodes).set({ discountPercentBasisPoints: 1_000 }).where(eq(referralCodes.id, id)),
    );
    expect(both).toContain("referral_codes_discount_check");
    const neither = await captureErrorText(
      dbs.staff.db
        .update(referralCodes)
        .set({ discountKind: "percent", discountAmountCents: null })
        .where(eq(referralCodes.id, id)),
    );
    expect(neither).toContain("referral_codes_discount_check");
  });

  it("refuses a second code with the same text", async () => {
    await seedCode();
    const message = await captureErrorText(seedCode());
    expect(message).toContain("referral_codes_code_unique");
  });

  it("refuses a discount of nothing at the database, not only in the form", async () => {
    for (const amountCents of [0, -100]) {
      const message = await captureErrorText(
        seedCode({ code: `AMT${Math.abs(amountCents)}`, discount: { kind: "amount", amountCents } }),
      );
      expect(message).toContain("referral_codes_discount_check");
    }
  });

  it("refuses a code that is not in the stored shape", async () => {
    const message = await captureErrorText(seedCode({ code: "no" }));
    expect(message).toContain("referral_codes_code_format_check");
  });
});

describe("findRedeemableReferralCode", () => {
  it("finds an active code for the matching currency", async () => {
    await seedCode();
    const found = await findRedeemableReferralCode(dbs.staff.db, { code: "SAVE15", currency: "USD", now: NOW });
    expect(found?.code).toBe("SAVE15");
  });

  it("does not find a code for another currency", async () => {
    await seedCode();
    expect(await findRedeemableReferralCode(dbs.staff.db, { code: "SAVE15", currency: "INR", now: NOW })).toBeNull();
  });

  it("does not find a deactivated code", async () => {
    const id = await seedCode();
    await updateReferralCode(dbs.staff.db, { id, active: false, expiresAt: null, maxRedemptions: null });
    expect(await findRedeemableReferralCode(dbs.staff.db, { code: "SAVE15", currency: "USD", now: NOW })).toBeNull();
  });

  it("does not find a code that has expired", async () => {
    await seedCode({ expiresAt: new Date(NOW.getTime() - 1) });
    expect(await findRedeemableReferralCode(dbs.staff.db, { code: "SAVE15", currency: "USD", now: NOW })).toBeNull();
  });

  it("finds a code whose expiry is still ahead", async () => {
    await seedCode({ expiresAt: new Date(NOW.getTime() + 1000) });
    expect(await findRedeemableReferralCode(dbs.staff.db, { code: "SAVE15", currency: "USD", now: NOW })).not.toBeNull();
  });

  it("does not find a code that has reached its redemption cap", async () => {
    const id = await seedCode({ maxRedemptions: 1 });
    await redeem(id, 1_125, "a");
    expect(await findRedeemableReferralCode(dbs.staff.db, { code: "SAVE15", currency: "USD", now: NOW })).toBeNull();
    expect(await countReferralRedemptions(dbs.staff.db, id)).toBe(1);
  });

  it("does not find a code whose affiliate has been turned off", async () => {
    const affiliateId = await seedAffiliate();
    await seedCode({ affiliateId });
    expect(await findRedeemableReferralCode(dbs.staff.db, { code: "SAVE15", currency: "USD", now: NOW })).not.toBeNull();
    await updateAffiliate(dbs.staff.db, {
      id: affiliateId,
      name: "Asha Nair",
      email: "asha@example.com",
      phone: null,
      reward: { kind: "amount", amountCents: 1_000 },
      rewardCurrency: "USD",
      rewardCycles: null,
      notes: null,
      active: false,
    });
    expect(await findRedeemableReferralCode(dbs.staff.db, { code: "SAVE15", currency: "USD", now: NOW })).toBeNull();
  });

  it("returns null for a code nobody created", async () => {
    expect(await findRedeemableReferralCode(dbs.staff.db, { code: "NOPE", currency: "USD", now: NOW })).toBeNull();
  });
});

describe("updateReferralCode", () => {
  it("changes whether, until when and how often a code may be used, leaving the discount alone", async () => {
    const id = await seedCode();
    const expiresAt = new Date(NOW.getTime() + 86_400_000);
    const updated = await updateReferralCode(dbs.staff.db, { id, active: false, expiresAt, maxRedemptions: 3 });
    expect(updated).toMatchObject({
      active: false,
      expiresAt,
      maxRedemptions: 3,
      discount: { kind: "amount", amountCents: 1_125 },
    });
  });
});

describe("setBusinessReferralCode", () => {
  it("applies and then removes a code", async () => {
    const id = await seedCode();
    await setBusinessReferralCode(dbs.staff.db, { businessId, referralCodeId: id });
    expect(await findBusinessReferralCode(dbs.staff.db, businessId)).toMatchObject({ id, code: "SAVE15" });

    await setBusinessReferralCode(dbs.staff.db, { businessId, referralCodeId: null });
    expect(await findBusinessReferralCode(dbs.staff.db, businessId)).toBeNull();
  });
});

describe("listReferralCodes", () => {
  it("lists codes newest first with their redemption counts", async () => {
    await seedCode({ code: "FIRST" });
    await seedCode({ code: "SECOND" });
    const listed = await listReferralCodes(dbs.staff.db, "coupon", 50);
    expect(listed.map((row) => row.code)).toEqual(["SECOND", "FIRST"]);
    expect(listed[0]?.redemptions).toBe(0);
  });

  it("keeps coupons and affiliate codes apart, and lists one affiliate's own", async () => {
    const affiliateId = await seedAffiliate();
    await seedCode({ code: "COUPON" });
    await seedCode({ code: "ASHA", affiliateId });
    expect((await listReferralCodes(dbs.staff.db, "coupon", 50)).map((row) => row.code)).toEqual(["COUPON"]);
    expect((await listReferralCodes(dbs.staff.db, "affiliate", 50)).map((row) => row.code)).toEqual(["ASHA"]);
    expect((await listReferralCodes(dbs.staff.db, { affiliateId }, 50)).map((row) => row.code)).toEqual(["ASHA"]);
  });
});

describe("listReferralRedemptions", () => {
  it("names the businesses that redeemed a code", async () => {
    const id = await seedCode();
    await redeem(id, 1_125, "a");
    const redemptions = await listReferralRedemptions(dbs.staff.db, id, 50);
    expect(redemptions).toHaveLength(1);
    expect(redemptions[0]).toMatchObject({ businessName: "Curry Cook", discountAmountCents: 1_125 });
  });
});

describe("privileges", () => {
  it("does not let the customer's own role read referral codes", async () => {
    await seedCode();
    const message = await captureErrorText(dbs.app.db.select().from(referralCodes));
    expect(message).toMatch(/permission denied/i);
  });

  it("does not let the customer's own role apply a code to its business", async () => {
    const id = await seedCode();
    const message = await captureErrorText(
      dbs.app.db.update(businesses).set({ referralCodeId: id }).where(eq(businesses.id, businessId)),
    );
    expect(message).toMatch(/permission denied/i);
  });
});

describe("the frozen discount", () => {
  it("refuses a subscription carrying a discount with no code", async () => {
    const plan = await requirePlan("USD");
    const message = await captureErrorText(
      insertSubscription(dbs.staff.db, {
        businessId,
        planId: plan.id,
        provider: "fake",
        providerSubscriptionId: "fake_sub_b",
        referralCodeId: null,
        discountAmountCents: 500,
      }),
    );
    expect(message).toContain("subscriptions_discount_check");
  });

  it("accepts a subscription on a code worth nothing: an affiliate code that gives no discount", async () => {
    const affiliateId = await seedAffiliate();
    const id = await seedCode({ code: "PRIYA", affiliateId, discount: null });
    const plan = await requirePlan("USD");
    const subscription = await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_c",
      referralCodeId: id,
      discountAmountCents: 0,
    });
    expect(subscription.referralCodeId).toBe(id);
  });
});

describe("deleteReferralCode", () => {
  it("removes a code nobody has a subscription on", async () => {
    const id = await seedCode();
    expect(await deleteReferralCode(dbs.staff.db, id)).toEqual({ kind: "deleted", clearedApplications: 0 });
    expect(await findReferralCodeById(dbs.staff.db, id)).toBeNull();
  });

  it("clears a pending application and says how many lost it, because nothing was charged", async () => {
    const id = await seedCode();
    await setBusinessReferralCode(dbs.staff.db, { businessId, referralCodeId: id });
    expect(await deleteReferralCode(dbs.staff.db, id)).toEqual({ kind: "deleted", clearedApplications: 1 });
    expect(await findBusinessReferralCode(dbs.staff.db, businessId)).toBeNull();
  });

  it("keeps a code somebody has paid on, because it is part of their billing record", async () => {
    const id = await seedCode();
    await redeem(id, 1_125, "a");
    expect(await deleteReferralCode(dbs.staff.db, id)).toEqual({ kind: "in-use", subscriptions: 1 });
    expect(await findReferralCodeById(dbs.staff.db, id)).not.toBeNull();
  });

  it("keeps a code with an open unpaid checkout on it, which the foreign key would refuse anyway", async () => {
    const id = await seedCode();
    const plan = await requirePlan("USD");
    await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_open",
      referralCodeId: id,
      discountAmountCents: 1_125,
    });
    expect(await deleteReferralCode(dbs.staff.db, id)).toEqual({ kind: "in-use", subscriptions: 1 });
  });

  it("reports a code that is already gone rather than pretending to delete it", async () => {
    expect(await deleteReferralCode(dbs.staff.db, "01a0c8cf-d236-744b-9661-f83d4b9909b6")).toEqual({ kind: "not-found" });
  });

  it("does not let the customer's own role delete a code", async () => {
    const id = await seedCode();
    const message = await captureErrorText(dbs.app.db.delete(referralCodes).where(eq(referralCodes.id, id)));
    expect(message).toMatch(/permission denied/i);
  });
});
