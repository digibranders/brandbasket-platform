import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, findSubscriptionById, openCheckoutSubscription, recordPaymentAndActivate, type Plan } from "./queries/billing";
import {
  activateBundledAddOns,
  completeBundledAddOnChanges,
  endPackageOffer,
  findBundledAddOnsForSubscription,
  findPackageOfferForfeitedAt,
  isPackageOfferForfeited,
  markPackageOfferForfeited,
  recordBundledAddOnRemoval,
  setPendingOfferDiscounts,
  type NewBundledAddOn,
} from "./queries/bundled-add-ons";
import { bundledAddOns, businesses, charges } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

/**
 * A subscription is a basket of services (docs/plans/16-platform-pricing-offers.md in the BrandBasket workspace): every
 * service is a line, the plan row costs nothing, a package bought together earns frozen ad credit, and dropping a service
 * from a package forfeits the offer on the business for good.
 */

const OPENED_AT = new Date("2026-10-21T10:00:00.000Z");
const PAID_THROUGH = new Date("2026-11-21T10:00:00.000Z");
const RENEWED_AT = new Date("2026-11-21T10:05:00.000Z");

/** All three services in rupees at the package's 20% off, the saving rounded down to a whole rupee with the difference on the dearest line (40 paise less discount there), as packageLines in @brandbasket/shared prices them. */
const ALL_THREE_INR: readonly NewBundledAddOn[] = [
  { addOn: "managed-website", listAmountCents: 299_900, offerDiscountAmountCents: 59_980, netAmountCents: 239_920, taxRateBasisPoints: 1800 },
  { addOn: "digital-growth", listAmountCents: 999_900, offerDiscountAmountCents: 199_980, netAmountCents: 799_920, taxRateBasisPoints: 1800 },
  { addOn: "local-seo-aeo", listAmountCents: 2_499_900, offerDiscountAmountCents: 499_940, netAmountCents: 1_999_960, taxRateBasisPoints: 1800 },
];

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

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
  const rows = await dbs.staff.db
    .insert(businesses)
    .values({ slug: "package-cafe", name: "Package Cafe", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
});

function openAllThree(adCreditCents: number) {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: "fake_sub_package",
    bundledAddOns: ALL_THREE_INR,
    adCreditCents,
    replacing: null,
    now: OPENED_AT,
  });
}

describe("opening a checkout for a package", () => {
  it("writes a line for each service, netting the package price, and freezes the ad credit", async () => {
    const subscription = await openAllThree(300_000);

    expect(subscription).toMatchObject({ bundledAddOnNetCents: 3_039_800, adCreditCents: 300_000, status: "incomplete" });
    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.listAmountCents, row.offerDiscountAmountCents, row.netAmountCents, row.status])).toEqual([
      ["managed-website", 299_900, 59_980, 239_920, "pending"],
      ["digital-growth", 999_900, 199_980, 799_920, "pending"],
      ["local-seo-aeo", 2_499_900, 499_940, 1_999_960, "pending"],
    ]);
    expect(rows.reduce((total, row) => total + row.netAmountCents, 0)).toBe(3_039_800);
  });

  it("gives a checkout opened without ad credit none", async () => {
    const subscription = await openCheckoutSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_website",
      bundledAddOns: ALL_THREE_INR.slice(0, 1).map((line) => ({ ...line, offerDiscountAmountCents: 0, netAmountCents: line.listAmountCents })),
      replacing: null,
      now: OPENED_AT,
    });
    expect(subscription).toMatchObject({ bundledAddOnNetCents: 299_900, adCreditCents: 0 });
  });
});

describe("markPackageOfferForfeited", () => {
  async function forfeitedAt(): Promise<Date | null> {
    const rows = await dbs.staff.db
      .select({ at: businesses.packageOfferForfeitedAt })
      .from(businesses)
      .where(eq(businesses.id, businessId));
    return rows[0]?.at ?? null;
  }

  it("sets the time once, and a second call keeps the first", async () => {
    expect(await forfeitedAt()).toBeNull();
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(false);

    expect(await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, businessId, OPENED_AT))).toBe(true);
    expect(await forfeitedAt()).toEqual(OPENED_AT);
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(true);
    expect(await findPackageOfferForfeitedAt(dbs.staff.db, businessId)).toEqual(OPENED_AT);

    expect(await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, businessId, RENEWED_AT))).toBe(false);
    expect(await forfeitedAt()).toEqual(OPENED_AT);
  });

  it("does nothing for a business that does not exist", async () => {
    expect(await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, "not-a-uuid", OPENED_AT))).toBe(false);
  });
});

describe("a line moving to another package offer", () => {
  async function paidAllThree() {
    const subscription = await openAllThree(300_000);
    await recordPaymentAndActivate(dbs.staff.db, {
      businessId,
      subscriptionId: subscription.id,
      provider: "fake",
      providerPaymentId: "fake_pay_package",
      kind: "initial",
      amountCents: 3_039_800,
      currency: "INR",
      paidAt: OPENED_AT,
      paidThroughAt: PAID_THROUGH,
      commitmentEndsAt: PAID_THROUGH,
      currentPeriodEnd: PAID_THROUGH,
    });
    await activateBundledAddOns(dbs.staff.db, { subscriptionId: subscription.id, now: OPENED_AT });
    return subscription;
  }

  it("keeps its price until the renewal at the pending amount is recorded, then takes the pending discount as its own", async () => {
    const subscription = await paidAllThree();
    const [website, growth] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    if (website === undefined || growth === undefined) throw new Error("The package lines were not written");

    // Local SEO + AEO is dropped and the offer forfeited: the website and Social Media and Ads go back to list price.
    await dbs.staff.db.transaction((tx) =>
      setPendingOfferDiscounts(tx, {
        subscriptionId: subscription.id,
        lines: [
          { id: website.id, pendingOfferDiscountAmountCents: 0 },
          { id: growth.id, pendingOfferDiscountAmountCents: 0 },
        ],
        now: OPENED_AT,
      }),
    );
    const pending = await findSubscriptionById(dbs.staff.db, subscription.id);
    expect(pending).toMatchObject({ bundledAddOnNetCents: 3_039_800 });
    // The SEO line is still billed until the renewal: it has not been asked to end in this test.
    expect(pending?.pendingBundledAddOnNetCents).toBe(299_900 + 999_900 + 1_999_960);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).map((row) => row.offerDiscountAmountCents)).toEqual([
      59_980, 199_980, 499_940,
    ]);

    await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: RENEWED_AT }));

    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.offerDiscountAmountCents, row.netAmountCents, row.pendingOfferDiscountAmountCents])).toEqual([
      ["managed-website", 0, 299_900, null],
      ["digital-growth", 0, 999_900, null],
      ["local-seo-aeo", 499_940, 1_999_960, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({
      bundledAddOnNetCents: 3_299_760,
      pendingBundledAddOnNetCents: null,
    });
  });

  it("refuses a line given twice and a line id that is not an id, naming the reason and writing none of the batch", async () => {
    const subscription = await paidAllThree();
    const [website] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    if (website === undefined) throw new Error("The package lines were not written");
    const pendingDiscounts = async () => (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).map((row) => row.pendingOfferDiscountAmountCents);
    const move = (lines: readonly { readonly id: string; readonly pendingOfferDiscountAmountCents: number }[], subscriptionId = subscription.id) =>
      dbs.staff.db.transaction((tx) => setPendingOfferDiscounts(tx, { subscriptionId, lines, now: OPENED_AT }));

    await expect(move([{ id: website.id, pendingOfferDiscountAmountCents: 0 }, { id: website.id, pendingOfferDiscountAmountCents: 0 }])).rejects.toThrow(/a line was given twice/);
    await expect(move([{ id: website.id, pendingOfferDiscountAmountCents: 0 }, { id: "not-a-uuid", pendingOfferDiscountAmountCents: 0 }])).rejects.toThrow(/not-a-uuid is not a line id/);
    await expect(move([{ id: website.id, pendingOfferDiscountAmountCents: 0 }], "not-a-uuid")).rejects.toThrow(/it is not a subscription id/);

    expect(await pendingDiscounts()).toEqual([null, null, null]);
  });

  it("refuses to move a line that is not an active line of the subscription staying in it, and writes none of the batch", async () => {
    const subscription = await paidAllThree();
    const [website, growth, seo] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    if (website === undefined || growth === undefined || seo === undefined) throw new Error("The package lines were not written");
    await recordBundledAddOnRemoval(dbs.staff.db, { id: seo.id, businessId, pendingBundledAddOnNetCents: 1_299_800, now: OPENED_AT });

    const move = dbs.staff.db.transaction((tx) =>
      setPendingOfferDiscounts(tx, {
        subscriptionId: subscription.id,
        lines: [
          { id: website.id, pendingOfferDiscountAmountCents: 0 },
          { id: seo.id, pendingOfferDiscountAmountCents: 0 },
        ],
        now: OPENED_AT,
      }),
    );

    await expect(move).rejects.toThrow(/could not be moved/);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).map((row) => row.pendingOfferDiscountAmountCents)).toEqual([null, null, null]);
  });
});

describe("ending the package offer", () => {
  it("closes every service still waiting for its charge and waives each charge, however many", async () => {
    const subscription = await openCheckoutSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "fake_sub_waiting",
      bundledAddOns: ALL_THREE_INR.slice(0, 1).map((line) => ({ ...line, offerDiscountAmountCents: 0, netAmountCents: line.listAmountCents })),
      replacing: null,
      now: OPENED_AT,
    });
    await activateBundledAddOns(dbs.staff.db, { subscriptionId: subscription.id, now: OPENED_AT });
    const waiting = [] as { readonly addOn: string; readonly chargeId: string }[];
    for (const addOn of ["digital-growth", "local-seo-aeo"]) {
      const inserted = await dbs.owner.db
        .insert(charges)
        .values({ businessId, kind: "add_on", description: addOn, quantity: 1, unitAmountCents: 100_000, taxRateBasisPoints: 1800, amountCents: 100_000, currency: "INR" })
        .returning({ id: charges.id });
      const chargeId = inserted[0]?.id ?? "";
      await dbs.owner.db.insert(bundledAddOns).values({ businessId, subscriptionId: subscription.id, addOn, listAmountCents: 100_000, netAmountCents: 100_000, taxRateBasisPoints: 1800, status: "pending", chargeId });
      waiting.push({ addOn, chargeId });
    }
    const [website] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    if (website === undefined) throw new Error("The website line was not written");

    await dbs.staff.db.transaction((tx) =>
      endPackageOffer(tx, { businessId, subscriptionId: subscription.id, lines: [{ id: website.id, pendingOfferDiscountAmountCents: 0 }], now: RENEWED_AT }),
    );

    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.status])).toEqual([
      ["managed-website", "active"],
      ["digital-growth", "removed"],
      ["local-seo-aeo", "removed"],
    ]);
    const statuses = await dbs.owner.db.select({ id: charges.id, status: charges.status }).from(charges);
    expect(waiting.map((entry) => statuses.find((charge) => charge.id === entry.chargeId)?.status)).toEqual(["waived", "waived"]);
    expect(await isPackageOfferForfeited(dbs.staff.db, businessId)).toBe(true);
  });
});
