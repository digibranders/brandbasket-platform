import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, openCheckoutSubscription, recordPaymentAndActivate, type Plan } from "./queries/billing";
import { activateBundledAddOns, listAdCreditDue, type NewBundledAddOn } from "./queries/bundled-add-ons";
import { bundledAddOns, businesses, subscriptions } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

/**
 * The console's "Ad credit due this month" list: only subscriptions that are live and paid, since a cancelled row that
 * never took a payment keeps the credit it was opened with.
 */

const OPENED_AT = new Date("2026-10-21T10:00:00.000Z");
const PAID_THROUGH = new Date("2026-11-21T10:00:00.000Z");

const WEBSITE_AND_SOCIAL: readonly NewBundledAddOn[] = [
  { addOn: "managed-website", listAmountCents: 299_900, offerDiscountAmountCents: 59_980, netAmountCents: 239_920, taxRateBasisPoints: 1800 },
  { addOn: "digital-growth", listAmountCents: 999_900, offerDiscountAmountCents: 200_020, netAmountCents: 799_880, taxRateBasisPoints: 1800 },
];

let dbs: TestDatabases;
let plan: Plan;
let sequence = 0;

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  const found = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (found === null) throw new Error("No active INR plan was seeded");
  plan = found;
});

/** A business with a package checkout opened; paid when `paid`. Returns the ids to change it further. */
async function business(name: string, options: { readonly paid: boolean; readonly adCreditCents: number }) {
  sequence += 1;
  const [row] = await dbs.staff.db.insert(businesses).values({ slug: `ad-credit-${sequence}`, name, currency: "INR" }).returning({ id: businesses.id });
  const businessId = row?.id ?? "";
  const subscription = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_ad_credit_${sequence}`,
    bundledAddOns: WEBSITE_AND_SOCIAL,
    adCreditCents: options.adCreditCents,
    replacing: null,
    now: OPENED_AT,
  });
  if (options.paid) {
    await recordPaymentAndActivate(dbs.staff.db, {
      businessId,
      subscriptionId: subscription.id,
      provider: "fake",
      providerPaymentId: `fake_pay_ad_credit_${sequence}`,
      kind: "initial",
      amountCents: 1_226_964,
      currency: "INR",
      paidAt: OPENED_AT,
      paidThroughAt: PAID_THROUGH,
      commitmentEndsAt: PAID_THROUGH,
      currentPeriodEnd: PAID_THROUGH,
    });
    await activateBundledAddOns(dbs.staff.db, { subscriptionId: subscription.id, now: OPENED_AT });
  }
  return { businessId, subscriptionId: subscription.id };
}

describe("listAdCreditDue", () => {
  it("lists a live paid package with its services, credit and paid-through date, by business name", async () => {
    await business("Zed Studio", { paid: true, adCreditCents: 200_000 });
    await business("Asha Cafe", { paid: true, adCreditCents: 200_000 });

    expect(await listAdCreditDue(dbs.staff.db)).toEqual([
      expect.objectContaining({ businessName: "Asha Cafe", currency: "INR", adCreditCents: 200_000, currentPeriodEnd: PAID_THROUGH, services: ["managed-website", "digital-growth"] }),
      expect.objectContaining({ businessName: "Zed Studio", currency: "INR", adCreditCents: 200_000, currentPeriodEnd: PAID_THROUGH, services: ["managed-website", "digital-growth"] }),
    ]);
  });

  it("leaves out a subscription with no credit", async () => {
    await business("No Credit", { paid: true, adCreditCents: 0 });
    expect(await listAdCreditDue(dbs.staff.db)).toEqual([]);
  });

  it("leaves out a checkout that never took a payment, though it carries credit", async () => {
    await business("Unpaid", { paid: false, adCreditCents: 200_000 });
    expect(await listAdCreditDue(dbs.staff.db)).toEqual([]);
  });

  it("leaves out a cancelled subscription that carries credit", async () => {
    const { subscriptionId } = await business("Cancelled", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db.update(subscriptions).set({ status: "cancelled", cancelledAt: OPENED_AT }).where(eq(subscriptions.id, subscriptionId));
    expect(await listAdCreditDue(dbs.staff.db)).toEqual([]);
  });

  it("leaves out an account that has asked to close, though it may still carry credit", async () => {
    const { subscriptionId } = await business("Closing", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db.update(subscriptions).set({ cancelRequestedAt: OPENED_AT }).where(eq(subscriptions.id, subscriptionId));
    expect(await listAdCreditDue(dbs.staff.db)).toEqual([]);
  });

  it("leaves out a subscription the provider has stopped billing", async () => {
    const { subscriptionId } = await business("Halted", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db.update(subscriptions).set({ status: "inactive" }).where(eq(subscriptions.id, subscriptionId));
    expect(await listAdCreditDue(dbs.staff.db)).toEqual([]);
  });

  it("names only the services still billed", async () => {
    const { subscriptionId } = await business("Dropped", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db
      .update(bundledAddOns)
      .set({ status: "removed", removedAt: OPENED_AT })
      .where(eq(bundledAddOns.subscriptionId, subscriptionId));
    const [row] = await listAdCreditDue(dbs.staff.db);
    expect(row?.services).toEqual([]);
  });
});
