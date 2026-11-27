import { addMonthsUtc, hasWebsiteService } from "@brandbasket/billing";
import {
  businesses,
  findActivePlan,
  findBillingState,
  findBundledAddOnsForSubscription,
  findPaymentByProviderId,
  findPaymentLinkById,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  insertAdvanceCharge,
  insertPaymentLink,
  markLinkReady,
  openCheckoutSubscription,
  type Charge,
  type NewBundledAddOn,
  type PaymentLink,
  type Plan,
  type Subscription,
  users,
} from "@brandbasket/db";
import { openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dealAmounts, dealLines, linkCustomPrices } from "./lib/billing/deal";
import { planFirstPayment } from "./lib/billing/first-payment";
import { activateFirstPayment } from "./server/billing-activation";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";

// The payment recording is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * Plan 66, payment 2 of a paid deal, against a real database: a deal of ₹10,000 with a ₹5,000 advance is paid (payment 1), marked ready,
 * and its checkout opened as openPlanCheckout opens it (the same rules: dealLines for the prices, planFirstPayment with the balance, the
 * frozen amount, advance and link). The balance, the website's first period and every other service are one payment; the subscription
 * starts that day; the project is not opened twice; the invoice builds on the advance's.
 */

const STAFF = "staff-deal";
const ADVANCE_AT = new Date("2026-11-27T10:00:00.000Z");
const READY_AT = new Date("2026-12-18T06:00:00.000Z");
const PAID_AT = new Date("2026-12-20T07:00:00.000Z");
const MONTH_ON = new Date("2027-01-20T07:00:00.000Z");
const YEAR_ON = new Date("2027-12-20T07:00:00.000Z");
const NET = 1_000_000;
const ADVANCE = 500_000;
const WEBSITE_MONTH = 299_900;
const WEBSITE_YEAR = 3_238_900;

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;
let link: PaymentLink;

async function count(statement: string): Promise<number> {
  const rows = await querySql<{ count: string }>(dbs.owner, statement);
  return Number(rows[0]?.count ?? 0);
}

/** A paid deal for the business whose advance has been paid (payment 1, through the one charge recorder) and whose website is marked ready. */
async function readyDeal(overrides: Partial<Parameters<typeof insertPaymentLink>[1]> = {}): Promise<{ link: PaymentLink; advanceInvoice: string }> {
  const advance = overrides.advanceCents ?? ADVANCE;
  const created = await insertPaymentLink(dbs.staff.db, {
    tokenHash: `deal-${Math.random()}`,
    businessId,
    countryCode: "IN",
    currency: "INR",
    services: ["managed-website"],
    billingInterval: "month",
    dealType: "paid",
    websiteKind: "b2b",
    setupFeeListCents: NET,
    setupFeeDiscountCents: 0,
    advanceCents: advance,
    expiresAt: new Date("2026-12-27T00:00:00.000Z"),
    createdByStaffId: STAFF,
    ...overrides,
  });
  const charge: Charge = await dbs.staff.db.transaction((tx) =>
    insertAdvanceCharge(tx, { businessId, linkId: created.id, amountCents: advance, currency: "INR", description: "Website design and build: advance (B2B website)", taxRateBasisPoints: 1800 }),
  );
  const recorded = await dbs.staff.db.transaction((tx) =>
    recordChargePaymentWithInvoice(tx, { chargeId: charge.id, businessId, provider: "fake", providerPaymentId: "fake_pay_advance", amountCents: advance, currency: "INR", paidAt: ADVANCE_AT, now: ADVANCE_AT }),
  );
  const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id);
  expect(await markLinkReady(dbs.staff.db, { linkId: created.id, staffUserId: STAFF, now: READY_AT })).toBe(true);
  const ready = await findPaymentLinkById(dbs.staff.db, created.id);
  if (ready === null || invoice === null) throw new Error("The deal or its advance invoice is missing");
  return { link: ready, advanceInvoice: invoice.number };
}

/**
 * What openPlanCheckout freezes for a ready deal: the lines priced from the link, the first payment from planFirstPayment with the balance,
 * the date the provider's plan starts, and the deal's list, discount, advance and link on the subscription.
 */
async function openBalanceCheckout(deal: PaymentLink, options: { readonly trial?: readonly string[]; readonly frozenFirstPayment?: number } = {}): Promise<{ subscription: Subscription; firstPaymentCents: number | null }> {
  const interval = deal.billingInterval === "year" ? "year" : "month";
  const lines = dealLines({ services: deal.services as never, interval, currency: "INR", kind: "b2b", customPrices: linkCustomPrices(deal) });
  const { balanceCents } = dealAmounts({ currency: "INR", kind: "b2b", listCents: deal.setupFeeListCents ?? 0, discountCents: deal.setupFeeDiscountCents ?? 0, advance: { kind: "amount", cents: deal.advanceCents ?? 0 } });
  const first = planFirstPayment({
    lines: lines.map((row) => ({ addOn: row.addOn, netCents: row.netCents, hadService: !(options.trial ?? []).includes(row.addOn) })),
    interval,
    provider: "fake",
    currency: "INR",
    discountCents: 0,
    dealBalanceCents: balanceCents,
  });
  const offer = first.kind === "offer" ? first : null;
  const bundled: NewBundledAddOn[] = lines.map((row) => ({
    addOn: row.addOn,
    listAmountCents: row.listCents,
    offerDiscountAmountCents: 0,
    netAmountCents: row.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    trialPriceCents: offer?.trialPriceByAddOn[row.addOn] ?? null,
  }));
  const firstChargeAt = offer === null ? null : addMonthsUtc(PAID_AT, offer.firstChargeMonths);
  const subscription = await openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
    billingInterval: interval,
    referralCodeId: null,
    discountAmountCents: 0,
    bundledAddOns: bundled,
    adCreditCents: 0,
    ...(offer === null ? {} : { firstPaymentCents: options.frozenFirstPayment ?? offer.firstPaymentCents, firstChargeAt }),
    websiteKind: deal.websiteKind,
    setupFeeListCents: deal.setupFeeListCents,
    setupFeeDiscountCents: deal.setupFeeDiscountCents,
    setupFeeNote: deal.setupFeeNote,
    setupFeeAdvanceCents: deal.advanceCents,
    paymentLinkId: deal.id,
    replacing: null,
    now: PAID_AT,
  });
  return { subscription, firstPaymentCents: offer?.firstPaymentCents ?? null };
}

function pay(subscription: Subscription) {
  return dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan, provider: "fake", providerPaymentId: "fake_pay_balance", paidAt: PAID_AT, discountAmountCents: 0 }),
  );
}

async function access(now: Date): Promise<boolean> {
  const state = await findBillingState(dbs.staff.db, businessId);
  return hasWebsiteService(state?.addOns ?? [], state?.subscription ?? null, now);
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
  if (found === null) throw new Error("No active INR plan was seeded");
  plan = found;
  await dbs.owner.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff@example.test", emailVerified: true });
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "deal-cafe", name: "Deal Cafe", currency: "INR", kind: "listing" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("payment 2 of a paid deal, monthly", () => {
  it("takes the balance and the website's first month (5,000 and 2,999: 7,999), starts the plan that day and opens no second project", async () => {
    const { link: deal, advanceInvoice } = await readyDeal();
    link = deal;
    expect(await access(PAID_AT)).toBe(false);
    expect(await count("select count(*) as count from projects")).toBe(1);

    const { subscription, firstPaymentCents } = await openBalanceCheckout(deal);
    expect(firstPaymentCents).toBe(799_900);
    expect(subscription).toMatchObject({ firstPaymentCents: 799_900, firstChargeAt: MONTH_ON });

    const activation = await pay(subscription);

    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_balance")).toMatchObject({ kind: "initial", amountCents: 799_900, status: "captured" });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ status: "active", paidThroughAt: MONTH_ON, setupFeeListCents: NET, setupFeeAdvanceCents: ADVANCE });
    expect(await findPaymentLinkById(dbs.staff.db, deal.id)).toMatchObject({ subscriptionId: subscription.id, paidAt: PAID_AT });
    expect(await count("select count(*) as count from projects")).toBe(1);
    expect(activation.openedMembership).toBeNull();
    expect(await access(PAID_AT)).toBe(true);
    expect((await findBillingState(dbs.staff.db, businessId))?.dealState).toBeNull();

    // Invoice 2: the build line is the balance only, naming the agreed price, the advance, its date and its invoice; the total is the payment.
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(799_900);
    expect(invoice?.totalCents).toBe(activation.payment.amountCents);
    expect(invoice?.lines.map((row) => [row.description, row.unitAmountCents, row.discountAmountCents])).toEqual([
      [`Website design and build (B2B website): balance. Agreed price Rs 10,000, advance Rs 5,000 received on 27 Nov 2026, invoice ${advanceInvoice}.`, 500_000, 0],
      ["Website Management", WEBSITE_MONTH, 0],
    ]);
  });

  it("takes Social Media's first month at 1 beside it: 8,000, and invoices it at 1", async () => {
    const { link: deal } = await readyDeal({ services: ["managed-website", "social-media"] });

    const { subscription, firstPaymentCents } = await openBalanceCheckout(deal, { trial: ["social-media"] });
    expect(firstPaymentCents).toBe(800_000);
    const activation = await pay(subscription);

    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_balance"))?.amountCents).toBe(800_000);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(800_000);
    expect(invoice?.lines.map((row) => row.unitAmountCents)).toEqual([500_000, WEBSITE_MONTH, 100]);
    const social = (await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id)).find((row) => row.addOn === "social-media");
    expect(social).toMatchObject({ status: "active", netAmountCents: WEBSITE_MONTH });
  });

  it("rejects a payment whose frozen first payment does not agree with its lines and the balance", async () => {
    const { link: deal } = await readyDeal();
    const { subscription } = await openBalanceCheckout(deal, { frozenFirstPayment: 799_800 });

    await expect(pay(subscription)).rejects.toThrow(/froze a first payment of 799800 but its lines and build fee come to 799900/);
    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_balance")).toBeNull();
    expect(await findPaymentLinkById(dbs.staff.db, deal.id)).toMatchObject({ paidAt: null });
    expect(await access(PAID_AT)).toBe(false);
  });

  it("opens the ordinary checkout, takes only the website's month, and says on the invoice that the advance paid the whole build", async () => {
    const { link: deal, advanceInvoice } = await readyDeal({ advanceCents: NET });

    const { subscription, firstPaymentCents } = await openBalanceCheckout(deal);
    expect(firstPaymentCents).toBeNull();
    const activation = await pay(subscription);

    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_balance"))?.amountCents).toBe(WEBSITE_MONTH);
    expect(await findPaymentLinkById(dbs.staff.db, deal.id)).toMatchObject({ subscriptionId: subscription.id, paidAt: PAID_AT });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(WEBSITE_MONTH);
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]?.note).toContain(`Website build paid in full by the advance. Agreed price Rs 10,000, advance Rs 10,000 received on 27 Nov 2026, invoice ${advanceInvoice}.`);
    expect(await count("select count(*) as count from projects")).toBe(1);
  });
});

describe("payment 2 of a paid deal, yearly", () => {
  it("takes the balance and the year's price, starts the plan a year on and pays through it", async () => {
    const { link: deal } = await readyDeal({ billingInterval: "year" });

    const { subscription, firstPaymentCents } = await openBalanceCheckout(deal);
    expect(firstPaymentCents).toBe(ADVANCE + WEBSITE_YEAR);
    const activation = await pay(subscription);

    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ status: "active", billingInterval: "year", paidThroughAt: YEAR_ON, firstChargeAt: YEAR_ON });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(ADVANCE + WEBSITE_YEAR);
    expect(invoice?.lines.map((row) => row.unitAmountCents)).toEqual([500_000, WEBSITE_YEAR]);
    expect(await access(new Date("2027-06-01T00:00:00.000Z"))).toBe(true);
  });
});
