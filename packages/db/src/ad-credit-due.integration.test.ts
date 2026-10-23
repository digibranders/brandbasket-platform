import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { markCancelRequested } from "./queries/account-closures";
import {
  findActivePlan,
  findSubscriptionById,
  openCheckoutSubscription,
  recordPaymentAndActivate,
  updateSubscriptionProviderStatus,
  type Plan,
} from "./queries/billing";
import {
  activateBundledAddOns,
  completeBundledAddOnChanges,
  endPackageOffer,
  findBundledAddOnsForSubscription,
  listAdCreditDue,
  recordBundledAddOnRemoval,
  type NewBundledAddOn,
} from "./queries/bundled-add-ons";
import { bundledAddOns, businesses, subscriptions } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

/**
 * The console's "Ad credit due this month" list: only subscriptions that are live and paid, since a cancelled row that
 * never took a payment keeps the credit it was opened with. Credit runs to the end of the paid month after a cancel request or
 * a dropped service, and stops there.
 */

const OPENED_AT = new Date("2026-10-21T10:00:00.000Z");
const PAID_THROUGH = new Date("2026-11-21T10:00:00.000Z");
const NOW = new Date("2026-10-25T10:00:00.000Z");

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

    expect(await listAdCreditDue(dbs.staff.db, NOW)).toEqual([
      expect.objectContaining({ businessName: "Asha Cafe", currency: "INR", adCreditCents: 200_000, paidThroughAt: PAID_THROUGH, services: ["managed-website", "digital-growth"] }),
      expect.objectContaining({ businessName: "Zed Studio", currency: "INR", adCreditCents: 200_000, paidThroughAt: PAID_THROUGH, services: ["managed-website", "digital-growth"] }),
    ]);
  });

  it("leaves out a subscription with no credit", async () => {
    await business("No Credit", { paid: true, adCreditCents: 0 });
    expect(await listAdCreditDue(dbs.staff.db, NOW)).toEqual([]);
  });

  it("leaves out a checkout that never took a payment, though it carries credit", async () => {
    await business("Unpaid", { paid: false, adCreditCents: 200_000 });
    expect(await listAdCreditDue(dbs.staff.db, NOW)).toEqual([]);
  });

  it("leaves out a cancelled subscription that carries credit", async () => {
    const { subscriptionId } = await business("Cancelled", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db.update(subscriptions).set({ status: "cancelled", cancelledAt: OPENED_AT }).where(eq(subscriptions.id, subscriptionId));
    expect(await listAdCreditDue(dbs.staff.db, NOW)).toEqual([]);
  });

  it("keeps an account that has asked to close in the list until the month it paid for ends", async () => {
    const { subscriptionId } = await business("Closing", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db.update(subscriptions).set({ cancelRequestedAt: OPENED_AT }).where(eq(subscriptions.id, subscriptionId));

    expect((await listAdCreditDue(dbs.staff.db, NOW)).map((row) => row.businessName)).toEqual(["Closing"]);
    expect(await listAdCreditDue(dbs.staff.db, new Date(PAID_THROUGH.getTime() + 1))).toEqual([]);
  });

  it("zeroes the credit when the provider's cancel of a requested close lands, but keeps it for a cancel nobody asked for", async () => {
    const asked = await business("Asked", { paid: true, adCreditCents: 200_000 });
    const revoked = await business("Revoked", { paid: true, adCreditCents: 200_000 });
    await markCancelRequested(dbs.staff.db, { subscriptionId: asked.subscriptionId, businessId: asked.businessId, now: OPENED_AT });
    for (const { subscriptionId } of [asked, revoked]) {
      const row = await findSubscriptionById(dbs.staff.db, subscriptionId);
      if (row === null) throw new Error("The subscription was not opened");
      await updateSubscriptionProviderStatus(dbs.staff.db, {
        provider: "fake",
        providerSubscriptionId: row.providerSubscriptionId,
        status: "cancelled",
        providerStatus: "cancelled",
        now: PAID_THROUGH,
      });
    }

    expect((await findSubscriptionById(dbs.staff.db, asked.subscriptionId))?.adCreditCents).toBe(0);
    // A revoked mandate is a lapse: a reactivation restores the credit, so the row keeps it. It is not listed, as it is cancelled.
    expect((await findSubscriptionById(dbs.staff.db, revoked.subscriptionId))?.adCreditCents).toBe(200_000);
    expect(await listAdCreditDue(dbs.staff.db, NOW)).toEqual([]);
  });

  it("keeps the credit through the paid month after a service is dropped, and ends it at the renewal that takes the line off", async () => {
    const { businessId, subscriptionId } = await business("Dropper", { paid: true, adCreditCents: 200_000 });
    const lines = await findBundledAddOnsForSubscription(dbs.staff.db, subscriptionId);
    const dropped = lines.find((row) => row.addOn === "digital-growth");
    const staying = lines.filter((row) => row.addOn !== "digital-growth");
    if (dropped === undefined) throw new Error("The Social Media and Ads line was not opened");
    await recordBundledAddOnRemoval(dbs.staff.db, { id: dropped.id, businessId, pendingBundledAddOnNetCents: 299_900, now: OPENED_AT });
    await dbs.staff.db.transaction((tx) =>
      endPackageOffer(tx, { businessId, subscriptionId, lines: staying.map((row) => ({ id: row.id, pendingOfferDiscountAmountCents: 0 })), now: OPENED_AT }),
    );

    expect((await findSubscriptionById(dbs.staff.db, subscriptionId))?.adCreditCents).toBe(200_000);
    expect((await listAdCreditDue(dbs.staff.db, NOW)).map((row) => row.businessName)).toEqual(["Dropper"]);

    await completeBundledAddOnChanges(dbs.staff.db, { subscriptionId, now: PAID_THROUGH });

    expect((await findSubscriptionById(dbs.staff.db, subscriptionId))?.adCreditCents).toBe(0);
    expect(await listAdCreditDue(dbs.staff.db, NOW)).toEqual([]);
  });

  it("leaves out a past due subscription whose paid period has run out, and lists one still inside it", async () => {
    const lapsed = await business("Lapsed", { paid: true, adCreditCents: 200_000 });
    const inside = await business("Inside", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db.update(subscriptions).set({ status: "past_due", paidThroughAt: new Date("2026-10-24T10:00:00.000Z") }).where(eq(subscriptions.id, lapsed.subscriptionId));
    await dbs.owner.db.update(subscriptions).set({ status: "past_due", paidThroughAt: new Date("2026-10-26T10:00:00.000Z") }).where(eq(subscriptions.id, inside.subscriptionId));

    const listed = await listAdCreditDue(dbs.staff.db, NOW);

    expect(listed.map((row) => row.businessName)).toEqual(["Inside"]);
    expect(listed[0]?.paidThroughAt).toEqual(new Date("2026-10-26T10:00:00.000Z"));
  });

  it("leaves out a subscription the provider has stopped billing", async () => {
    const { subscriptionId } = await business("Halted", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db.update(subscriptions).set({ status: "inactive" }).where(eq(subscriptions.id, subscriptionId));
    expect(await listAdCreditDue(dbs.staff.db, NOW)).toEqual([]);
  });

  it("names only the services still billed", async () => {
    const { subscriptionId } = await business("Dropped", { paid: true, adCreditCents: 200_000 });
    await dbs.owner.db
      .update(bundledAddOns)
      .set({ status: "removed", removedAt: OPENED_AT })
      .where(eq(bundledAddOns.subscriptionId, subscriptionId));
    const [row] = await listAdCreditDue(dbs.staff.db, NOW);
    expect(row?.services).toEqual([]);
  });
});
