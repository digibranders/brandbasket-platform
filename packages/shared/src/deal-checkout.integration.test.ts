import {
  businesses,
  findActivePlan,
  insertAdvanceCharge,
  insertPaymentLink,
  insertSubscription,
  markAdvancePaid,
  markLinkReady,
  markPaymentLinkPaid,
  subscriptions,
  unmarkLinkReady,
  users,
  type Subscription,
} from "@brandbasket/db";
import { eq, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { createBillingProvider } from "@brandbasket/billing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelPendingDealCheckout, isDealCheckoutStale } from "./server/deal-checkout";

vi.mock("server-only", () => ({}));

/** Plan 66, step 6: a checkout opened for a deal's balance cannot be paid once staff take the deal back. Real database, fake provider. */

const STAFF = "staff-1";
const NOW = new Date("2026-11-27T09:00:00.000Z");
const DAY = 86_400_000;

let dbs: TestDatabases;
let businessId = "";
let linkId = "";

const provider = createBillingProvider("fake", { authSecret: "test-secret-test-secret-test-secret-123" });

async function openCheckoutFor(providerSubscriptionId: string, forLink: string | null = linkId): Promise<Subscription> {
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("The seeded INR plan is missing");
  return insertSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId,
    paymentLinkId: forLink,
    ...(forLink === null ? {} : { websiteKind: "b2b", setupFeeListCents: 3_500_000, setupFeeDiscountCents: 0, setupFeeAdvanceCents: 2_000_000 }),
  });
}

/** One live subscription per business: end an earlier checkout before opening the next. */
async function endCheckout(id: string): Promise<void> {
  await dbs.owner.db.update(subscriptions).set({ status: "cancelled", cancelledAt: NOW }).where(eq(subscriptions.id, id));
}

beforeAll(() => {
  dbs = openTestDatabases();
});
afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  await dbs.staff.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff@example.com" });
  const [business] = await dbs.staff.db.insert(businesses).values({ slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" }).returning({ id: businesses.id });
  businessId = business?.id ?? "";
  const link = await insertPaymentLink(dbs.staff.db, {
    tokenHash: "hash-1",
    businessId,
    contactName: "Asha Rao",
    countryCode: "IN",
    currency: "INR",
    services: ["managed-website", "social-media"],
    billingInterval: "month",
    dealType: "paid",
    advanceCents: 2_000_000,
    websiteKind: "b2b",
    setupFeeListCents: 3_500_000,
    setupFeeDiscountCents: 0,
    expiresAt: new Date(NOW.getTime() + 7 * DAY),
    createdByStaffId: STAFF,
  });
  linkId = link.id;
  await insertAdvanceCharge(dbs.staff.db, { businessId, linkId, amountCents: 2_000_000, currency: "INR", description: "Website design and build: advance", taxRateBasisPoints: 1800 });
  await markAdvancePaid(dbs.staff.db, { linkId, paidAt: NOW });
  await markLinkReady(dbs.staff.db, { linkId, staffUserId: STAFF, now: NOW });
});

describe("cancelPendingDealCheckout", () => {
  it("cancels the customer's unpaid checkout for the deal in our database and at the provider", async () => {
    const checkout = await openCheckoutFor("fake_sub_1");
    const cancelAtProvider = vi.spyOn(provider, "cancelSubscription").mockResolvedValue(undefined);

    expect(await cancelPendingDealCheckout(dbs.staff.db, provider, { businessId, linkId, now: NOW })).toBe(1);

    const [row] = await dbs.staff.db.select().from(subscriptions).where(eq(subscriptions.id, checkout.id));
    expect(row).toMatchObject({ status: "cancelled", cancelledAt: NOW });
    expect(cancelAtProvider).toHaveBeenCalledWith("fake_sub_1");
  });

  it("leaves a checkout that already paid, one for another link and a business with none alone", async () => {
    const paid = await openCheckoutFor("fake_sub_paid");
    await dbs.owner.db.update(subscriptions).set({ status: "active", activatedAt: NOW, paidThroughAt: new Date(NOW.getTime() + 30 * DAY) }).where(eq(subscriptions.id, paid.id));
    const cancelAtProvider = vi.spyOn(provider, "cancelSubscription").mockResolvedValue(undefined);

    expect(await cancelPendingDealCheckout(dbs.staff.db, provider, { businessId, linkId, now: NOW })).toBe(0);
    expect(cancelAtProvider).not.toHaveBeenCalled();
    const [row] = await dbs.staff.db.select().from(subscriptions).where(eq(subscriptions.id, paid.id));
    expect(row?.status).toBe("active");
  });

  it("still ends the checkout in our database when the provider will not cancel it", async () => {
    const checkout = await openCheckoutFor("fake_sub_2");
    vi.spyOn(provider, "cancelSubscription").mockRejectedValue(new Error("provider down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await cancelPendingDealCheckout(dbs.staff.db, provider, { businessId, linkId, now: NOW })).toBe(1);
    const [row] = await dbs.staff.db.select().from(subscriptions).where(eq(subscriptions.id, checkout.id));
    expect(row?.status).toBe("cancelled");
  });
});

describe("isDealCheckoutStale", () => {
  it("is false while the deal waits for its balance and true once staff undo ready", async () => {
    const checkout = await openCheckoutFor("fake_sub_3");
    expect(await isDealCheckoutStale(dbs.staff.db, checkout, NOW)).toBe(false);

    await unmarkLinkReady(dbs.staff.db, { linkId });
    expect(await isDealCheckoutStale(dbs.staff.db, checkout, NOW)).toBe(true);
  });

  it("is false for a checkout that is not a deal's balance, and for the subscription that paid the link", async () => {
    const plain = await openCheckoutFor("fake_sub_4", null);
    expect(await isDealCheckoutStale(dbs.staff.db, plain, NOW)).toBe(false);
    await endCheckout(plain.id);

    const checkout = await openCheckoutFor("fake_sub_5");
    // The link paid by this very subscription (a repeated delivery of the recorded payment) is not stale.
    await markPaymentLinkPaid(dbs.staff.db, { linkId, subscriptionId: checkout.id, paidAt: NOW });
    expect(await isDealCheckoutStale(dbs.staff.db, checkout, NOW)).toBe(false);
    // Another subscription arriving on a link that is paid is.
    await endCheckout(checkout.id);
    const other = await openCheckoutFor("fake_sub_6");
    expect(await isDealCheckoutStale(dbs.staff.db, other, NOW)).toBe(true);
  });
});
