import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, insertSubscription } from "./queries/billing";
import {
  bindPaymentLink,
  extendPaymentLink,
  findOpenPaymentLinkForBusiness,
  findPaymentLinkByTokenHash,
  insertPaymentLink,
  listPaymentLinks,
  markPaymentLinkPaid,
  paymentLinkState,
  revokePaymentLink,
} from "./queries/payment-links";
import { businesses, paymentLinks, subscriptions, users } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF = "staff-1";
const OWNER = "owner-1";
const NOW = new Date("2026-11-27T09:00:00.000Z");
const DAY = 86_400_000;

let dbs: TestDatabases;
let businessId = "";
let otherBusinessId = "";

/** A link for a new customer in India: an ecommerce website with Social, ₹15,000 off the build, monthly. */
function newLink(tokenHash: string, overrides: Partial<typeof paymentLinks.$inferInsert> = {}): typeof paymentLinks.$inferInsert {
  return {
    tokenHash,
    contactName: "Asha Rao",
    businessName: "Chennai Cafe",
    email: "asha@example.com",
    countryCode: "IN",
    stateCode: "tn",
    currency: "INR",
    services: ["managed-website", "social-media"],
    billingInterval: "month",
    websiteKind: "ecommerce",
    setupFeeListCents: 6_500_000,
    setupFeeDiscountCents: 1_500_000,
    setupFeeNote: "As agreed on call",
    expiresAt: new Date(NOW.getTime() + 7 * DAY),
    createdByStaffId: STAFF,
    ...overrides,
  };
}

async function openSubscription(forBusiness: string, providerSubscriptionId: string) {
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("The seeded INR plan is missing");
  return insertSubscription(dbs.staff.db, {
    businessId: forBusiness,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId,
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
  await dbs.staff.db.insert(users).values([
    { id: STAFF, name: "Staff", email: "staff@example.com" },
    { id: OWNER, name: "Asha", email: "asha@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
      { slug: "riverside", name: "Riverside", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessId = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  otherBusinessId = inserted.find((row) => row.slug === "riverside")?.id ?? "";
});

describe("payment links", () => {
  it("is found by the hash of its token and stores the deal as it was made", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("hash-1"));

    const found = await findPaymentLinkByTokenHash(dbs.staff.db, "hash-1");

    expect(found?.id).toBe(link.id);
    expect(found).toMatchObject({ websiteKind: "ecommerce", setupFeeListCents: 6_500_000, setupFeeDiscountCents: 1_500_000, setupFeeNote: "As agreed on call", businessId: null });
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "no-such-hash")).toBeNull();
  });

  it("binds to one business, once", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("hash-2"));

    expect(await bindPaymentLink(dbs.staff.db, { linkId: link.id, businessId, now: NOW })).toBe(true);
    expect(await bindPaymentLink(dbs.staff.db, { linkId: link.id, businessId: otherBusinessId, now: NOW })).toBe(false);

    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "hash-2")).toMatchObject({ businessId, redeemedAt: NOW });
  });

  it("does not bind a link that is cancelled or expired", async () => {
    const cancelled = await insertPaymentLink(dbs.staff.db, newLink("hash-3"));
    await revokePaymentLink(dbs.staff.db, { linkId: cancelled.id, staffUserId: STAFF, now: NOW });
    const expired = await insertPaymentLink(dbs.staff.db, newLink("hash-4", { expiresAt: new Date(NOW.getTime() - 1) }));

    expect(await bindPaymentLink(dbs.staff.db, { linkId: cancelled.id, businessId, now: NOW })).toBe(false);
    expect(await bindPaymentLink(dbs.staff.db, { linkId: expired.id, businessId, now: NOW })).toBe(false);
  });

  it("finds an open link for a business, and none once it is paid, cancelled or expired", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("hash-5", { businessId }));
    expect((await findOpenPaymentLinkForBusiness(dbs.staff.db, businessId, NOW))?.id).toBe(link.id);
    expect(await findOpenPaymentLinkForBusiness(dbs.staff.db, businessId, new Date(NOW.getTime() + 8 * DAY))).toBeNull();
    expect(await findOpenPaymentLinkForBusiness(dbs.staff.db, otherBusinessId, NOW)).toBeNull();

    await revokePaymentLink(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW });
    expect(await findOpenPaymentLinkForBusiness(dbs.staff.db, businessId, NOW)).toBeNull();

    const paid = await insertPaymentLink(dbs.staff.db, newLink("hash-6", { businessId }));
    const subscription = await openSubscription(businessId, "sub-paid");
    await markPaymentLinkPaid(dbs.staff.db, { linkId: paid.id, subscriptionId: subscription.id, paidAt: NOW });
    expect(await findOpenPaymentLinkForBusiness(dbs.staff.db, businessId, NOW)).toBeNull();
  });

  it("reads its state: open, paid, cancelled or expired", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("hash-7", { businessId }));
    expect(paymentLinkState(link, NOW)).toBe("open");
    expect(paymentLinkState(link, new Date(link.expiresAt.getTime()))).toBe("expired");
    expect(paymentLinkState({ ...link, revokedAt: NOW }, NOW)).toBe("revoked");
    expect(paymentLinkState({ ...link, revokedAt: NOW, paidAt: NOW }, NOW)).toBe("paid");
  });

  it("extends an expired link back to open, but not a paid or cancelled one", async () => {
    const expired = await insertPaymentLink(dbs.staff.db, newLink("hash-8", { expiresAt: new Date(NOW.getTime() - DAY) }));
    expect(await extendPaymentLink(dbs.staff.db, { linkId: expired.id, expiresAt: new Date(NOW.getTime() + 7 * DAY) })).toBe(true);
    expect(paymentLinkState((await findPaymentLinkByTokenHash(dbs.staff.db, "hash-8"))!, NOW)).toBe("open");

    const cancelled = await insertPaymentLink(dbs.staff.db, newLink("hash-9"));
    await revokePaymentLink(dbs.staff.db, { linkId: cancelled.id, staffUserId: STAFF, now: NOW });
    expect(await extendPaymentLink(dbs.staff.db, { linkId: cancelled.id, expiresAt: new Date(NOW.getTime() + 7 * DAY) })).toBe(false);
  });

  it("cannot be cancelled once paid, and a repeated payment for the same subscription is harmless", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("hash-10", { businessId }));
    const subscription = await openSubscription(businessId, "sub-1");

    await markPaymentLinkPaid(dbs.staff.db, { linkId: link.id, subscriptionId: subscription.id, paidAt: NOW });
    await markPaymentLinkPaid(dbs.staff.db, { linkId: link.id, subscriptionId: subscription.id, paidAt: new Date(NOW.getTime() + 1000) });

    expect(await revokePaymentLink(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW })).toBe(false);
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "hash-10")).toMatchObject({ paidAt: NOW, subscriptionId: subscription.id });
  });

  it("refuses to mark a link paid by a second subscription", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("hash-11", { businessId }));
    const first = await openSubscription(businessId, "sub-first");
    await markPaymentLinkPaid(dbs.staff.db, { linkId: link.id, subscriptionId: first.id, paidAt: NOW });
    await dbs.staff.db.update(subscriptions).set({ status: "cancelled" }).where(eq(subscriptions.id, first.id));
    const second = await openSubscription(businessId, "sub-second");

    await expect(markPaymentLinkPaid(dbs.staff.db, { linkId: link.id, subscriptionId: second.id, paidAt: NOW })).rejects.toThrow(/was paid by subscription/);
  });

  it("lists newest first", async () => {
    const older = await insertPaymentLink(dbs.staff.db, newLink("hash-12"));
    const newer = await insertPaymentLink(dbs.staff.db, newLink("hash-13"));

    const listed = await listPaymentLinks(dbs.staff.db, { limit: 10, offset: 0 });

    expect(listed.map((row) => row.id)).toEqual([newer.id, older.id]);
  });

  it("refuses a deal that makes no sense: a fee with no kind, a discount above the fee, a currency that disagrees with the country", async () => {
    await expect(insertPaymentLink(dbs.staff.db, newLink("bad-1", { websiteKind: null }))).rejects.toThrow();
    await expect(insertPaymentLink(dbs.staff.db, newLink("bad-2", { setupFeeDiscountCents: 6_500_001 }))).rejects.toThrow();
    await expect(insertPaymentLink(dbs.staff.db, newLink("bad-3", { currency: "USD" }))).rejects.toThrow();
    await expect(insertPaymentLink(dbs.staff.db, newLink("bad-4", { services: ["social-media"] }))).rejects.toThrow();
    // A basket with no website carries no fee at all.
    await expect(
      insertPaymentLink(dbs.staff.db, newLink("ok-1", { services: ["social-media"], websiteKind: null, setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null })),
    ).resolves.toBeDefined();
  });

  it("is staff-only: the customer's connection can neither read nor write it", async () => {
    await insertPaymentLink(dbs.staff.db, newLink("hash-14", { businessId }));

    const read = await captureErrorText(withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.select().from(paymentLinks)));
    const write = await captureErrorText(withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.insert(paymentLinks).values(newLink("hash-15"))));

    expect(read).toMatch(/permission denied/i);
    expect(write).toMatch(/permission denied/i);
  });
});

describe("a subscription's build fee", () => {
  it("stores the kind, the fee, the discount, the note and the link it came from", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("hash-20", { businessId }));
    const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
    if (plan === null) throw new Error("The seeded INR plan is missing");

    const subscription = await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "sub-fee",
      firstPaymentCents: 5_000_000,
      firstChargeAt: new Date(NOW.getTime() + 30 * DAY),
      websiteKind: "ecommerce",
      setupFeeListCents: 6_500_000,
      setupFeeDiscountCents: 1_500_000,
      setupFeeNote: "As agreed on call",
      paymentLinkId: link.id,
    });

    expect(subscription).toMatchObject({ websiteKind: "ecommerce", setupFeeListCents: 6_500_000, setupFeeDiscountCents: 1_500_000, setupFeeNote: "As agreed on call", paymentLinkId: link.id });
  });

  it("takes a first payment on a yearly subscription now (a yearly build-fee deal)", async () => {
    const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
    if (plan === null) throw new Error("The seeded INR plan is missing");

    const subscription = await insertSubscription(dbs.staff.db, {
      businessId,
      planId: plan.id,
      provider: "fake",
      providerSubscriptionId: "sub-year",
      billingInterval: "year",
      firstPaymentCents: 9_739_000,
      firstChargeAt: new Date(NOW.getTime() + 395 * DAY),
    });

    expect(subscription).toMatchObject({ billingInterval: "year", firstPaymentCents: 9_739_000 });
  });

  it("refuses a fee with no kind, a discount above the fee, and an unknown kind", async () => {
    const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
    if (plan === null) throw new Error("The seeded INR plan is missing");
    const base = { businessId, planId: plan.id, provider: "fake" as const };

    await expect(insertSubscription(dbs.staff.db, { ...base, providerSubscriptionId: "x1", setupFeeListCents: 3_500_000, setupFeeDiscountCents: 0 })).rejects.toThrow();
    await expect(insertSubscription(dbs.staff.db, { ...base, providerSubscriptionId: "x2", websiteKind: "b2b", setupFeeListCents: 3_500_000, setupFeeDiscountCents: 3_500_001 })).rejects.toThrow();
    await expect(insertSubscription(dbs.staff.db, { ...base, providerSubscriptionId: "x3", websiteKind: "shop" })).rejects.toThrow();
  });
});
