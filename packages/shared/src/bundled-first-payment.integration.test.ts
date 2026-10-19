import { chargedAmountCents } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  users,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findLatestSubscriptionForBusiness,
  findLifetimeOfferStanding,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  bundledNetAfterRemoving,
  completeBundledAddOnChanges,
  listAddOnsToContact,
  listBundledAddOnsForBusiness,
  markBundledAddOnContacted,
  recordBundledAddOnRemoval,
  openCheckoutSubscription,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundleLines } from "./lib/billing/bundle";
import { activateFirstPayment, activateRenewalPayment } from "./server/billing-activation";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * The add-ons taken at the first checkout are billed in the plan's own charge, against a real database: one payment for
 * all of it, the add-ons turned on by it, an invoice with a line for each, and the same combined amount every month after.
 */

const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const NEXT_MONTH = new Date("2026-11-09T09:00:00.000Z");
const MONTH_AFTER = new Date("2026-12-09T09:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let care: Plan;

function bundleOf(...ids: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(ids, care.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: care.taxRateBasisPoints,
  }));
}

function openSubscription(bundledAddOns: readonly NewBundledAddOn[], replacing: string | null = null, providerSubscriptionId = `fake_sub_${"b".repeat(24)}`): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: care.id,
    provider: "fake",
    providerSubscriptionId,
    referralCodeId: null,
    discountAmountCents: 0,
    bundledAddOns,
    replacing,
    now: PAID_AT,
  });
}

function payFirst(subscription: Subscription, providerPaymentId = "fake_pay_bundle") {
  return dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      plan: care,
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
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR Managed Website plan was seeded");
  care = plan;
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "qa-bundle", name: "QA Bundle Business", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a first payment with add-ons", () => {
  it("freezes the add-ons on the subscription, as pending until it is paid", async () => {
    const subscription = await openSubscription(bundleOf("digital-growth", "local-seo-aeo"));

    expect(subscription.bundledAddOnNetCents).toBe(665_000 + 2_375_000);
    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.status, row.netAmountCents])).toEqual([
      ["digital-growth", "pending", 665_000],
      ["local-seo-aeo", "pending", 2_375_000],
    ]);
  });

  it("takes one payment for the plan and the add-ons, turns them on, and invoices a line for each", async () => {
    const subscription = await openSubscription(bundleOf("digital-growth", "local-seo-aeo"));
    const activation = await payFirst(subscription);

    const expected = chargedAmountCents(care.initialAmountCents + 665_000 + 2_375_000, 0, care.taxRateBasisPoints);
    expect(activation.payment.amountCents).toBe(expected);

    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.every((row) => row.status === "active" && row.activatedAt !== null)).toBe(true);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(expected);
    expect(invoice?.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
      [expect.stringContaining("Brandbasket"), care.initialAmountCents, 0],
      ["Digital Growth", 700_000, 35_000],
      ["Local SEO + AEO", 2_500_000, 125_000],
    ]);
    expect(invoice?.lines[1]?.note).toBe("Lifetime offer applied, 5% off");
    expect(invoice?.cgstCents).toBe(invoice?.sgstCents);
  });

  it("records the offer as claimed for each add-on taken, for good", async () => {
    await payFirst(await openSubscription(bundleOf("local-seo-aeo")));

    expect((await findLifetimeOfferStanding(dbs.staff.db, businessId)).claimed).toEqual(["local-seo-aeo"]);
  });

  it("does nothing more when the same payment is delivered again", async () => {
    const subscription = await openSubscription(bundleOf("digital-growth"));
    await payFirst(subscription);
    const again = await payFirst(subscription);

    expect(again.alreadyRecorded).toBe(true);
    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_bundle"))?.amountCents).toBe(
      chargedAmountCents(care.initialAmountCents + 665_000, 0, care.taxRateBasisPoints),
    );
  });

  it("drops the add-ons of a checkout that is replaced before anything was paid", async () => {
    const first = await openSubscription(bundleOf("digital-growth"));
    const second = await openSubscription(bundleOf("local-seo-aeo"), first.id, `fake_sub_${"c".repeat(24)}`);

    expect((await findBundledAddOnsForSubscription(dbs.staff.db, first.id)).map((row) => row.status)).toEqual(["removed"]);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, second.id)).map((row) => row.status)).toEqual(["pending"]);
    expect((await findSubscriptionById(dbs.staff.db, second.id))?.bundledAddOnNetCents).toBe(2_375_000);
  });

  it("invoices the renewal with the same add-on lines, at the same combined amount", async () => {
    const subscription = await openSubscription(bundleOf("digital-growth"));
    await payFirst(subscription);
    const open = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    if (open?.commitmentEndsAt == null) throw new Error("The first payment did not open the subscription");
    const active = (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).filter((row) => row.status === "active");

    const amountCents = chargedAmountCents(care.recurringAmountCents + 665_000, 0, care.taxRateBasisPoints);
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
        invoicedPrice: { plan: care, bundledAddOns: active, netAmountCents: care.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id);
    expect(invoice?.totalCents).toBe(amountCents);
    expect(invoice?.lines.map((line) => line.description)).toEqual([expect.stringContaining("Brandbasket"), "Digital Growth"]);
  });

  describe("taking an add-on out afterwards", () => {
    async function paidWithTwo() {
      const subscription = await openSubscription(bundleOf("digital-growth", "local-seo-aeo"));
      await payFirst(subscription);
      const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
      const growth = rows.find((row) => row.addOn === "digital-growth");
      if (growth === undefined) throw new Error("Digital Growth was not bundled");
      return { subscription, rows, growth };
    }

    it("works out what is left from the other add-ons that are not already going", async () => {
      const { rows, growth } = await paidWithTwo();
      expect(bundledNetAfterRemoving(rows, growth)).toBe(2_375_000);
    });

    it("keeps the add-on billed and active until the renewal, and carries the lower amount the renewal must arrive at", async () => {
      const { subscription, growth } = await paidWithTwo();

      expect(await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 2_375_000, now: NEXT_MONTH })).toBe(true);

      const after = await findSubscriptionById(dbs.staff.db, subscription.id);
      expect(after).toMatchObject({ bundledAddOnNetCents: 3_040_000, pendingBundledAddOnNetCents: 2_375_000 });
      const row = (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).find((candidate) => candidate.id === growth.id);
      expect(row).toMatchObject({ status: "active", endRequestedAt: NEXT_MONTH });
    });

    it("ignores a second request for the same add-on", async () => {
      const { growth } = await paidWithTwo();
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 2_375_000, now: NEXT_MONTH });

      expect(await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 2_375_000, now: MONTH_AFTER })).toBe(false);
    });

    it("refuses another business's add-on", async () => {
      const { growth } = await paidWithTwo();
      const other = await dbs.owner.db.insert(businesses).values({ slug: "qa-other", name: "Other", currency: "INR" }).returning({ id: businesses.id });

      expect(await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId: other[0]?.id ?? "", pendingBundledAddOnNetCents: 0, now: NEXT_MONTH })).toBe(false);
    });

    it("stops the add-on and makes the lower amount the billed one once the renewal is recorded", async () => {
      const { subscription, growth } = await paidWithTwo();
      await recordBundledAddOnRemoval(dbs.staff.db, { id: growth.id, businessId, pendingBundledAddOnNetCents: 2_375_000, now: NEXT_MONTH });

      await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: MONTH_AFTER }));

      const after = await findSubscriptionById(dbs.staff.db, subscription.id);
      expect(after).toMatchObject({ bundledAddOnNetCents: 2_375_000, pendingBundledAddOnNetCents: null });
      const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
      expect(rows.map((row) => [row.addOn, row.status])).toEqual([
        ["digital-growth", "removed"],
        ["local-seo-aeo", "active"],
      ]);
      // The offer was earned, so it is still claimed for good.
      expect([...(await findLifetimeOfferStanding(dbs.staff.db, businessId)).claimed].sort()).toEqual(["digital-growth", "local-seo-aeo"]);
    });

    it("takes the last add-on out to nothing", async () => {
      const subscription = await openSubscription(bundleOf("digital-growth"));
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
      const subscription = await openSubscription(bundleOf("local-seo-aeo"));
      expect(await listAddOnsToContact(dbs.staff.db, 10)).toEqual([]);

      await payFirst(subscription);
      expect(await listAddOnsToContact(dbs.staff.db, 10)).toMatchObject([{ kind: "bundled", businessId, addOn: "local-seo-aeo", at: PAID_AT }]);

      const [row] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
      await markBundledAddOnContacted(dbs.staff.db, { id: row?.id ?? "", businessId, staffUserId: STAFF, now: NEXT_MONTH });
      expect(await listAddOnsToContact(dbs.staff.db, 10)).toEqual([]);
    });

    it("marks a paid add-on contacted once, and not one that was never paid", async () => {
      await dbs.owner.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff@example.test", emailVerified: true });
      const subscription = await openSubscription(bundleOf("digital-growth"));
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
