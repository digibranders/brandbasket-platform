import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, findSubscriptionById, openCheckoutSubscription, recordPaymentAndActivate, type Plan } from "./queries/billing";
import {
  activateBundledAddOns,
  completeBundledAddOnChanges,
  findBundledAddOnsForSubscription,
  markPackageOfferForfeited,
  setPendingOfferDiscounts,
  type NewBundledAddOn,
} from "./queries/bundled-add-ons";
import { businesses } from "./schema";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

/**
 * A subscription is a basket of services (docs/plans/16-platform-pricing-offers.md in the BrandBasket workspace): every
 * service is a line, the plan row costs nothing, a package bought together earns frozen ad credit, and dropping a service
 * from a package forfeits the offer on the business for good.
 */

const OPENED_AT = new Date("2026-10-21T10:00:00.000Z");
const PAID_THROUGH = new Date("2026-11-21T10:00:00.000Z");
const RENEWED_AT = new Date("2026-11-21T10:05:00.000Z");

/** All three services in rupees at the package's 30% off, as packageLines in @brandbasket/shared prices them. */
const ALL_THREE_INR: readonly NewBundledAddOn[] = [
  { addOn: "managed-website", listAmountCents: 300_000, offerDiscountAmountCents: 90_000, netAmountCents: 210_000, taxRateBasisPoints: 1800 },
  { addOn: "digital-growth", listAmountCents: 1_000_000, offerDiscountAmountCents: 300_000, netAmountCents: 700_000, taxRateBasisPoints: 1800 },
  { addOn: "local-seo-aeo", listAmountCents: 2_500_000, offerDiscountAmountCents: 750_000, netAmountCents: 1_750_000, taxRateBasisPoints: 1800 },
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
    const subscription = await openAllThree(500_000);

    expect(subscription).toMatchObject({ bundledAddOnNetCents: 2_660_000, adCreditCents: 500_000, status: "incomplete" });
    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.listAmountCents, row.offerDiscountAmountCents, row.netAmountCents, row.status])).toEqual([
      ["managed-website", 300_000, 90_000, 210_000, "pending"],
      ["digital-growth", 1_000_000, 300_000, 700_000, "pending"],
      ["local-seo-aeo", 2_500_000, 750_000, 1_750_000, "pending"],
    ]);
    expect(rows.reduce((total, row) => total + row.netAmountCents, 0)).toBe(2_660_000);
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
    expect(subscription).toMatchObject({ bundledAddOnNetCents: 300_000, adCreditCents: 0 });
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

    expect(await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, businessId, OPENED_AT))).toBe(true);
    expect(await forfeitedAt()).toEqual(OPENED_AT);

    expect(await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, businessId, RENEWED_AT))).toBe(false);
    expect(await forfeitedAt()).toEqual(OPENED_AT);
  });

  it("does nothing for a business that does not exist", async () => {
    expect(await dbs.staff.db.transaction((tx) => markPackageOfferForfeited(tx, "not-a-uuid", OPENED_AT))).toBe(false);
  });
});

describe("a line moving to another package offer", () => {
  async function paidAllThree() {
    const subscription = await openAllThree(500_000);
    await recordPaymentAndActivate(dbs.staff.db, {
      businessId,
      subscriptionId: subscription.id,
      provider: "fake",
      providerPaymentId: "fake_pay_package",
      kind: "initial",
      amountCents: 3_138_800,
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
    expect(pending).toMatchObject({ bundledAddOnNetCents: 2_660_000 });
    // The SEO line is still billed until the renewal: it has not been asked to end in this test.
    expect(pending?.pendingBundledAddOnNetCents).toBe(300_000 + 1_000_000 + 1_750_000);
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).map((row) => row.offerDiscountAmountCents)).toEqual([
      90_000, 300_000, 750_000,
    ]);

    await dbs.staff.db.transaction((tx) => completeBundledAddOnChanges(tx, { subscriptionId: subscription.id, now: RENEWED_AT }));

    const rows = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.offerDiscountAmountCents, row.netAmountCents, row.pendingOfferDiscountAmountCents])).toEqual([
      ["managed-website", 0, 300_000, null],
      ["digital-growth", 0, 1_000_000, null],
      ["local-seo-aeo", 750_000, 1_750_000, null],
    ]);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({
      bundledAddOnNetCents: 3_050_000,
      pendingBundledAddOnNetCents: null,
    });
  });
});
