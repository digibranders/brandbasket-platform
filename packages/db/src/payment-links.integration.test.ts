import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, insertSubscription } from "./queries/billing";
import { findBillingState } from "./queries/billing";
import { insertAdvanceCharge, insertCharge } from "./queries/charges";
import {
  bindPaymentLink,
  extendPaymentLink,
  findOpenPaymentLinkForBusiness,
  findPaymentLinkByTokenHash,
  attachAdvanceCharge,
  findDealForBusiness,
  findDealStanding,
  findPaymentLinkByAdvanceChargeId,
  insertPaymentLink,
  listPaymentLinks,
  markAdvancePaid,
  markLinkReady,
  markPaymentLinkPaid,
  paymentLinkState,
  revokePaymentLink,
  unmarkLinkReady,
  updateDeal,
} from "./queries/payment-links";
import { businessMembers, businesses, paymentLinks, referralCodes, subscriptions, users } from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const STAFF = "staff-1";
const OWNER = "owner-1";
const NOW = new Date("2026-11-27T09:00:00.000Z");
const DAY = 86_400_000;

let dbs: TestDatabases;
let businessId = "";
let otherBusinessId = "";

const FREE_NO_WEBSITE = { dealType: "free", advanceCents: null, services: ["social-media"], websiteKind: null, setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null };

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
    dealType: "paid",
    advanceCents: 2_000_000,
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
      insertPaymentLink(dbs.staff.db, newLink("ok-1", FREE_NO_WEBSITE)),
    ).resolves.toBeDefined();
  });

  it("is staff-only: the customer's connection can neither read all of it nor write it", async () => {
    await insertPaymentLink(dbs.staff.db, newLink("hash-14", { businessId }));

    const read = await captureErrorText(withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.select().from(paymentLinks)));
    const write = await captureErrorText(withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.insert(paymentLinks).values(newLink("hash-15"))));

    expect(read).toMatch(/permission denied/i);
    expect(write).toMatch(/permission denied/i);
  });
});

async function insertCoupon(): Promise<string> {
  const [row] = await dbs.staff.db
    .insert(referralCodes)
    .values({ code: "DEAL1000", currency: "INR", discountKind: "amount", discountAmountCents: 1000, createdByStaffId: STAFF })
    .returning({ id: referralCodes.id });
  if (row === undefined) throw new Error("coupon insert returned no row");
  return row.id;
}

async function advanceCharge(forBusiness: string) {
  return insertCharge(dbs.staff.db, {
    businessId: forBusiness,
    kind: "website_advance",
    description: "Website design and build: advance",
    quantity: 1,
    unitAmountCents: 2_000_000,
    taxRateBasisPoints: 1800,
    amountCents: 2_360_000,
    currency: "INR",
    createdByStaffId: STAFF,
  });
}

/** A building deal: advance charge attached and paid. */
async function buildingLink(tokenHash: string, overrides: Partial<typeof paymentLinks.$inferInsert> = {}) {
  const link = await insertPaymentLink(dbs.staff.db, newLink(tokenHash, { businessId, ...overrides }));
  const charge = await advanceCharge(businessId);
  await attachAdvanceCharge(dbs.staff.db, { linkId: link.id, chargeId: charge.id });
  await markAdvancePaid(dbs.staff.db, { linkId: link.id, paidAt: NOW });
  return { link, charge };
}

describe("deal columns and checks (plan 66)", () => {
  const rejects = (name: string, overrides: Partial<typeof paymentLinks.$inferInsert>) =>
    it(`rejects ${name}`, async () => {
      await expect(insertPaymentLink(dbs.staff.db, newLink(`chk-${name}`, overrides))).rejects.toThrow();
    });

  rejects("an unknown deal type", { dealType: "gift" });
  rejects("a paid deal with no advance (NULL)", { advanceCents: null });
  rejects("a paid deal with no fee (NULL)", { setupFeeListCents: null, setupFeeDiscountCents: null });
  rejects("a paid deal with a NULL discount", { setupFeeDiscountCents: null });
  rejects("an advance of zero", { advanceCents: 0 });
  rejects("an advance above the net price", { advanceCents: 5_000_001 });
  rejects("a paid deal without the website", { services: ["social-media"], websiteKind: null });
  rejects("a free deal with a fee", { dealType: "free", advanceCents: null });
  rejects("a free deal with an advance", { dealType: "free", setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null });
  rejects("the website in the basket with no kind", { websiteKind: null });
  rejects("a kind with no website in the basket", { ...FREE_NO_WEBSITE, websiteKind: "b2b" });
  rejects("a custom price of zero", { websitePriceCents: 0 });
  rejects("a custom price for a service not in the basket", { adsPriceCents: 100 });
  rejects("an advance paid with no charge", { advancePaidAt: NOW, businessId });
  rejects("ready before the advance", { readyAt: NOW, readyByStaffId: STAFF });
  rejects("ready with no staff member", { advancePaidAt: NOW, readyAt: NOW });

  it("accepts a free deal with the website, custom prices and an advance equal to the whole net price", async () => {
    await expect(
      insertPaymentLink(dbs.staff.db, newLink("ok-free", { dealType: "free", advanceCents: null, setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null, websitePriceCents: 100, socialPriceCents: 50 })),
    ).resolves.toBeDefined();
    await expect(insertPaymentLink(dbs.staff.db, newLink("ok-whole", { advanceCents: 5_000_000 }))).resolves.toBeDefined();
  });

  it("accepts a coupon with no custom prices, and refuses one beside them", async () => {
    const couponId = await insertCoupon();
    await expect(insertPaymentLink(dbs.staff.db, newLink("ok-coupon", { referralCodeId: couponId }))).resolves.toBeDefined();
    expect(await captureErrorText(insertPaymentLink(dbs.staff.db, newLink("bad-coupon", { referralCodeId: couponId, websitePriceCents: 100 })))).toMatch(/payment_links_coupon_or_price_check/);
  });
});

describe("deal states and transitions (plan 66)", () => {
  it("reads its state by precedence: paid, revoked, balance due, building, expired, open", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("st-1", { businessId }));
    const past = new Date(link.expiresAt.getTime() + DAY);
    expect(paymentLinkState(link, NOW)).toBe("open");
    expect(paymentLinkState(link, past)).toBe("expired");
    expect(paymentLinkState({ ...link, advancePaidAt: NOW }, past)).toBe("building");
    expect(paymentLinkState({ ...link, advancePaidAt: NOW, readyAt: NOW }, past)).toBe("balance_due");
    expect(paymentLinkState({ ...link, advancePaidAt: NOW, readyAt: NOW, revokedAt: NOW }, past)).toBe("revoked");
    expect(paymentLinkState({ ...link, advancePaidAt: NOW, readyAt: NOW, revokedAt: NOW, paidAt: NOW }, past)).toBe("paid");
  });

  it("still finds a 10 day old link once the advance is paid, and not before", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("old-1", { businessId }));
    const later = new Date(NOW.getTime() + 10 * DAY);
    expect(await findOpenPaymentLinkForBusiness(dbs.staff.db, businessId, later)).toBeNull();

    const charge = await advanceCharge(businessId);
    await attachAdvanceCharge(dbs.staff.db, { linkId: link.id, chargeId: charge.id });
    await markAdvancePaid(dbs.staff.db, { linkId: link.id, paidAt: NOW });

    expect((await findOpenPaymentLinkForBusiness(dbs.staff.db, businessId, later))?.id).toBe(link.id);
    expect((await findDealForBusiness(dbs.staff.db, businessId))?.id).toBe(link.id);
  });

  it("attaches one advance charge per link and returns it again on a retry", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("adv-1", { businessId }));
    const first = await advanceCharge(businessId);
    const second = await advanceCharge(businessId);

    expect(await attachAdvanceCharge(dbs.staff.db, { linkId: link.id, chargeId: first.id })).toBe(first.id);
    expect(await attachAdvanceCharge(dbs.staff.db, { linkId: link.id, chargeId: second.id })).toBe(first.id);
  });

  it("marks the advance paid once: a second delivery keeps the first time", async () => {
    const { link } = await buildingLink("adv-2");
    await markAdvancePaid(dbs.staff.db, { linkId: link.id, paidAt: new Date(NOW.getTime() + 1000) });

    expect((await findPaymentLinkByTokenHash(dbs.staff.db, "adv-2"))?.advancePaidAt).toEqual(NOW);
  });

  it("marks ready only from building, and undoes it only while the balance is due", async () => {
    const open = await insertPaymentLink(dbs.staff.db, newLink("rdy-1", { businessId }));
    expect(await markLinkReady(dbs.staff.db, { linkId: open.id, staffUserId: STAFF, now: NOW })).toBe(false);
    expect(await unmarkLinkReady(dbs.staff.db, { linkId: open.id })).toBe(false);

    const { link } = await buildingLink("rdy-2");
    expect(await markLinkReady(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW })).toBe(true);
    expect(await markLinkReady(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW })).toBe(false);
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "rdy-2")).toMatchObject({ readyAt: NOW, readyByStaffId: STAFF });
    expect(await unmarkLinkReady(dbs.staff.db, { linkId: link.id })).toBe(true);
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "rdy-2")).toMatchObject({ readyAt: null, readyByStaffId: null });

    await revokePaymentLink(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW });
    expect(await markLinkReady(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW })).toBe(false);
  });

  it("keeps the advance when a building deal is cancelled", async () => {
    const { link } = await buildingLink("rev-1");
    expect(await revokePaymentLink(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW })).toBe(true);

    const stored = await findPaymentLinkByTokenHash(dbs.staff.db, "rev-1");
    expect(stored).toMatchObject({ advancePaidAt: NOW, advanceCents: 2_000_000 });
    expect(paymentLinkState(stored!, NOW)).toBe("revoked");
    expect(await findDealForBusiness(dbs.staff.db, businessId)).toBeNull();
  });

  it("edits a deal only while it is building, and never the advance", async () => {
    const open = await insertPaymentLink(dbs.staff.db, newLink("upd-1", { businessId }));
    expect(await updateDeal(dbs.staff.db, { linkId: open.id, patch: { setupFeeNote: "x" } })).toBe(false);

    const { link } = await buildingLink("upd-2");
    expect(await updateDeal(dbs.staff.db, { linkId: link.id, patch: { setupFeeDiscountCents: 1_000_000, websitePriceCents: 99_900 } })).toBe(true);
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "upd-2")).toMatchObject({ setupFeeDiscountCents: 1_000_000, websitePriceCents: 99_900, advanceCents: 2_000_000 });

    // An advance column slipped in through a cast is ignored.
    await updateDeal(dbs.staff.db, { linkId: link.id, patch: { setupFeeNote: "y", advanceCents: 1 } as never });
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "upd-2")).toMatchObject({ setupFeeNote: "y", advanceCents: 2_000_000 });

    // The database refuses a fee that leaves less than the advance, and a coupon beside custom prices.
    await expect(updateDeal(dbs.staff.db, { linkId: link.id, patch: { setupFeeDiscountCents: 5_000_000 } })).rejects.toThrow();
    expect(await captureErrorText(updateDeal(dbs.staff.db, { linkId: link.id, patch: { referralCodeId: await insertCoupon() } }))).toMatch(/payment_links_coupon_or_price_check/);

    await markLinkReady(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW });
    expect(await updateDeal(dbs.staff.db, { linkId: link.id, patch: { setupFeeNote: "z" } })).toBe(false);
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

describe("the advance charge and the building state (plan 66 step 4)", () => {
  const advance = (linkId: string, overrides: Partial<Parameters<typeof insertAdvanceCharge>[1]> = {}) =>
    dbs.staff.db.transaction((tx) =>
      insertAdvanceCharge(tx, {
        businessId,
        linkId,
        amountCents: 2_000_000,
        currency: "INR",
        description: "Website design and build: advance (Ecommerce store)",
        taxRateBasisPoints: 1800,
        ...overrides,
      }),
    );

  it("adds one open website_advance charge for exactly the advance, records it on the link, and finds the link from it", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("adv-1", { businessId }));

    const charge = await advance(link.id);

    expect(charge).toMatchObject({ kind: "website_advance", status: "open", quantity: 1, unitAmountCents: 2_000_000, amountCents: 2_000_000, taxRateBasisPoints: 1800, createdByStaffId: null, businessId });
    expect((await findPaymentLinkByAdvanceChargeId(dbs.staff.db, charge.id))?.id).toBe(link.id);
    expect((await findPaymentLinkByAdvanceChargeId(dbs.staff.db, link.id))).toBeNull();
    expect(await findPaymentLinkByAdvanceChargeId(dbs.staff.db, "not-a-uuid")).toBeNull();
  });

  it("refuses a second advance charge for the same link and leaves no extra charge", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("adv-2", { businessId }));
    await advance(link.id);

    await expect(advance(link.id)).rejects.toThrow(/already has an advance charge/);

    expect(await querySql(dbs.owner, "select count(*)::int as n from charges where kind = 'website_advance'")).toEqual([{ n: 1 }]);
  });

  it("refuses an advance of nothing, a description with spaces round it, and a link that is cancelled", async () => {
    const link = await insertPaymentLink(dbs.staff.db, newLink("adv-3", { businessId }));
    await expect(advance(link.id, { amountCents: 0 })).rejects.toThrow();
    await expect(advance(link.id, { description: " advance " })).rejects.toThrow();
    const cancelled = await insertPaymentLink(dbs.staff.db, newLink("adv-4", { businessId: otherBusinessId, revokedAt: NOW }));
    await expect(advance(cancelled.id, { businessId: otherBusinessId })).rejects.toThrow(/already has an advance charge|cancelled/);
  });

  it("is building after the advance is paid and balance_due once staff mark the website ready, from the tenant connection too", async () => {
    const { link } = await buildingLink("adv-5");
    await dbs.staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
    const asOwner = () => withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => findBillingState(tx, businessId));

    expect(await asOwner()).toMatchObject({ dealState: "building", dealLinkId: link.id, hasEverPaid: false });
    await markLinkReady(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW });
    expect(await asOwner()).toMatchObject({ dealState: "balance_due", dealLinkId: link.id, hasEverPaid: false });
    expect(await findDealStanding(dbs.staff.db, businessId)).toEqual({ dealLinkId: link.id, dealState: "balance_due" });
  });

  it("has no deal state before the advance, once the deal is paid or cancelled, or for another business", async () => {
    const open = await insertPaymentLink(dbs.staff.db, newLink("adv-6", { businessId }));
    expect(await findBillingState(dbs.staff.db, businessId)).toMatchObject({ dealState: null, dealLinkId: null });

    const { link } = await buildingLink("adv-7", { businessId });
    expect(await findDealStanding(dbs.staff.db, otherBusinessId)).toBeNull();
    await revokePaymentLink(dbs.staff.db, { linkId: link.id, staffUserId: STAFF, now: NOW });
    expect(await findBillingState(dbs.staff.db, businessId)).toMatchObject({ dealState: null, dealLinkId: null });
    expect(open.id).not.toBe(link.id);
  });

  it("lets the customer's connection read only its own business's deal columns it is granted, never the token", async () => {
    await buildingLink("adv-8");
    await buildingLink("adv-9", { businessId: otherBusinessId });
    const mine = await withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.select({ id: paymentLinks.id, businessId: paymentLinks.businessId }).from(paymentLinks));
    const token = await captureErrorText(withTenantScope(dbs.app.db, { userId: OWNER, businessId }, (tx) => tx.select({ tokenHash: paymentLinks.tokenHash }).from(paymentLinks)));

    expect(mine).toHaveLength(1);
    expect(mine[0]?.businessId).toBe(businessId);
    expect(token).toMatch(/permission denied/i);
  });
});
