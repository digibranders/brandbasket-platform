import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  cancelAffiliateEarning,
  claimAffiliateLoginLink,
  createAffiliate,
  findAffiliateAccrualContext,
  findAffiliateCashOut,
  findAffiliateByUserId,
  findAffiliateLoginInvite,
  findAffiliateLoginState,
  findAffiliateTotals,
  insertAffiliateEarning,
  issueAffiliateLoginLink,
  listAffiliateCodeUsage,
  listAffiliateEarnings,
  listAffiliateMonthlyActivity,
  listAffiliateMembers,
  listAffiliatePayouts,
  listAffiliates,
  listOwedEarningIds,
  recordAffiliatePayout,
  resetAffiliateCredentialPassword,
} from "./queries/affiliates";
import { findActivePlan, insertSubscription, recordPaymentAndActivate, type Plan } from "./queries/billing";
import { findProviderDiscountPlan, saveProviderDiscountPlan } from "./queries/discount-plans";
import { createReferralCode } from "./queries/referrals";
import { savePaymentInvoiceBasis } from "./queries/tax-invoices";
import { accounts, affiliateEarnings, affiliatePayouts, affiliates, businesses, sessions, users } from "./schema";
import { captureErrorText, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF_USER = "staff-user";
const NOW = new Date("2026-10-06T12:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

async function seedAffiliate(): Promise<string> {
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
  return affiliate.id;
}

/** A member who paid on one of the affiliate's codes. Returns the subscription and the recorded payment's ids. */
async function payOnCode(
  codeId: string,
  discountAmountCents: number,
  suffix: string,
  forBusiness: string = businessId,
): Promise<{ subscriptionId: string; paymentId: string }> {
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId: forBusiness,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${suffix}`,
    referralCodeId: codeId,
    discountAmountCents,
  });
  const recorded = await recordPaymentAndActivate(dbs.staff.db, {
    businessId: forBusiness,
    subscriptionId: subscription.id,
    provider: "fake",
    providerPaymentId: `fake_pay_${suffix}`,
    kind: "initial",
    amountCents: 100_000,
    currency: "INR",
    paidAt: NOW,
    paidThroughAt: NOW,
    commitmentEndsAt: NOW,
    currentPeriodEnd: NOW,
  });
  return { subscriptionId: subscription.id, paymentId: recorded.payment.id };
}

async function earn(affiliateId: string, codeId: string, paymentId: string, amountCents: number): Promise<boolean> {
  return insertAffiliateEarning(dbs.staff.db, {
    affiliateId,
    referralCodeId: codeId,
    businessId,
    paymentId,
    amountCents,
    currency: "INR",
    basisCents: 249_900,
    cycleNumber: 1,
  });
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
  await dbs.owner.db.insert(users).values({ id: STAFF_USER, name: "Staff", email: "staff@example.com", emailVerified: true });
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "curry-cook", name: "Curry Cook", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  const active = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (active === null) throw new Error("No active INR plan was seeded");
  plan = active;
});

async function seedAffiliateCode(affiliateId: string): Promise<string> {
  const code = await createReferralCode(dbs.staff.db, {
    code: "ASHA500",
    currency: "INR",
    affiliateId,
    discount: { kind: "amount", amountCents: 50_000 },
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
  });
  return code.id;
}

describe("affiliates", () => {
  it("refuses a month limit outside 1 to 120", async () => {
    const id = await seedAffiliate();
    for (const rewardCycles of [0, 121]) {
      const message = await captureErrorText(dbs.staff.db.update(affiliates).set({ rewardCycles }).where(eq(affiliates.id, id)));
      expect(message).toContain("affiliates_reward_cycles_check");
    }
  });

  it("refuses an affiliate with no way to reach them, or a flat reward with no currency", async () => {
    const noContact = await captureErrorText(
      dbs.staff.db.insert(affiliates).values({
        name: "Nobody",
        rewardKind: "percent",
        rewardPercentBasisPoints: 500,
        createdByStaffId: STAFF_USER,
      }),
    );
    expect(noContact).toContain("affiliates_contact_check");
    const noCurrency = await captureErrorText(
      dbs.staff.db.insert(affiliates).values({
        name: "Asha",
        phone: "+919876543210",
        rewardKind: "amount",
        rewardAmountCents: 100,
        createdByStaffId: STAFF_USER,
      }),
    );
    expect(noCurrency).toContain("affiliates_reward_check");
  });

  it("is not readable by the customer's own role", async () => {
    await seedAffiliate();
    expect(await captureErrorText(dbs.app.db.select().from(affiliates))).toMatch(/permission denied/i);
    expect(await captureErrorText(dbs.app.db.select().from(affiliateEarnings))).toMatch(/permission denied/i);
  });
});

describe("accrual context and earnings", () => {
  it("names the affiliate behind a subscription, with the plan and frozen discount", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const { subscriptionId, paymentId } = await payOnCode(codeId, 50_000, "a");
    expect(await findAffiliateAccrualContext(dbs.staff.db, subscriptionId, paymentId)).toMatchObject({
      cycleNumber: 1,
      affiliateId,
      referralCodeId: codeId,
      businessId,
      reward: { kind: "amount", amountCents: 20_000 },
      rewardCurrency: "INR",
      rewardCycles: null,
      planCurrency: "INR",
      initialAmountCents: plan.initialAmountCents,
      bundledAddOnNetCents: 0,
      discountAmountCents: 50_000,
    });
  });

  it("numbers each of the member's paid months, in the order they were paid", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const { subscriptionId, paymentId } = await payOnCode(codeId, 50_000, "a");
    const renewal = await recordPaymentAndActivate(dbs.staff.db, {
      businessId,
      subscriptionId,
      provider: "fake",
      providerPaymentId: "fake_pay_renewal",
      kind: "renewal",
      amountCents: 100_000,
      currency: "INR",
      paidAt: new Date(NOW.getTime() + 30 * 86_400_000),
      paidThroughAt: NOW,
      commitmentEndsAt: NOW,
      currentPeriodEnd: NOW,
    });
    expect((await findAffiliateAccrualContext(dbs.staff.db, subscriptionId, paymentId))?.cycleNumber).toBe(1);
    expect((await findAffiliateAccrualContext(dbs.staff.db, subscriptionId, renewal.payment.id))?.cycleNumber).toBe(2);
  });

  it("has no context for a coupon", async () => {
    const coupon = await createReferralCode(dbs.staff.db, {
      code: "SAVE500",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 50_000 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: STAFF_USER,
    });
    const { subscriptionId, paymentId } = await payOnCode(coupon.id, 50_000, "a");
    expect(await findAffiliateAccrualContext(dbs.staff.db, subscriptionId, paymentId)).toBeNull();
  });

  it("earns once per payment, however often it is written", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const { paymentId } = await payOnCode(codeId, 50_000, "a");
    expect(await earn(affiliateId, codeId, paymentId, 20_000)).toBe(true);
    expect(await earn(affiliateId, codeId, paymentId, 20_000)).toBe(false);
    expect(await listAffiliateEarnings(dbs.staff.db, affiliateId, 10)).toHaveLength(1);
  });

  it("counts members and owed money in the list", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const { paymentId } = await payOnCode(codeId, 50_000, "a");
    await earn(affiliateId, codeId, paymentId, 20_000);
    const [listed] = await listAffiliates(dbs.staff.db, 10);
    expect(listed).toMatchObject({ id: affiliateId, members: 1, totals: [{ currency: "INR", owedCents: 20_000, paidCents: 0 }] });
    expect(await listAffiliateMembers(dbs.staff.db, affiliateId, 10)).toMatchObject([{ businessName: "Curry Cook", code: "ASHA500" }]);
  });

  it("cancels an owed earning, and only an owed one", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const { paymentId } = await payOnCode(codeId, 50_000, "a");
    await earn(affiliateId, codeId, paymentId, 20_000);
    const [earning] = await listAffiliateEarnings(dbs.staff.db, affiliateId, 10);
    const input = { affiliateId, earningId: earning?.id ?? "", staffUserId: STAFF_USER, now: NOW };
    expect(await cancelAffiliateEarning(dbs.staff.db, input)).toBe(true);
    expect(await cancelAffiliateEarning(dbs.staff.db, input)).toBe(false);
    expect(await findAffiliateTotals(dbs.staff.db, affiliateId)).toEqual([]);
  });
});

describe("recordAffiliatePayout", () => {
  it("settles exactly the owed earnings it was shown", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const first = await payOnCode(codeId, 50_000, "a");
    await earn(affiliateId, codeId, first.paymentId, 20_000);
    const shown = await listOwedEarningIds(dbs.staff.db, affiliateId, "INR");

    const payout = {
      affiliateId,
      currency: "INR" as const,
      paidOn: "2026-10-06",
      reference: "UTR123",
      withheldCents: 0,
      withheldReason: null,
      recordedByStaffId: STAFF_USER,
    };
    const outcome = await recordAffiliatePayout(dbs.staff.db, { ...payout, earningIds: shown });
    expect(outcome).toMatchObject({ kind: "recorded", amountCents: 20_000 });
    expect(await findAffiliateTotals(dbs.staff.db, affiliateId)).toEqual([{ currency: "INR", owedCents: 0, paidCents: 20_000 }]);
    expect(await listAffiliatePayouts(dbs.staff.db, affiliateId, 10)).toMatchObject([{ amountCents: 20_000, earnings: 1, reference: "UTR123" }]);
    expect(await recordAffiliatePayout(dbs.staff.db, { ...payout, earningIds: [] })).toEqual({ kind: "nothing-owed" });
  });

  it("refuses a payout when something was earned after the page was drawn", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const first = await payOnCode(codeId, 50_000, "a");
    await earn(affiliateId, codeId, first.paymentId, 20_000);
    const shown = await listOwedEarningIds(dbs.staff.db, affiliateId, "INR");
    // The member renews, and that payment earns, before staff press Record payout.
    const recorded = await recordPaymentAndActivate(dbs.staff.db, {
      businessId,
      subscriptionId: first.subscriptionId,
      provider: "fake",
      providerPaymentId: "fake_pay_renewal",
      kind: "renewal",
      amountCents: 100_000,
      currency: "INR",
      paidAt: NOW,
      paidThroughAt: NOW,
      commitmentEndsAt: NOW,
      currentPeriodEnd: NOW,
    });
    await earn(affiliateId, codeId, recorded.payment.id, 20_000);

    const outcome = await recordAffiliatePayout(dbs.staff.db, {
      affiliateId,
      currency: "INR",
      earningIds: shown,
      paidOn: "2026-10-06",
      reference: "UTR123",
      withheldCents: 0,
      withheldReason: null,
      recordedByStaffId: STAFF_USER,
    });
    expect(outcome).toEqual({ kind: "stale" });
    expect(await listAffiliatePayouts(dbs.staff.db, affiliateId, 10)).toEqual([]);
  });
});

describe("provider discount plans", () => {
  it("keeps the first plan saved for a base plan and discount", async () => {
    const key = { planId: plan.id, discountAmountCents: 50_000, provider: "razorpay" as const };
    expect(await findProviderDiscountPlan(dbs.staff.db, key)).toBeNull();
    expect(await saveProviderDiscountPlan(dbs.staff.db, { ...key, providerPlanId: "plan_first" })).toBe("plan_first");
    expect(await saveProviderDiscountPlan(dbs.staff.db, { ...key, providerPlanId: "plan_second" })).toBe("plan_first");
    expect(await findProviderDiscountPlan(dbs.staff.db, key)).toBe("plan_first");
  });
});

describe("affiliate sign-in", () => {
  const AFFILIATE_USER = "affiliate-user";

  async function seedAffiliateWithEmail(email: string | null): Promise<string> {
    const affiliate = await createAffiliate(dbs.staff.db, {
      name: "Asha Nair",
      email,
      phone: email === null ? "+919876543210" : null,
      reward: { kind: "percent", basisPoints: 1000 },
      rewardCurrency: null,
      rewardCycles: null,
      notes: null,
      createdByStaffId: STAFF_USER,
    });
    return affiliate.id;
  }

  async function seedAccount(id: string): Promise<void> {
    await dbs.owner.db.insert(users).values({ id, name: "Asha", email: `${id}@example.com`, emailVerified: true });
  }

  it("opens a link that names the affiliate, and keeps only a hash of its token", async () => {
    const id = await seedAffiliateWithEmail("asha@example.com");
    const issued = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: id, expiresInDays: 7, now: NOW });
    if (issued.kind !== "issued") throw new Error("expected a link");

    const stored = await dbs.owner.db.select().from(affiliates).where(eq(affiliates.id, id));
    expect(stored[0]?.loginTokenHash).not.toBeNull();
    expect(stored[0]?.loginTokenHash).not.toContain(issued.token);

    const invite = await findAffiliateLoginInvite(dbs.staff.db, issued.token, NOW);
    expect(invite).toEqual({ affiliateId: id, name: "Asha Nair", email: "asha@example.com", userId: null });
    expect(await findAffiliateLoginState(dbs.staff.db, id, NOW)).toEqual({ signedUp: false, linkExpiresAt: issued.expiresAt });
  });

  it("gives an affiliate with no email no link", async () => {
    const id = await seedAffiliateWithEmail(null);
    expect(await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: id, expiresInDays: 7 })).toEqual({ kind: "no-email" });
    expect(await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: "not-an-id", expiresInDays: 7 })).toEqual({ kind: "not-found" });
  });

  it("stops a link working when it expires or a newer one replaces it", async () => {
    const id = await seedAffiliateWithEmail("asha@example.com");
    const first = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: id, expiresInDays: 7, now: NOW });
    const second = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: id, expiresInDays: 7, now: NOW });
    if (first.kind !== "issued" || second.kind !== "issued") throw new Error("expected links");

    expect(await findAffiliateLoginInvite(dbs.staff.db, first.token, NOW)).toBeNull();
    expect(await findAffiliateLoginInvite(dbs.staff.db, second.token, NOW)).not.toBeNull();
    const later = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    expect(await findAffiliateLoginInvite(dbs.staff.db, second.token, later)).toBeNull();
    expect(await findAffiliateLoginState(dbs.staff.db, id, later)).toEqual({ signedUp: false, linkExpiresAt: null });
  });

  it("ties the affiliate to the account that follows the link, once", async () => {
    const id = await seedAffiliateWithEmail("asha@example.com");
    await seedAccount(AFFILIATE_USER);
    const issued = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: id, expiresInDays: 7, now: NOW });
    if (issued.kind !== "issued") throw new Error("expected a link");

    expect(await claimAffiliateLoginLink(dbs.staff.db, { token: issued.token, userId: AFFILIATE_USER, now: NOW })).toBe("claimed");
    expect(await claimAffiliateLoginLink(dbs.staff.db, { token: issued.token, userId: AFFILIATE_USER, now: NOW })).toBe("closed");
    expect(await findAffiliateLoginInvite(dbs.staff.db, issued.token, NOW)).toBeNull();
    expect((await findAffiliateByUserId(dbs.staff.db, AFFILIATE_USER))?.id).toBe(id);
    expect(await findAffiliateLoginState(dbs.staff.db, id, NOW)).toEqual({ signedUp: true, linkExpiresAt: null });
    expect(await findAffiliateByUserId(dbs.staff.db, "someone-else")).toBeNull();
  });

  it("offers a signed-up affiliate a link that resets their password, and never claims for a different affiliate's account", async () => {
    const first = await seedAffiliateWithEmail("asha@example.com");
    await seedAccount(AFFILIATE_USER);
    const firstLink = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: first, expiresInDays: 7, now: NOW });
    if (firstLink.kind !== "issued") throw new Error("expected a link");
    await claimAffiliateLoginLink(dbs.staff.db, { token: firstLink.token, userId: AFFILIATE_USER, now: NOW });

    const again = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: first, expiresInDays: 7, now: NOW });
    if (again.kind !== "issued") throw new Error("expected a link");
    expect((await findAffiliateLoginInvite(dbs.staff.db, again.token, NOW))?.userId).toBe(AFFILIATE_USER);

    const second = await seedAffiliateWithEmail("other@example.com");
    const secondLink = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: second, expiresInDays: 7, now: NOW });
    if (secondLink.kind !== "issued") throw new Error("expected a link");
    expect(await claimAffiliateLoginLink(dbs.staff.db, { token: secondLink.token, userId: AFFILIATE_USER, now: NOW })).toBe("user-taken");
    // The link stays open for the right account.
    expect(await findAffiliateLoginInvite(dbs.staff.db, secondLink.token, NOW)).not.toBeNull();
  });

  it("serializes a concurrent credential reset and consumes the link once", async () => {
    const id = await seedAffiliateWithEmail("asha@example.com");
    await seedAccount(AFFILIATE_USER);
    await dbs.owner.db.insert(accounts).values({ id: "credential", accountId: AFFILIATE_USER, providerId: "credential", userId: AFFILIATE_USER, password: "old-hash" });
    await dbs.owner.db.insert(sessions).values({ id: "session", token: "session-token", userId: AFFILIATE_USER, expiresAt: new Date(NOW.getTime() + 1000) });
    await dbs.staff.db.update(affiliates).set({ userId: AFFILIATE_USER }).where(eq(affiliates.id, id));
    const issued = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: id, expiresInDays: 7, now: NOW });
    if (issued.kind !== "issued") throw new Error("expected a link");
    let mutations = 0;
    const redeem = (hash: string) => dbs.staff.db.transaction(async (tx) => {
      const invite = await findAffiliateLoginInvite(tx, issued.token, NOW, "update");
      if (invite?.userId === undefined || invite.userId === null) return "closed";
      expect(await claimAffiliateLoginLink(tx, { token: issued.token, userId: invite.userId, now: NOW })).toBe("claimed");
      await resetAffiliateCredentialPassword(tx, invite.userId, hash);
      mutations += 1;
      return "claimed";
    });
    const results = await Promise.all([redeem("first-hash"), redeem("second-hash")]);
    expect([...results].sort()).toEqual(["claimed", "closed"]);
    expect(mutations).toBe(1);
    expect(await findAffiliateLoginInvite(dbs.staff.db, issued.token, NOW)).toBeNull();
    expect(await dbs.owner.db.select().from(sessions).where(eq(sessions.userId, AFFILIATE_USER))).toHaveLength(0);
    const stored = await dbs.owner.db.select({ password: accounts.password }).from(accounts).where(eq(accounts.id, "credential"));
    expect(stored[0]?.password).toBe(results[0] === "claimed" ? "first-hash" : "second-hash");
  });

  it("rolls back the credential, sessions and claimed token when reset fails", async () => {
    const id = await seedAffiliateWithEmail("asha@example.com");
    await seedAccount(AFFILIATE_USER);
    await dbs.owner.db.insert(accounts).values({ id: "credential", accountId: AFFILIATE_USER, providerId: "credential", userId: AFFILIATE_USER, password: "old-hash" });
    await dbs.owner.db.insert(sessions).values({ id: "session", token: "session-token", userId: AFFILIATE_USER, expiresAt: new Date(NOW.getTime() + 1000) });
    await dbs.staff.db.update(affiliates).set({ userId: AFFILIATE_USER }).where(eq(affiliates.id, id));
    const issued = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: id, expiresInDays: 7, now: NOW });
    if (issued.kind !== "issued") throw new Error("expected a link");
    await expect(dbs.staff.db.transaction(async (tx) => {
      await findAffiliateLoginInvite(tx, issued.token, NOW, "update");
      await claimAffiliateLoginLink(tx, { token: issued.token, userId: AFFILIATE_USER, now: NOW });
      await resetAffiliateCredentialPassword(tx, AFFILIATE_USER, "new-hash");
      throw new Error("reset aborted");
    })).rejects.toThrow("reset aborted");
    expect(await findAffiliateLoginInvite(dbs.staff.db, issued.token, NOW)).not.toBeNull();
    expect(await dbs.owner.db.select().from(sessions).where(eq(sessions.userId, AFFILIATE_USER))).toHaveLength(1);
    const stored = await dbs.owner.db.select({ password: accounts.password }).from(accounts).where(eq(accounts.id, "credential"));
    expect(stored[0]?.password).toBe("old-hash");
  });

  it.each(["missing", "empty", "ambiguous"])("refuses a %s credential and restores the claimed link", async (state) => {
    const id = await seedAffiliateWithEmail("asha@example.com");
    await seedAccount(AFFILIATE_USER);
    await dbs.staff.db.update(affiliates).set({ userId: AFFILIATE_USER }).where(eq(affiliates.id, id));
    if (state !== "missing") {
      await dbs.owner.db.insert(accounts).values({ id: "credential", accountId: AFFILIATE_USER, providerId: "credential", userId: AFFILIATE_USER, password: state === "empty" ? null : "old-hash" });
    }
    if (state === "ambiguous") {
      await dbs.owner.db.insert(accounts).values({ id: "duplicate-credential", accountId: AFFILIATE_USER, providerId: "credential", userId: AFFILIATE_USER, password: "another-hash" });
    }
    await dbs.owner.db.insert(accounts).values({ id: "external-provider", accountId: AFFILIATE_USER, providerId: "external", userId: AFFILIATE_USER, password: "provider-data" });
    const issued = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: id, expiresInDays: 7, now: NOW });
    if (issued.kind !== "issued") throw new Error("expected a link");
    await expect(dbs.staff.db.transaction(async (tx) => {
      await findAffiliateLoginInvite(tx, issued.token, NOW, "update");
      await claimAffiliateLoginLink(tx, { token: issued.token, userId: AFFILIATE_USER, now: NOW });
      await resetAffiliateCredentialPassword(tx, AFFILIATE_USER, "new-hash");
    })).rejects.toThrow("exactly one existing password credential");
    expect(await findAffiliateLoginInvite(dbs.staff.db, issued.token, NOW)).not.toBeNull();
    const stored = await dbs.owner.db.select({ password: accounts.password }).from(accounts).where(eq(accounts.id, "external-provider"));
    expect(stored[0]?.password).toBe("provider-data");
  });

  it("marks the affiliates who have a sign-in in the list", async () => {
    const withLogin = await seedAffiliateWithEmail("asha@example.com");
    await seedAffiliateWithEmail("other@example.com");
    await seedAccount(AFFILIATE_USER);
    const issued = await issueAffiliateLoginLink(dbs.staff.db, { affiliateId: withLogin, expiresInDays: 7, now: NOW });
    if (issued.kind !== "issued") throw new Error("expected a link");
    await claimAffiliateLoginLink(dbs.staff.db, { token: issued.token, userId: AFFILIATE_USER, now: NOW });

    const listed = await listAffiliates(dbs.staff.db, 10);
    expect(Object.fromEntries(listed.map((row) => [row.id, row.signedUp]))).toEqual({
      [withLogin]: true,
      ...Object.fromEntries(listed.filter((row) => row.id !== withLogin).map((row) => [row.id, false])),
    });
    expect(listed.filter((row) => row.signedUp)).toHaveLength(1);
  });

  it("refuses a link with only one of its two columns set", async () => {
    const id = await seedAffiliateWithEmail("asha@example.com");
    const message = await captureErrorText(dbs.staff.db.update(affiliates).set({ loginTokenHash: "x" }).where(eq(affiliates.id, id)));
    expect(message).toContain("affiliates_login_token_check");
  });
});

/** A second business that can pay, for tests that need more than one member. */
async function secondBusiness(): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "second-cafe", name: "Second Cafe", currency: "INR" }).returning({ id: businesses.id });
  return rows[0]?.id ?? "";
}

/** A renewal paid on a subscription, which takes the subscription's frozen discount off again. */
async function renew(subscriptionId: string, forBusiness: string, suffix: string): Promise<string> {
  const recorded = await recordPaymentAndActivate(dbs.staff.db, {
    businessId: forBusiness,
    subscriptionId,
    provider: "fake",
    providerPaymentId: `fake_pay_renewal_${suffix}`,
    kind: "renewal",
    amountCents: 100_000,
    currency: "INR",
    paidAt: NOW,
    paidThroughAt: NOW,
    commitmentEndsAt: NOW,
    currentPeriodEnd: NOW,
  });
  return recorded.payment.id;
}

describe("payouts that withhold something", () => {
  const base = (affiliateId: string) => ({
    affiliateId,
    currency: "INR" as const,
    paidOn: "2026-10-06",
    reference: "UTR9",
    recordedByStaffId: STAFF_USER,
  });

  it("records what was withheld and why, and the affiliate received the rest", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const { paymentId } = await payOnCode(codeId, 50_000, "a");
    await earn(affiliateId, codeId, paymentId, 20_000);
    const shown = await listOwedEarningIds(dbs.staff.db, affiliateId, "INR");

    const outcome = await recordAffiliatePayout(dbs.staff.db, { ...base(affiliateId), earningIds: shown, withheldCents: 2_000, withheldReason: "  TDS at 10%  " });

    expect(outcome).toMatchObject({ kind: "recorded", amountCents: 20_000 });
    expect(await listAffiliatePayouts(dbs.staff.db, affiliateId, 10)).toMatchObject([
      { amountCents: 20_000, withheldCents: 2_000, withheldReason: "TDS at 10%" },
    ]);
  });

  it("refuses to withhold nothing with a reason, a reason-less amount, or the whole payout, and writes nothing", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const { paymentId } = await payOnCode(codeId, 50_000, "a");
    await earn(affiliateId, codeId, paymentId, 20_000);
    const shown = await listOwedEarningIds(dbs.staff.db, affiliateId, "INR");
    const record = (withheldCents: number, withheldReason: string | null) =>
      recordAffiliatePayout(dbs.staff.db, { ...base(affiliateId), earningIds: shown, withheldCents, withheldReason });

    for (const [cents, reason] of [[0, "a reason with nothing withheld"], [2_000, null], [2_000, "   "], [20_000, "the lot"], [25_000, "more than the lot"], [-1, "negative"]] as const) {
      expect(await record(cents, reason)).toEqual({ kind: "bad-withheld" });
    }
    expect(await listAffiliatePayouts(dbs.staff.db, affiliateId, 10)).toEqual([]);
    expect(await listOwedEarningIds(dbs.staff.db, affiliateId, "INR")).toEqual(shown);
  });

  it("is held to the same rule by the table itself", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const { paymentId } = await payOnCode(codeId, 50_000, "a");
    await earn(affiliateId, codeId, paymentId, 20_000);
    await recordAffiliatePayout(dbs.staff.db, {
      ...base(affiliateId),
      earningIds: await listOwedEarningIds(dbs.staff.db, affiliateId, "INR"),
      withheldCents: 0,
      withheldReason: null,
    });
    // Through the owner connection: staff may only write a payout once, never change it, so this reaches the table's check.
    const message = await captureErrorText(dbs.owner.db.update(affiliatePayouts).set({ withheldCents: 20_000, withheldReason: "x" }).where(eq(affiliatePayouts.affiliateId, affiliateId)));
    expect(message).toContain("affiliate_payouts_withheld_check");
  });
});

describe("findAffiliateCashOut", () => {
  it("shows ₹10,000 cashed out, ₹2,000 withheld and ₹8,000 received, with what is still pending and what was cancelled", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const a = await payOnCode(codeId, 50_000, "a");
    await earn(affiliateId, codeId, a.paymentId, 600_000);
    const renewal = await renew(a.subscriptionId, businessId, "1");
    await earn(affiliateId, codeId, renewal, 400_000);
    await recordAffiliatePayout(dbs.staff.db, {
      affiliateId,
      currency: "INR",
      earningIds: await listOwedEarningIds(dbs.staff.db, affiliateId, "INR"),
      paidOn: "2026-10-06",
      reference: "UTR10K",
      withheldCents: 200_000,
      withheldReason: "TDS",
      recordedByStaffId: STAFF_USER,
    });
    // After the payout: one month earns 3,000 and stays pending, and another is earned and then cancelled (a refund).
    const next = await renew(a.subscriptionId, businessId, "2");
    await earn(affiliateId, codeId, next, 300_000);
    const refunded = await renew(a.subscriptionId, businessId, "3");
    await earn(affiliateId, codeId, refunded, 100_000);
    const owed = await listAffiliateEarnings(dbs.staff.db, affiliateId, 10);
    const refundedEarning = owed.find((earning) => earning.amountCents === 100_000);
    await cancelAffiliateEarning(dbs.staff.db, { affiliateId, earningId: refundedEarning?.id ?? "", staffUserId: STAFF_USER, now: NOW });

    expect(await findAffiliateCashOut(dbs.staff.db, affiliateId)).toEqual([
      {
        currency: "INR",
        earnedCents: 1_300_000,
        pendingCents: 300_000,
        cashedOutCents: 1_000_000,
        withheldCents: 200_000,
        receivedCents: 800_000,
        cancelledCents: 100_000,
      },
    ]);
  });

  it("is empty for an affiliate with nothing yet, and for an id that is not one", async () => {
    const affiliateId = await seedAffiliate();
    expect(await findAffiliateCashOut(dbs.staff.db, affiliateId)).toEqual([]);
    expect(await findAffiliateCashOut(dbs.staff.db, "not-an-id")).toEqual([]);
  });
});

describe("listAffiliateCodeUsage", () => {
  it("counts the members who paid on a code and the discount it has given across their payments", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const second = await secondBusiness();
    // Member one pays once; member two pays and renews: three payments, each taking ₹500 off.
    await payOnCode(codeId, 50_000, "one");
    const two = await payOnCode(codeId, 50_000, "two", second);
    await renew(two.subscriptionId, second, "two");

    expect(await listAffiliateCodeUsage(dbs.staff.db, affiliateId)).toEqual([
      { codeId, members: 2, payments: 3, discountGivenCents: 150_000 },
    ]);
  });

  it("does not count a payment that was refunded: its discount went back with the money", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const one = await payOnCode(codeId, 50_000, "one");
    await earn(affiliateId, codeId, one.paymentId, 20_000);
    const renewal = await renew(one.subscriptionId, businessId, "one");
    await earn(affiliateId, codeId, renewal, 20_000);
    expect((await listAffiliateCodeUsage(dbs.staff.db, affiliateId))[0]).toMatchObject({ payments: 2, discountGivenCents: 100_000 });

    // Staff cancel the renewal's earning because the member was refunded.
    const rows = await dbs.owner.db.select({ id: affiliateEarnings.id, paymentId: affiliateEarnings.paymentId }).from(affiliateEarnings);
    const renewalEarning = rows.find((row) => row.paymentId === renewal);
    await cancelAffiliateEarning(dbs.staff.db, { affiliateId, earningId: renewalEarning?.id ?? "", staffUserId: STAFF_USER, now: NOW });

    // The member still paid on the code, but only one payment was kept, so only one discount stands.
    expect(await listAffiliateCodeUsage(dbs.staff.db, affiliateId)).toEqual([{ codeId, members: 1, payments: 1, discountGivenCents: 50_000 }]);
  });

  it("sums the discount each payment was billed with, so a discount that ended or changed is counted at what it was", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const first = await payOnCode(codeId, 50_000, "one");
    // The code's months ran out: the second renewal took nothing off, and the first took a repriced ₹800.
    const repriced = await renew(first.subscriptionId, businessId, "one-b");
    const full = await renew(first.subscriptionId, businessId, "one-c");
    // An older payment, from before the basis was kept, counts at the discount frozen on the subscription.
    await renew(first.subscriptionId, businessId, "one-d");
    const basis = (discountAmountCents: number) => ({ netAmountCents: 0, discountAmountCents, retentionDiscountCents: 0, lines: [] });
    await dbs.staff.db.transaction(async (tx) => {
      await savePaymentInvoiceBasis(tx, first.paymentId, basis(50_000));
      await savePaymentInvoiceBasis(tx, repriced, basis(80_000));
      await savePaymentInvoiceBasis(tx, full, basis(0));
    });

    expect(await listAffiliateCodeUsage(dbs.staff.db, affiliateId)).toEqual([{ codeId, members: 1, payments: 4, discountGivenCents: 180_000 }]);
  });

  it("leaves out a business that has not paid, and another affiliate's codes", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_unpaid",
      referralCodeId: codeId,
      discountAmountCents: 50_000,
    });
    expect(await listAffiliateCodeUsage(dbs.staff.db, affiliateId)).toEqual([]);

    const other = await seedAffiliate();
    expect(await listAffiliateCodeUsage(dbs.staff.db, other)).toEqual([]);
  });
});

describe("listAffiliateMonthlyActivity", () => {
  /** A payment on the code, paid at `paidAt`, that earned `earned`. Returns the payment's id. */
  async function paidOn(opts: { codeId: string; affiliateId: string; subscriptionId: string; forBusiness: string; suffix: string; paidAt: string; earned: number }): Promise<string> {
    const at = new Date(opts.paidAt);
    const recorded = await recordPaymentAndActivate(dbs.staff.db, {
      businessId: opts.forBusiness,
      subscriptionId: opts.subscriptionId,
      provider: "fake",
      providerPaymentId: `fake_pay_m_${opts.suffix}`,
      kind: "renewal",
      amountCents: 100_000,
      currency: "INR",
      paidAt: at,
      paidThroughAt: at,
      commitmentEndsAt: at,
      currentPeriodEnd: at,
    });
    await insertAffiliateEarning(dbs.staff.db, {
      affiliateId: opts.affiliateId,
      referralCodeId: opts.codeId,
      businessId: opts.forBusiness,
      paymentId: recorded.payment.id,
      amountCents: opts.earned,
      currency: "INR",
      basisCents: 249_900,
      cycleNumber: 2,
    });
    return recorded.payment.id;
  }

  it("counts, for each month, the members who paid and kept it, what it earned, and what was refunded", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const second = await secondBusiness();
    const one = await payOnCode(codeId, 50_000, "one");
    const two = await payOnCode(codeId, 50_000, "two", second);
    const base = { codeId, affiliateId };
    // August: both members pay, 3,000 + 2,000 earned. September: one member pays twice (counts once), 1,500 + 500.
    // October: one pays and is refunded. November: nothing.
    const payments = [
      await paidOn({ ...base, subscriptionId: one.subscriptionId, forBusiness: businessId, suffix: "1", paidAt: "2026-08-10T10:00:00.000Z", earned: 300_000 }),
      await paidOn({ ...base, subscriptionId: two.subscriptionId, forBusiness: second, suffix: "2", paidAt: "2026-08-11T10:00:00.000Z", earned: 200_000 }),
      await paidOn({ ...base, subscriptionId: one.subscriptionId, forBusiness: businessId, suffix: "3", paidAt: "2026-09-02T10:00:00.000Z", earned: 150_000 }),
      await paidOn({ ...base, subscriptionId: one.subscriptionId, forBusiness: businessId, suffix: "4", paidAt: "2026-09-20T10:00:00.000Z", earned: 50_000 }),
      await paidOn({ ...base, subscriptionId: two.subscriptionId, forBusiness: second, suffix: "5", paidAt: "2026-10-05T10:00:00.000Z", earned: 120_000 }),
    ];
    const earnings = await dbs.owner.db.select({ id: affiliateEarnings.id, paymentId: affiliateEarnings.paymentId }).from(affiliateEarnings);
    const refundedEarning = earnings.find((row) => row.paymentId === payments[4]);
    await cancelAffiliateEarning(dbs.staff.db, { affiliateId, earningId: refundedEarning?.id ?? "", staffUserId: STAFF_USER, now: NOW });

    const months = await listAffiliateMonthlyActivity(dbs.staff.db, affiliateId, new Date("2026-08-01T00:00:00.000Z"));

    // The first payments (payOnCode) were made at NOW, in October 2026, so October also holds those two members.
    expect(months.filter((row) => row.month !== "2026-10")).toEqual([
      { month: "2026-08", currency: "INR", payingMembers: 2, cents: 500_000, refunded: 0 },
      { month: "2026-09", currency: "INR", payingMembers: 1, cents: 200_000, refunded: 0 },
    ]);
    // October: the two members' first payments (no earning written for them) kept, and one renewal refunded.
    expect(months.find((row) => row.month === "2026-10")).toMatchObject({ payingMembers: 2, cents: 0, refunded: 1 });
    expect(months.some((row) => row.month === "2026-11")).toBe(false);
  });

  it("puts a payment in India's month, leaves out payments before the start, and is empty for nobody", async () => {
    const affiliateId = await seedAffiliate();
    const codeId = await seedAffiliateCode(affiliateId);
    const one = await payOnCode(codeId, 50_000, "one");
    // 30 September 19:00 UTC is already 1 October in India.
    await paidOn({ codeId, affiliateId, subscriptionId: one.subscriptionId, forBusiness: businessId, suffix: "edge", paidAt: "2026-09-30T19:00:00.000Z", earned: 10_000 });
    await paidOn({ codeId, affiliateId, subscriptionId: one.subscriptionId, forBusiness: businessId, suffix: "old", paidAt: "2026-05-10T10:00:00.000Z", earned: 99_000 });

    const months = await listAffiliateMonthlyActivity(dbs.staff.db, affiliateId, new Date("2026-09-01T00:00:00.000Z"));
    expect(months.map((row) => row.month)).toEqual(["2026-10"]);
    expect(months[0]?.cents).toBe(10_000);

    expect(await listAffiliateMonthlyActivity(dbs.staff.db, await seedAffiliate(), new Date("2026-01-01T00:00:00.000Z"))).toEqual([]);
    expect(await listAffiliateMonthlyActivity(dbs.staff.db, "not-an-id", new Date("2026-01-01T00:00:00.000Z"))).toEqual([]);
  });
});
