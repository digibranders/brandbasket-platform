import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findTaxInvoiceByPaymentId,
  openCheckoutSubscription,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundleLines } from "./lib/billing/bundle";
import type { MonthlyAddOnId } from "./lib/billing/add-ons";
import { activateFirstPayment, activateReactivationPayment } from "./server/billing-activation";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * Since migration 0184 the plan row is the subscription's terms at a price of 0 and every service, the website included,
 * is a line (docs/plans/16-platform-pricing-offers.md in the BrandBasket workspace). A first payment and a reactivation
 * are charged the lines, turn them on, and are invoiced with a line for each and no plan line at 0.
 */

const PAID_AT = new Date("2026-10-21T09:00:00.000Z");
const NEXT_MONTH = new Date("2026-11-21T09:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

function linesOf(...services: MonthlyAddOnId[]): readonly NewBundledAddOn[] {
  return bundleLines(services, plan.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
  }));
}

function open(services: readonly NewBundledAddOn[], providerSubscriptionId: string): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId,
    bundledAddOns: services,
    replacing: null,
    now: PAID_AT,
  });
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
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "qa-lines", name: "QA Lines Business", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a payment for service lines on the services plan", () => {
  it("charges the website and Social Media and Ads at the package price, and invoices a line for each", async () => {
    const subscription = await open(linesOf("managed-website", "digital-growth"), `fake_sub_${"d".repeat(24)}`);
    const activation = await dbs.staff.db.transaction((tx) =>
      activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan, provider: "fake", providerPaymentId: "fake_pay_lines", paidAt: PAID_AT }),
    );

    expect(activation.payment.amountCents).toBe(1_227_200);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(1_227_200);
    expect(invoice?.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
      ["Managed Website", 300_000, 60_000],
      ["Social Media and Ads", 1_000_000, 200_000],
    ]);
  });

  it("charges a reactivation its own lines, turns them on and invoices them", async () => {
    const subscription = await open(linesOf("managed-website"), `fake_sub_${"e".repeat(24)}`);
    const activation = await dbs.staff.db.transaction((tx) =>
      activateReactivationPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        plan,
        provider: "fake",
        providerPaymentId: "fake_pay_back",
        paidAt: PAID_AT,
        paidThroughAt: NEXT_MONTH,
      }),
    );

    expect(activation.payment).toMatchObject({ amountCents: 354_000, kind: "reactivation" });
    expect((await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).map((row) => row.status)).toEqual(["active"]);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines.map((line) => [line.description, line.unitAmountCents])).toEqual([["Managed Website", 300_000]]);
    expect(invoice?.totalCents).toBe(354_000);
  });
});
