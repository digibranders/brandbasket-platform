import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  findBillingState,
  findDealForBusiness,
  findPaymentByProviderId,
  findTaxInvoiceByPaymentId,
  insertAdvanceCharge,
  insertPaymentLink,
  paymentLinks,
  projects,
  users,
  type Charge,
  type PaymentLink,
} from "@brandbasket/db";
import { openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { deriveSiteStatus, hasBillingAccess, hasWebsiteService } from "@brandbasket/billing";
import { summariseBilling } from "./lib/billing/status";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";

// The payment recording is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/** Plan 66, payment 1: the advance of a paid deal, recorded through the one function every charge payment path calls. */

const STAFF = "staff-deal";
const PAID_AT = new Date("2026-11-27T10:00:00.000Z");
const ADVANCE = 500_000;
const DESCRIPTION = "Website design and build: advance (Ecommerce store)";

let dbs: TestDatabases;
let businessId = "";
let link: PaymentLink;
let charge: Charge;

async function count(statement: string): Promise<number> {
  const rows = await querySql<{ count: string }>(dbs.owner, statement);
  return Number(rows[0]?.count ?? 0);
}

function pay(providerPaymentId: string, amountCents = ADVANCE) {
  return dbs.staff.db.transaction((tx) =>
    recordChargePaymentWithInvoice(tx, {
      chargeId: charge.id,
      businessId,
      provider: "fake",
      providerPaymentId,
      amountCents,
      currency: "INR",
      paidAt: PAID_AT,
      now: PAID_AT,
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
  await dbs.owner.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff@example.test", emailVerified: true });
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "deal-cafe", name: "Deal Cafe", currency: "INR", kind: "listing" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  link = await insertPaymentLink(dbs.staff.db, {
    tokenHash: "deal-hash",
    businessId,
    countryCode: "IN",
    currency: "INR",
    services: ["managed-website", "social-media"],
    billingInterval: "month",
    dealType: "paid",
    websiteKind: "ecommerce",
    setupFeeListCents: 1_000_000,
    setupFeeDiscountCents: 0,
    advanceCents: ADVANCE,
    expiresAt: new Date("2026-12-27T00:00:00.000Z"),
    createdByStaffId: STAFF,
  } satisfies typeof paymentLinks.$inferInsert);
  charge = await dbs.staff.db.transaction((tx) =>
    insertAdvanceCharge(tx, { businessId, linkId: link.id, amountCents: ADVANCE, currency: "INR", description: DESCRIPTION, taxRateBasisPoints: 1800 }),
  );
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the advance of a paid deal", () => {
  it("marks the advance paid, opens the project and the account, records a charge payment and invoices it", async () => {
    const recorded = await pay("fake_pay_advance");

    expect(recorded).toMatchObject({ outcome: "paid", alreadyRecorded: false, openedMembership: { businessName: "Deal Cafe" } });
    const paid = await findDealForBusiness(dbs.staff.db, businessId);
    expect(paid?.advancePaidAt?.toISOString()).toBe(PAID_AT.toISOString());
    expect(await querySql(dbs.owner, "select kind from businesses")).toEqual([{ kind: "website" }]);
    expect(await querySql(dbs.owner, "select status, website_kind from projects")).toEqual([{ status: "onboarding", website_kind: "ecommerce" }]);

    const payment = await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_advance");
    expect(payment).toMatchObject({ kind: "charge", subscriptionId: null, amountCents: ADVANCE, currency: "INR" });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id);
    expect(invoice?.totalCents).toBe(ADVANCE);
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]).toMatchObject({ description: DESCRIPTION, quantity: 1, unitAmountCents: ADVANCE });
  });

  it("reads as building, and not as ever paid", async () => {
    await pay("fake_pay_advance");

    const state = await findBillingState(dbs.staff.db, businessId);
    if (state === null) throw new Error("The business has no billing state");
    expect(state).toMatchObject({ hasEverPaid: false, dealState: "building", dealLinkId: link.id });
    expect(summariseBilling(state, PAID_AT)).toMatchObject({ status: "building", hasAccess: false, dealState: "building" });
  });

  it("reads as unpaid with no deal state before the advance is paid", async () => {
    const state = await findBillingState(dbs.staff.db, businessId);
    if (state === null) throw new Error("The business has no billing state");
    expect(summariseBilling(state, PAID_AT)).toMatchObject({ status: "unpaid", dealState: null, dealLinkId: null });
  });

  it("opens one project, one invoice and one advance date when the same payment is delivered twice", async () => {
    const first = await pay("fake_pay_advance");
    const again = await pay("fake_pay_advance");

    expect(again.alreadyRecorded).toBe(true);
    expect(again.openedMembership).toBeNull();
    expect(again.payment.id).toBe(first.payment.id);
    expect(await count("select count(*) as count from projects")).toBe(1);
    expect(await count("select count(*) as count from tax_invoices")).toBe(1);
    expect(await count("select count(*) as count from payments")).toBe(1);
  });

  it("keeps a payment of the wrong amount for staff and starts nothing", async () => {
    const recorded = await pay("fake_pay_short", ADVANCE - 100);

    expect(recorded).toMatchObject({ outcome: "amount-mismatch", openedMembership: null });
    expect(recorded.payment.attentionReason).toBe("amount_mismatch");
    expect(await findDealForBusiness(dbs.staff.db, businessId)).toBeNull();
    expect(await querySql(dbs.owner, "select kind from businesses")).toEqual([{ kind: "listing" }]);
    expect(await count("select count(*) as count from projects")).toBe(0);
    expect(await count("select count(*) as count from tax_invoices")).toBe(0);
  });

  it("does not add a second project to a business that is already a client with one", async () => {
    await dbs.owner.db.update(businesses).set({ kind: "website" });
    await dbs.owner.db.insert(projects).values({ businessId });
    const recorded = await pay("fake_pay_advance");

    expect(recorded).toMatchObject({ outcome: "paid", openedMembership: null });
    expect((await findDealForBusiness(dbs.staff.db, businessId))?.advancePaidAt).not.toBeNull();
    expect(await count("select count(*) as count from projects")).toBe(1);
  });

  it("opens the onboarding project for a business that was already a website client with none (plan 66)", async () => {
    await dbs.owner.db.update(businesses).set({ kind: "website" });
    const recorded = await pay("fake_pay_advance");

    expect(recorded).toMatchObject({ outcome: "paid", openedMembership: null });
    expect(await querySql(dbs.owner, "select status, website_kind from projects")).toEqual([{ status: "onboarding", website_kind: "ecommerce" }]);
    await pay("fake_pay_advance");
    expect(await count("select count(*) as count from projects")).toBe(1);
  });

  it("leaves a business with a recorded advance a website client with a project, reading as building, with its preview site served and not offline", async () => {
    await pay("fake_pay_advance");

    expect(await querySql(dbs.owner, "select kind from businesses")).toEqual([{ kind: "website" }]);
    expect(await count("select count(*) as count from projects")).toBe(1);
    const state = await findBillingState(dbs.staff.db, businessId);
    if (state === null) throw new Error("The business has no billing state");
    const billing = summariseBilling(state, PAID_AT);
    expect(billing).toMatchObject({ status: "building", hasAccess: false, hasWebsite: false });
    // What siteHasAccess reads: no website subscription, but the deal stands, so the preview is served.
    expect(hasWebsiteService(state.addOns, state.subscription, PAID_AT) || state.dealState !== null).toBe(true);
    expect(hasBillingAccess(state.subscription, PAID_AT)).toBe(false);
    // A project that is not live is never reported offline, whatever billing says.
    expect(deriveSiteStatus({ projectStatus: "onboarding", hasWebsite: billing.hasWebsite })).toEqual({ kind: "not_launched" });
  });
});
