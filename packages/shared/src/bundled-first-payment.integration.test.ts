import { chargedAmountCents, createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  users,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findProviderBundlePlan,
  findLatestSubscriptionForBusiness,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  completeBundledAddOnChanges,
  listAddOnsToContact,
  listBundledAddOnsForBusiness,
  markBundledAddOnContacted,
  keepBundledAddOn,
  recordBundledAddOnRemoval,
  openCheckoutSubscription,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import type { MonthlyAddOnId } from "./lib/billing/add-ons";
import { bundleLines } from "./lib/billing/bundle";
import { adCreditCentsFor, packageLines } from "./lib/billing/packages";
import { activateFirstPayment, activateRenewalPayment } from "./server/billing-activation";
import { ensureDiscountPlanFor } from "./server/discount-plans";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * The services taken at the first checkout are the whole charge, against a real database: the services plan costs
 * nothing, every one is at list, the provider runs one plan for the lines' total, no ad credit is frozen, and one payment turns the lines on, is invoiced with a line for each and is taken every month after.
 */

const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const NEXT_MONTH = new Date("2026-11-09T09:00:00.000Z");
const MONTH_AFTER = new Date("2026-12-09T09:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

function bundleOf(...ids: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(ids, plan.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
  }));
}

function openSubscription(
  bundledAddOns: readonly NewBundledAddOn[],
  replacing: string | null = null,
  providerSubscriptionId = `fake_sub_${"b".repeat(24)}`,
  adCreditCents = 0,
): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId,
    referralCodeId: null,
    discountAmountCents: 0,
    bundledAddOns,
    adCreditCents,
    replacing,
    now: PAID_AT,
  });
}

/** The fake provider, but one that names the plans it makes, as Razorpay does, so the bundle plan row is saved. */
function namingProvider(): BillingProvider {
  const fake = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => PAID_AT });
  return { ...fake, createPlan: async (input) => ({ providerPlanId: `plan_test_${input.netMonthlyCents}` }) };
}

/**
 * A first checkout as the app opens it (apps/platform lib/server/checkout.ts): the basket priced with packageLines, the
 * provider plan for the lines' total, the ad credit for services bought together, and what the provider asks for.
 */
async function firstCheckout(services: readonly MonthlyAddOnId[]) {
  const provider = namingProvider();
  const lines = packageLines({ services, forfeited: false }, plan.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
  }));
  const bundledAddOnNetCents = lines.reduce((total, line) => total + line.netAmountCents, 0);
  const providerPlanId = await ensureDiscountPlanFor(dbs.staff.db, provider, plan, 0, bundledAddOnNetCents);
  const started = await provider.startCheckout({ businessId, businessName: "QA Bundle Business", email: "owner@bundle.test", plan, bundledAddOnNetCents });
  const token = new URL(started.checkoutUrl, "https://app.test").searchParams.get("token") ?? "";
  const asked = (await provider.confirmCheckout({ token })).amountCents;
  const subscription = await openSubscription(lines, null, started.providerSubscriptionId, adCreditCentsFor(services, plan.currency));
  return { providerPlanId, bundledAddOnNetCents, asked, subscription };
}

function payFirst(subscription: Subscription, providerPaymentId = "fake_pay_bundle") {
  return dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      plan,
      provider: "fake",
      providerPaymentId,
      paidAt: PAID_AT,
      discountAmountCents: 0,
    }),
  );
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
  const found = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (found === null) throw new Error("No active INR services plan was seeded");
  plan = found;
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "qa-bundle", name: "QA Bundle Business", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a first checkout of a package", () => {
  it("charges all three at list on one provider plan for their total, with no ad credit", async () => {
    const { providerPlanId, bundledAddOnNetCents, asked, subscription } = await firstCheckout(["managed-website", "social-media", "paid-ads"]);

    expect(bundledAddOnNetCents).toBe(899_700);
    expect(providerPlanId).toBe("plan_test_899700");
    expect(await findProviderBundlePlan(dbs.staff.db, { planId: plan.id, netMonthlyCents: 899_700, provider: "fake" })).toBe("plan_test_899700");
    expect(asked).toBe(899_700);
    expect(subscription).toMatchObject({ bundledAddOnNetCents: 899_700, adCreditCents: 0 });

    const activation = await payFirst(subscription);
    expect(activation.payment.amountCents).toBe(899_700);
  });

  it("charges Social + Ads, the website's ?plan=social,ads, at list with no ad credit, and invoices a line for each", async () => {
    const { asked, subscription } = await firstCheckout(["social-media", "paid-ads"]);

    // Two plans at ₹2,999 each: ₹5,998 a month, GST included.
    expect(asked).toBe(599_800);
    expect(subscription).toMatchObject({ bundledAddOnNetCents: 599_800, adCreditCents: 0 });

    const activation = await payFirst(subscription);
    expect(activation.payment.amountCents).toBe(599_800);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
      ["Social Media Management", 299_900, 0],
      ["Paid Ads Management", 299_900, 0],
    ]);
    expect(invoice?.totalCents).toBe(599_800);
  });

  it("charges one service its list price, GST included, with no package and no ad credit", async () => {
    const { asked, subscription } = await firstCheckout(["social-media"]);

    expect(asked).toBe(299_900);
    expect(subscription).toMatchObject({ bundledAddOnNetCents: 299_900, adCreditCents: 0 });
  });
});

describe("a first payment with services", () => {
  it("freezes the add-ons on the subscription, as pending until it is paid", async () => {
    const subscription = await openSubscription(bundleOf("social-media", "paid-ads"));

    expect(subscription.bundledAddOnNetCents).toBe(299_900 + 299_900);
    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.status, row.netAmountCents])).toEqual([
      ["social-media", "pending", 299_900],
      ["paid-ads", "pending", 299_900],
    ]);
  });

  it("takes one payment for the services, turns them on, and invoices a line for each", async () => {
    const subscription = await openSubscription(bundleOf("social-media", "paid-ads"));
    const activation = await payFirst(subscription);

    // Social + Ads at list: 2 x ₹2,999 = ₹5,998, GST included.
    expect(activation.payment.amountCents).toBe(599_800);

    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.every((row) => row.status === "active" && row.activatedAt !== null)).toBe(true);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(599_800);
    expect(invoice?.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
      ["Social Media Management", 299_900, 0],
      ["Paid Ads Management", 299_900, 0],
    ]);
    expect(invoice?.cgstCents).toBe(invoice?.sgstCents);
  });

  it("does nothing more when the same payment is delivered again", async () => {
    const subscription = await openSubscription(bundleOf("social-media"));
    await payFirst(subscription);
    const again = await payFirst(subscription);

    expect(again.alreadyRecorded).toBe(true);
    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_bundle"))?.amountCents).toBe(
      chargedAmountCents(plan.initialAmountCents + 299_900, 0),
    );
  });

  it("drops the add-ons of a checkout that is replaced before anything was paid", async () => {
    const first = await openSubscription(bundleOf("social-media"));
    const second = await openSubscription(bundleOf("paid-ads"), first.id, `fake_sub_${"c".repeat(24)}`);

    expect((await findBundledAddOnsForSubscription(dbs.staff.db, first.id)).map((row) => row.status)).toEqual(["removed"]);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, second.id)).map((row) => row.status)).toEqual(["pending"]);
    expect((await findSubscriptionById(dbs.staff.db, second.id))?.bundledAddOnNetCents).toBe(299_900);
  });

  it("invoices the renewal with the same service lines, at the same amount", async () => {
    const subscription = await openSubscription(bundleOf("social-media"));
    await payFirst(subscription);
    const open = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    if (open?.commitmentEndsAt == null) throw new Error("The first payment did not open the subscription");
    const active = (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).filter((row) => row.status === "active");

    const amountCents = chargedAmountCents(plan.recurringAmountCents + 299_900, 0);
    const renewal = await dbs.staff.db.transaction((tx) =>
      activateRenewalPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt: open.commitmentEndsAt ?? NEXT_MONTH,
        provider: "fake",
        providerPaymentId: "fake_pay_bundle_renewal",
        amountCents,
        currency: "INR",
        paidAt: NEXT_MONTH,
        paidThroughAt: MONTH_AFTER,
        periodStart: NEXT_MONTH,
        invoicedPrice: { plan, bundledAddOns: active, netAmountCents: plan.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id);
    expect(invoice?.totalCents).toBe(amountCents);
    expect(invoice?.lines.map((line) => line.description)).toEqual(["Social Media Management"]);
  });

  describe("taking an add-on out afterwards", () => {
    async function paidWithTwo() {
      const subscription = await openSubscription(bundleOf("social-media", "paid-ads"));
      await payFirst(subscription);
      const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
      const growth = rows.find((row) => row.addOn === "social-media");
      if (growth === undefined) throw new Error("Social Media Management was not bundled");
      return { subscription, rows, growth };
    }

    it("keeps the add-on billed and active until the renewal, and carries the lower amount the renewal must arrive at", async () => {
      const { subscription, growth } = await paidWithTwo();

      expect(await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 299_900, now: NEXT_MONTH })).toBe(true);

      const after = await findSubscriptionById(dbs.staff.db, subscription.id);
      expect(after).toMatchObject({ bundledAddOnNetCents: 599_800, pendingBundledAddOnNetCents: 299_900 });
      const row = (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).find((candidate) => candidate.id === growth.id);
      expect(row).toMatchObject({ status: "active", endRequestedAt: NEXT_MONTH });
    });

    it("keeps the customer's reason on the line, and a keep clears it", async () => {
      const { subscription, growth } = await paidWithTwo();
      const reason = "We are moving our ads in-house.";
      expect(
        await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 299_900, now: NEXT_MONTH, endReason: reason }),
      ).toBe(true);
      const ending = (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).find((candidate) => candidate.id === growth.id);
      expect(ending).toMatchObject({ endRequestedAt: NEXT_MONTH, endReason: reason });

      expect(await dbs.staff.db.transaction((tx) => keepBundledAddOn(tx, { id: growth.id, businessId, now: NEXT_MONTH }))).toBe(true);
      const kept = (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).find((candidate) => candidate.id === growth.id);
      expect(kept).toMatchObject({ endRequestedAt: null, endReason: null });
    });

    it("ignores a second request for the same add-on", async () => {
      const { growth } = await paidWithTwo();
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 299_900, now: NEXT_MONTH });

      expect(await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 299_900, now: MONTH_AFTER })).toBe(false);
    });

    it("refuses another business's add-on", async () => {
      const { growth } = await paidWithTwo();
      const other = await dbs.owner.db.insert(businesses).values({ slug: "qa-other", name: "Other", currency: "INR" }).returning({ id: businesses.id });

      expect(await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId: other[0]?.id ?? "", pendingBundledAddOnNetCents: 0, now: NEXT_MONTH })).toBe(false);
    });

    it("stops the add-on and makes the lower amount the billed one once the renewal is recorded", async () => {
      const { subscription, growth } = await paidWithTwo();
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 299_900, now: NEXT_MONTH });

      await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: MONTH_AFTER }));

      const after = await findSubscriptionById(dbs.staff.db, subscription.id);
      expect(after).toMatchObject({ bundledAddOnNetCents: 299_900, pendingBundledAddOnNetCents: null });
      const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
      expect(rows.map((row) => [row.addOn, row.status])).toEqual([
        ["social-media", "removed"],
        ["paid-ads", "active"],
      ]);
    });

    it("takes the last add-on out to nothing", async () => {
      const subscription = await openSubscription(bundleOf("social-media"));
      await payFirst(subscription);
      const [only] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
      if (only === undefined) throw new Error("Nothing was bundled");

      expect(await recordBundledAddOnRemoval(dbs.staff.db, { id: only.id, businessId, pendingBundledAddOnNetCents: 0, now: NEXT_MONTH })).toBe(true);
      await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: MONTH_AFTER }));

      expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 0, pendingBundledAddOnNetCents: null });
    });
  });

  describe("following up with the customer", () => {
    const STAFF = "staff-bundle";

    it("lists a paid add-on taken with the plan among what staff should get in touch about, until it is marked", async () => {
      await dbs.owner.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff@example.test", emailVerified: true });
      const subscription = await openSubscription(bundleOf("paid-ads"));
      expect(await listAddOnsToContact(dbs.staff.db, 10)).toEqual([]);

      await payFirst(subscription);
      expect(await listAddOnsToContact(dbs.staff.db, 10)).toMatchObject([{ kind: "bundled", businessId, addOn: "paid-ads", at: PAID_AT }]);

      const [row] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
      await markBundledAddOnContacted(dbs.staff.db, { id: row?.id ?? "", businessId, staffUserId: STAFF, now: NEXT_MONTH });
      expect(await listAddOnsToContact(dbs.staff.db, 10)).toEqual([]);
    });

    it("leaves the Website Management out, since the build is not an add-on to start", async () => {
      const subscription = await openSubscription(bundleOf("managed-website", "paid-ads"));
      await payFirst(subscription);

      const list = await listAddOnsToContact(dbs.staff.db, 10);
      expect(list.map((item) => item.addOn)).toEqual(["paid-ads"]);
      expect(await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).toHaveLength(2);
    });

    it("marks a paid add-on contacted once, and not one that was never paid", async () => {
      await dbs.owner.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff@example.test", emailVerified: true });
      const subscription = await openSubscription(bundleOf("social-media"));
      const [unpaid] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
      if (unpaid === undefined) throw new Error("Nothing was bundled");
      expect(await markBundledAddOnContacted(dbs.staff.db, { id: unpaid.id, businessId, staffUserId: STAFF, now: NEXT_MONTH })).toBe(false);

      await payFirst(subscription);
      expect(await markBundledAddOnContacted(dbs.staff.db, { id: unpaid.id, businessId, staffUserId: STAFF, now: NEXT_MONTH })).toBe(true);
      expect(await markBundledAddOnContacted(dbs.staff.db, { id: unpaid.id, businessId, staffUserId: STAFF, now: MONTH_AFTER })).toBe(false);
      expect((await listBundledAddOnsForBusiness(dbs.staff.db, businessId))[0]).toMatchObject({ contactedAt: NEXT_MONTH, contactedByStaffId: STAFF });
    });
  });
});
