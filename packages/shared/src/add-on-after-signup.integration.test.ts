import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  bundledAddOns,
  businesses,
  findActivePlan,
  findBundledAddOnsForSubscription,
  openCheckoutSubscription,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundleLines } from "./lib/billing/bundle";
import { activateFirstPayment } from "./server/billing-activation";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * Adding an add-on to a plan that is already running (docs/plans/13-platform-add-ons-after-signup.md in the BrandBasket
 * workspace), against a real database.
 */

const PAID_AT = new Date("2026-10-19T00:00:00.000Z");
const FIFTH_NOV = new Date("2026-11-05T06:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let managed: Plan;

function bundleOf(...ids: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(ids, managed.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: managed.taxRateBasisPoints,
  }));
}

/** A Managed Website subscription, paid on 19 Oct with the given add-ons. */
async function paidSubscription(bundled: readonly NewBundledAddOn[] = []): Promise<Subscription> {
  const subscription = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: managed.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"a".repeat(24)}`,
    referralCodeId: null,
    discountAmountCents: 0,
    bundledAddOns: bundled,
    replacing: null,
    now: PAID_AT,
  });
  await dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      plan: managed,
      provider: "fake",
      providerPaymentId: "fake_pay_first",
      paidAt: PAID_AT,
      discountAmountCents: 0,
    }),
  );
  return subscription;
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
  managed = plan;
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "qa-add-later", name: "QA Add Later", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the add-on rows", () => {
  it("records when an add-on taken at sign-up became part of the monthly amount", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));

    const [row] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(row).toMatchObject({ status: "active", billedFrom: PAID_AT });
  });

  it("lets a subscription take an add-on again after an earlier one stopped, but never hold two live at once", async () => {
    const subscription = await paidSubscription(bundleOf("digital-growth"));
    await dbs.owner.db.update(bundledAddOns).set({ status: "removed", removedAt: FIFTH_NOV });
    const again = { businessId, subscriptionId: subscription.id, addOn: "digital-growth", listAmountCents: 700_000, netAmountCents: 700_000, taxRateBasisPoints: 1_800 };

    await dbs.owner.db.insert(bundledAddOns).values({ ...again, status: "active" });

    await expect(dbs.owner.db.insert(bundledAddOns).values({ ...again, status: "pending" })).rejects.toThrow();
  });
});
