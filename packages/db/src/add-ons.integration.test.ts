import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  AddOnAlreadyBillingError,
  AddOnPaymentConflictError,
  AddOnSubscriptionNotPayableError,
  cancelStaleAddOnCheckout,
  changeAddOnEndKind,
  findAddOnProviderPlan,
  findAddOnSubscription,
  findAddOnSubscriptionByProviderId,
  findAddOnSubscriptionForPayment,
  findLifetimeOfferStanding,
  insertAddOnSubscription,
  listAddOnSubscriptionsForBusiness,
  listAddOnSubscriptionsForStaff,
  listAddOnsToContact,
  listPressReleasesForBusiness,
  markAddOnCancelled,
  markAddOnContacted,
  recordAddOnPayment,
  recordUnappliedAddOnPayment,
  saveAddOnProviderPlan,
  scheduleAddOnEnd,
  setPressReleaseStatus,
  updateAddOnStatus,
  type AddOnPaymentRecord,
  type NewAddOnSubscription,
} from "./queries/add-ons";
import {
  findActivePlan,
  findBillingState,
  findFirstPayment,
  insertSubscription,
  listReceiptsForBusiness,
  recordPaymentAndActivate,
  type UnappliedPaymentReason,
} from "./queries/billing";
import { isInvoiceablePayment, listPaymentsWithoutTaxInvoice } from "./queries/tax-invoices";
import { insertCharge } from "./queries/charges";
import { listClients } from "./queries/clients";
import {
  addOnPayments,
  addOnProviderPlans,
  addOnSubscriptions,
  businesses,
  businessMembers,
  payments,
  pressReleases,
  users,
} from "./schema";
import { withTenantScope } from "./scope";
import { captureErrorText, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "./testing";

const OWNER_A = "owner-a";
const OWNER_B = "owner-b";
const STAFF = "staff-1";
const NOW = new Date("2026-10-02T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-02T09:00:00.000Z");
const LATER = new Date("2026-10-20T09:00:00.000Z");

let dbs: TestDatabases;
let businessA = "";
let businessB = "";

/** Social media at the list price, no Premium discount: 10,000 net, 18% GST, 11,800 charged. */
function addOnRow(businessId: string, overrides: Partial<NewAddOnSubscription> = {}): NewAddOnSubscription {
  return {
    id: uuidv7(),
    businessId,
    addOn: "social-media",
    listAmountCents: 1_000_000,
    discountAmountCents: 0,
    netAmountCents: 1_000_000,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: 1_180_000,
    currency: "INR",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${uuidv7()}`,
    ...overrides,
  };
}

function paymentFor(addOnSubscriptionId: string, providerPaymentId: string, overrides: Partial<AddOnPaymentRecord> = {}): AddOnPaymentRecord {
  return {
    addOnSubscriptionId,
    provider: "fake",
    providerPaymentId,
    amountCents: 1_180_000,
    currency: "INR",
    paidAt: NOW,
    periodStart: NOW,
    periodEnd: PERIOD_END,
    ...overrides,
  };
}

function record(input: AddOnPaymentRecord): ReturnType<typeof recordAddOnPayment> {
  return dbs.staff.db.transaction((tx) => recordAddOnPayment(tx, input));
}

function asOwner<T>(businessId: string, userId: string, work: Parameters<typeof withTenantScope<T>>[2]): Promise<T> {
  return withTenantScope(dbs.app.db, { userId, businessId }, work);
}

/** A paid press release: a charge, and the row that tracks its status. */
async function pressReleaseFor(businessId: string, createdAt: Date): Promise<string> {
  const charge = await insertCharge(dbs.staff.db, {
    businessId,
    kind: "press_release",
    description: "Press release",
    quantity: 1,
    unitAmountCents: 700_000,
    taxRateBasisPoints: 1_800,
    amountCents: 826_000,
    currency: "INR",
    createdByStaffId: null,
  });
  const [row] = await dbs.staff.db.insert(pressReleases).values({ businessId, chargeId: charge.id, createdAt }).returning({ id: pressReleases.id });
  if (row === undefined) throw new Error("Inserting a press release returned no row");
  return row.id;
}

/** A plan payment for the business, so tests can tell it apart from an add-on payment. */
async function payForPlan(businessId: string, providerSubscriptionId: string, paidAt: Date): Promise<string> {
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No INR plan seeded");
  const subscription = await insertSubscription(dbs.staff.db, { businessId, planId: plan.id, provider: "fake", providerSubscriptionId });
  const { payment } = await recordPaymentAndActivate(dbs.staff.db, {
    businessId,
    subscriptionId: subscription.id,
    provider: "fake",
    providerPaymentId: `fake_pay_${providerSubscriptionId}`,
    kind: "initial",
    amountCents: 353_882,
    currency: "INR",
    paidAt,
    paidThroughAt: paidAt,
    commitmentEndsAt: paidAt,
    currentPeriodEnd: paidAt,
  });
  return payment.id;
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
    { id: OWNER_A, name: "Asha", email: "asha@example.com" },
    { id: OWNER_B, name: "Ben", email: "ben@example.com" },
    { id: STAFF, name: "Staff", email: "staff@example.com" },
  ]);
  const inserted = await dbs.staff.db
    .insert(businesses)
    .values([
      { slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" },
      { slug: "riverside", name: "Riverside", currency: "INR" },
    ])
    .returning({ id: businesses.id, slug: businesses.slug });
  businessA = inserted.find((row) => row.slug === "chennai-cafe")?.id ?? "";
  businessB = inserted.find((row) => row.slug === "riverside")?.id ?? "";
  await dbs.staff.db.insert(businessMembers).values([
    { businessId: businessA, userId: OWNER_A, role: "owner" },
    { businessId: businessB, userId: OWNER_B, role: "owner" },
  ]);
});

describe("add-on subscription rows", () => {
  it("stores a row, finds it by the provider's id, and allows one unpaid checkout per add-on", async () => {
    const row = addOnRow(businessA, { providerSubscriptionId: "fake_sub_one" });
    const inserted = await insertAddOnSubscription(dbs.staff.db, row);

    expect(inserted).toMatchObject({ id: row.id, businessId: businessA, addOn: "social-media", status: "incomplete", activatedAt: null });
    expect(await findAddOnSubscriptionByProviderId(dbs.staff.db, "fake", "fake_sub_one")).toMatchObject({ id: row.id });
    expect(await findAddOnSubscriptionByProviderId(dbs.staff.db, "fake", "fake_sub_nope")).toBeNull();
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ id: row.id });
    expect(await findAddOnSubscription(dbs.staff.db, businessB, row.id)).toBeNull();
    expect(await findAddOnSubscription(dbs.staff.db, businessA, "not-a-uuid")).toBeNull();

    const error = await captureErrorText(insertAddOnSubscription(dbs.staff.db, addOnRow(businessA)));
    expect(error).toMatch(/add_on_subscriptions_one_checkout_idx/);

    await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { addOn: "advertising" }));
    expect((await listAddOnSubscriptionsForBusiness(dbs.staff.db, businessA)).map((found) => found.addOn)).toEqual([
      "advertising",
      "social-media",
    ]);
  });

  it("cancels an unpaid checkout, and leaves a paid one alone", async () => {
    const unpaid = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await dbs.staff.db.transaction((tx) => cancelStaleAddOnCheckout(tx, unpaid.id, LATER));
    expect(await findAddOnSubscription(dbs.staff.db, businessA, unpaid.id)).toMatchObject({ status: "cancelled", endedAt: LATER });

    const paid = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(paid.id, "fake_pay_paid"));
    await dbs.staff.db.transaction((tx) => cancelStaleAddOnCheckout(tx, paid.id, LATER));
    expect(await findAddOnSubscription(dbs.staff.db, businessA, paid.id)).toMatchObject({ status: "active", endedAt: null });
  });
});

describe("findLifetimeOfferStanding", () => {
  /** A paid add-on row, with the offer in its price when `offerCents` is given. */
  async function paidRow(businessId: string, addOn: "social-media" | "advertising", offerCents: number, paymentId: string): Promise<void> {
    const list = addOn === "social-media" ? 200_000 : 400_000;
    const row = await insertAddOnSubscription(
      dbs.staff.db,
      addOnRow(businessId, {
        addOn,
        listAmountCents: list,
        discountAmountCents: offerCents,
        offerDiscountAmountCents: offerCents,
        netAmountCents: list - offerCents,
        chargedAmountCents: Math.round((list - offerCents) * 1.18),
      }),
    );
    await record(paymentFor(row.id, paymentId, { amountCents: row.chargedAmountCents }));
  }

  it("claims an add-on only once its first payment is recorded with the offer in its price", async () => {
    expect(await findLifetimeOfferStanding(dbs.staff.db, businessA)).toEqual({ claimed: [] });
    // Unpaid: not yet claimed.
    await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { offerDiscountAmountCents: 10_000, discountAmountCents: 10_000, netAmountCents: 990_000, chargedAmountCents: 1_168_200 }));
    expect(await findLifetimeOfferStanding(dbs.staff.db, businessA)).toEqual({ claimed: [] });
  });

  it("claims each add-on on its own: one bought with the offer does not claim the one bought without it", async () => {
    await paidRow(businessA, "social-media", 10_000, "fake_pay_offer_1");
    await paidRow(businessA, "advertising", 0, "fake_pay_offer_2");

    expect(await findLifetimeOfferStanding(dbs.staff.db, businessA)).toEqual({ claimed: ["social-media"] });
    expect(await findLifetimeOfferStanding(dbs.staff.db, businessB)).toEqual({ claimed: [] });
    expect(await findLifetimeOfferStanding(dbs.staff.db, "not-a-uuid")).toEqual({ claimed: [] });
  });

  it("claims a cancelled add-on still: the discount is for life", async () => {
    await paidRow(businessA, "advertising", 20_000, "fake_pay_offer_3");
    await dbs.staff.db.update(addOnSubscriptions).set({ status: "cancelled", endedAt: NOW }).where(eq(addOnSubscriptions.businessId, businessA));
    expect(await findLifetimeOfferStanding(dbs.staff.db, businessA)).toEqual({ claimed: ["advertising"] });
  });
});

describe("recordAddOnPayment", () => {
  it("records the payment, links it and opens the add-on for the period it paid", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));

    const first = await record(paymentFor(row.id, "fake_pay_1", { providerStatus: "active" }));

    expect(first.alreadyRecorded).toBe(false);
    expect(first.predecessorsToCancel).toEqual([]);
    expect(first.payment).toMatchObject({
      businessId: businessA,
      kind: "add_on",
      subscriptionId: null,
      status: "captured",
      amountCents: 1_180_000,
      attentionReason: null,
    });
    const links = await dbs.staff.db.select().from(addOnPayments).where(eq(addOnPayments.paymentId, first.payment.id));
    expect(links).toEqual([{ paymentId: first.payment.id, addOnSubscriptionId: row.id, businessId: businessA }]);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({
      status: "active",
      activatedAt: NOW,
      currentPeriodStart: NOW,
      currentPeriodEnd: PERIOD_END,
      haltedAt: null,
      providerStatus: "active",
    });

    // The same provider payment again writes nothing, and the period does not move.
    const again = await record(paymentFor(row.id, "fake_pay_1", { periodStart: PERIOD_END, periodEnd: new Date("2026-12-02T09:00:00.000Z") }));
    expect(again).toMatchObject({ alreadyRecorded: true, predecessorsToCancel: [], payment: { id: first.payment.id } });
    expect(await dbs.staff.db.select().from(addOnPayments)).toHaveLength(1);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ currentPeriodEnd: PERIOD_END });
  });

  it("keeps the first activation date on a renewal and brings a halted add-on back", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(row.id, "fake_pay_1"));
    await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "halted", providerStatus: "halted", haltedAt: LATER, now: LATER });

    await record(paymentFor(row.id, "fake_pay_2", { paidAt: LATER, periodStart: PERIOD_END, periodEnd: new Date("2026-12-02T09:00:00.000Z") }));

    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({
      status: "active",
      activatedAt: NOW,
      currentPeriodStart: PERIOD_END,
      haltedAt: null,
    });
  });

  it("refuses an amount that is not whole paise, and a row that does not exist", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await expect(record(paymentFor(row.id, "fake_pay_float", { amountCents: 1_180_000.5 }))).rejects.toThrow(/whole minor units/);
    await expect(record(paymentFor(uuidv7(), "fake_pay_missing"))).rejects.toThrow(/No add-on subscription/);
  });

  it("cancels a halted predecessor when its Pay now replacement is paid", async () => {
    const halted = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { providerSubscriptionId: "fake_sub_old" }));
    await record(paymentFor(halted.id, "fake_pay_old"));
    await updateAddOnStatus(dbs.staff.db, { id: halted.id, status: "halted", providerStatus: "halted", haltedAt: LATER, now: LATER });
    const replacement = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { providerSubscriptionId: "fake_sub_new", continuesId: halted.id }));

    const result = await record(paymentFor(replacement.id, "fake_pay_new", { paidAt: LATER, periodStart: LATER, periodEnd: new Date("2026-11-20T09:00:00.000Z") }));

    expect(result.predecessorsToCancel).toEqual([{ provider: "fake", providerSubscriptionId: "fake_sub_old" }]);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, halted.id)).toMatchObject({ status: "cancelled", endedAt: LATER });
    expect(await findAddOnSubscription(dbs.staff.db, businessA, replacement.id)).toMatchObject({ status: "active", activatedAt: LATER });

    // Only one row for the add-on bills next: the one-billing index would refuse a second.
    const live = (await listAddOnSubscriptionsForBusiness(dbs.staff.db, businessA)).filter((found) => found.status === "active");
    expect(live.map((found) => found.id)).toEqual([replacement.id]);
  });

  it("leaves a predecessor that is not halted alone", async () => {
    const earlier = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { providerSubscriptionId: "fake_sub_old" }));
    await record(paymentFor(earlier.id, "fake_pay_old"));
    await dbs.staff.db.update(addOnSubscriptions).set({ endKind: "pause", endRequestedAt: NOW }).where(eq(addOnSubscriptions.id, earlier.id));
    const successor = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { providerSubscriptionId: "fake_sub_kept", continuesId: earlier.id }));

    const result = await record(paymentFor(successor.id, "fake_pay_kept"));

    expect(result.predecessorsToCancel).toEqual([]);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, earlier.id)).toMatchObject({ status: "active", endKind: "pause" });
  });
});

describe("buying again after a halted add-on", () => {
  it("closes a halted row that is past its grace and activates the new purchase", async () => {
    const halted = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { providerSubscriptionId: "fake_sub_halted" }));
    await record(paymentFor(halted.id, "fake_pay_old"));
    await updateAddOnStatus(dbs.staff.db, { id: halted.id, status: "halted", providerStatus: "halted", haltedAt: NOW, now: NOW });
    // A fresh Buy after the 7 days: no continues_id.
    const bought = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { providerSubscriptionId: "fake_sub_bought" }));

    const result = await record(paymentFor(bought.id, "fake_pay_bought", { paidAt: LATER, periodStart: LATER, periodEnd: new Date("2026-11-20T09:00:00.000Z") }));

    expect(result.predecessorsToCancel).toEqual([{ provider: "fake", providerSubscriptionId: "fake_sub_halted" }]);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, halted.id)).toMatchObject({ status: "cancelled", endedAt: LATER });
    expect(await findAddOnSubscription(dbs.staff.db, businessA, bought.id)).toMatchObject({ status: "active" });
  });

  it("leaves halted rows of another add-on or another business alone", async () => {
    const otherAddOn = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { addOn: "advertising" }));
    await record(paymentFor(otherAddOn.id, "fake_pay_pm"));
    await updateAddOnStatus(dbs.staff.db, { id: otherAddOn.id, status: "halted", providerStatus: "halted", haltedAt: NOW, now: NOW });
    const otherBusiness = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessB));
    await record(paymentFor(otherBusiness.id, "fake_pay_b"));
    await updateAddOnStatus(dbs.staff.db, { id: otherBusiness.id, status: "halted", providerStatus: "halted", haltedAt: NOW, now: NOW });
    const bought = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));

    const result = await record(paymentFor(bought.id, "fake_pay_bought"));

    expect(result.predecessorsToCancel).toEqual([]);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, otherAddOn.id)).toMatchObject({ status: "halted" });
    expect(await findAddOnSubscription(dbs.staff.db, businessB, otherBusiness.id)).toMatchObject({ status: "halted" });
  });

  it("refuses to open a second billing row for the add-on, and writes nothing", async () => {
    const billing = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(billing.id, "fake_pay_billing"));
    const second = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));

    await expect(record(paymentFor(second.id, "fake_pay_second", { paidAt: LATER }))).rejects.toThrow(AddOnAlreadyBillingError);

    expect(await dbs.staff.db.select().from(addOnPayments)).toHaveLength(1);
    expect(await dbs.staff.db.select({ id: payments.id }).from(payments)).toHaveLength(1);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, second.id)).toMatchObject({ status: "incomplete", activatedAt: null });
    expect(await findAddOnSubscription(dbs.staff.db, businessA, billing.id)).toMatchObject({ status: "active" });
  });

  it("does not count a row that is ending as billing", async () => {
    const ending = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(ending.id, "fake_pay_ending"));
    await dbs.staff.db.transaction((tx) => scheduleAddOnEnd(tx, { id: ending.id, kind: "cancel", now: NOW, staffUserId: null }));
    const kept = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));

    await expect(record(paymentFor(kept.id, "fake_pay_kept"))).resolves.toMatchObject({ alreadyRecorded: false });
  });
});

describe("a provider payment id that belongs to something else", () => {
  it("is refused when another add-on row recorded it", async () => {
    const one = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(one.id, "fake_pay_shared"));
    const two = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessB));

    await expect(record(paymentFor(two.id, "fake_pay_shared"))).rejects.toThrow(AddOnPaymentConflictError);
    const unapplied = { ...paymentFor(two.id, "fake_pay_shared"), reason: "already_paid" as const, now: LATER };
    await expect(dbs.staff.db.transaction((tx) => recordUnappliedAddOnPayment(tx, unapplied))).rejects.toThrow(AddOnPaymentConflictError);

    expect(await findAddOnSubscription(dbs.staff.db, businessB, two.id)).toMatchObject({ status: "incomplete" });
    expect(await dbs.staff.db.select().from(addOnPayments)).toHaveLength(1);
  });

  it("is refused when a plan payment used it", async () => {
    await payForPlan(businessA, "fake_sub_plan", NOW); // provider payment id fake_pay_fake_sub_plan
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));

    await expect(record(paymentFor(row.id, "fake_pay_fake_sub_plan"))).rejects.toThrow(AddOnPaymentConflictError);
    const unapplied = { ...paymentFor(row.id, "fake_pay_fake_sub_plan"), reason: "already_paid" as const, now: LATER };
    await expect(dbs.staff.db.transaction((tx) => recordUnappliedAddOnPayment(tx, unapplied))).rejects.toThrow(AddOnPaymentConflictError);

    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ status: "incomplete" });
  });

  it("still reports an unapplied add-on payment redelivered for its own row", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const unapplied = { ...paymentFor(row.id, "fake_pay_own"), reason: "already_paid" as const, now: LATER };
    await dbs.staff.db.transaction((tx) => recordUnappliedAddOnPayment(tx, unapplied));

    const again = await dbs.staff.db.transaction((tx) => recordUnappliedAddOnPayment(tx, unapplied));

    expect(again.alreadyRecorded).toBe(true);
  });
});

describe("a payment on a cancelled add-on", () => {
  it("is refused and writes nothing", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(row.id, "fake_pay_1"));
    await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "cancelled", providerStatus: "cancelled", endedAt: LATER, now: LATER });

    await expect(record(paymentFor(row.id, "fake_pay_after", { paidAt: LATER }))).rejects.toThrow(AddOnSubscriptionNotPayableError);

    expect(await dbs.staff.db.select().from(addOnPayments)).toHaveLength(1);
    expect(await dbs.staff.db.select({ id: payments.id }).from(payments)).toHaveLength(1);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ status: "cancelled", endedAt: LATER });
  });

  it("still reports a redelivery of a payment recorded before the cancel", async () => {
    const halted = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const first = await record(paymentFor(halted.id, "fake_pay_old"));
    await updateAddOnStatus(dbs.staff.db, { id: halted.id, status: "halted", providerStatus: "halted", haltedAt: LATER, now: LATER });
    const replacement = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { continuesId: halted.id }));
    await record(paymentFor(replacement.id, "fake_pay_new", { paidAt: LATER }));
    expect(await findAddOnSubscription(dbs.staff.db, businessA, halted.id)).toMatchObject({ status: "cancelled" });

    const again = await record(paymentFor(halted.id, "fake_pay_old"));

    expect(again).toMatchObject({ alreadyRecorded: true, predecessorsToCancel: [], payment: { id: first.payment.id } });
  });
});

describe("scheduling an end", () => {
  it("marks an active add-on as ending, once, with who asked", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(row.id, "fake_pay_1"));

    const scheduled = await dbs.staff.db.transaction((tx) => scheduleAddOnEnd(tx, { id: row.id, kind: "cancel", now: LATER, staffUserId: STAFF }));
    expect(scheduled).toBe("scheduled");
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({
      endKind: "cancel",
      endRequestedAt: LATER,
      endRequestedByStaffId: STAFF,
      status: "active",
    });

    // Asking again, even for the other kind, changes nothing.
    const again = await dbs.staff.db.transaction((tx) => scheduleAddOnEnd(tx, { id: row.id, kind: "pause", now: new Date("2026-10-21T09:00:00.000Z"), staffUserId: null }));
    expect(again).toBe("already");
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ endKind: "cancel", endRequestedAt: LATER, endRequestedByStaffId: STAFF });
  });

  it("refuses a row that is not active, and one that does not exist", async () => {
    const unpaid = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const cancelled = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessB));
    await record(paymentFor(cancelled.id, "fake_pay_b"));
    await updateAddOnStatus(dbs.staff.db, { id: cancelled.id, status: "cancelled", providerStatus: "cancelled", endedAt: LATER, now: LATER });

    const end = (id: string): Promise<string> =>
      dbs.staff.db.transaction((tx) => scheduleAddOnEnd(tx, { id, kind: "cancel", now: LATER, staffUserId: null }));
    expect(await end(cancelled.id)).toBe("not-active");
    expect(await end(unpaid.id)).toBe("not-active");
    expect(await end(uuidv7())).toBe("not-active");
    expect(await findAddOnSubscription(dbs.staff.db, businessB, cancelled.id)).toMatchObject({ endKind: null });
  });
});

describe("changing the kind of an end", () => {
  const change = (id: string, kind: "cancel" | "pause", staffUserId: string | null): Promise<string> =>
    dbs.staff.db.transaction((tx) => changeAddOnEndKind(tx, { id, kind, now: LATER, staffUserId }));

  async function endingRow(kind: "cancel" | "pause", businessId = businessA): Promise<string> {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessId));
    await record(paymentFor(row.id, `fake_pay_${row.id}`));
    await dbs.staff.db.transaction((tx) => scheduleAddOnEnd(tx, { id: row.id, kind, now: NOW, staffUserId: null }));
    return row.id;
  }

  it("turns a pending cancel into a pause, and a pause into a cancel, recording who asked and when", async () => {
    const id = await endingRow("cancel");

    expect(await change(id, "pause", STAFF)).toBe("changed");
    expect(await findAddOnSubscription(dbs.staff.db, businessA, id)).toMatchObject({
      status: "active",
      endKind: "pause",
      endRequestedAt: LATER,
      endRequestedByStaffId: STAFF,
      currentPeriodEnd: PERIOD_END,
    });

    expect(await change(id, "cancel", null)).toBe("changed");
    expect(await findAddOnSubscription(dbs.staff.db, businessA, id)).toMatchObject({
      endKind: "cancel",
      endRequestedAt: LATER,
      endRequestedByStaffId: null,
    });
  });

  it("changes nothing when the end is already of that kind, so the first request's time and author stand", async () => {
    const id = await endingRow("cancel");

    expect(await change(id, "cancel", STAFF)).toBe("unchanged");
    expect(await findAddOnSubscription(dbs.staff.db, businessA, id)).toMatchObject({ endKind: "cancel", endRequestedAt: NOW, endRequestedByStaffId: null });
  });

  it("refuses a row that is not an active add-on with an end set, and one that does not exist", async () => {
    const running = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(running.id, "fake_pay_running"));
    const ended = await endingRow("cancel", businessB);
    await updateAddOnStatus(dbs.staff.db, { id: ended, status: "cancelled", providerStatus: "cancelled", endedAt: LATER, now: LATER });
    const unpaid = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { addOn: "advertising" }));

    expect(await change(running.id, "pause", null)).toBe("not-ending");
    expect(await change(ended, "pause", null)).toBe("not-ending");
    expect(await change(unpaid.id, "pause", null)).toBe("not-ending");
    expect(await change(uuidv7(), "pause", null)).toBe("not-ending");
    expect(await findAddOnSubscription(dbs.staff.db, businessA, running.id)).toMatchObject({ endKind: null });
    expect(await findAddOnSubscription(dbs.staff.db, businessB, ended)).toMatchObject({ endKind: "cancel" });
  });
});

describe("updateAddOnStatus", () => {
  it("applies a status change and sets when it halted", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(row.id, "fake_pay_1"));

    await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "halted", providerStatus: "halted", haltedAt: LATER, now: LATER });

    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({
      status: "halted",
      providerStatus: "halted",
      haltedAt: LATER,
      endedAt: null,
    });
  });

  it("changes the row only while it is still in the status the caller read", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(row.id, "fake_pay_1"));

    const stale = await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "halted", providerStatus: "halted", haltedAt: LATER, now: LATER, expectedFrom: "past_due" });
    expect(stale).toBe(false);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ status: "active", haltedAt: null });

    const fresh = await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "halted", providerStatus: "halted", haltedAt: LATER, now: LATER, expectedFrom: "active" });
    expect(fresh).toBe(true);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ status: "halted", haltedAt: LATER });

    // Without a status to match, it applies; a cancelled row is not reopened and reports no change.
    expect(await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "cancelled", providerStatus: "cancelled", endedAt: LATER, now: LATER })).toBe(true);
    expect(await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "active", providerStatus: "active", now: LATER })).toBe(false);
  });

  it("never reopens a cancelled row", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(row.id, "fake_pay_1"));
    await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "cancelled", providerStatus: "cancelled", endedAt: LATER, now: LATER });

    await updateAddOnStatus(dbs.staff.db, { id: row.id, status: "active", providerStatus: "active", now: LATER });

    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ status: "cancelled", endedAt: LATER });
  });
});

describe("markAddOnCancelled", () => {
  it("cancels a row now and keeps an end date it already has", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(row.id, "fake_pay_1"));

    await dbs.staff.db.transaction((tx) => markAddOnCancelled(tx, row.id, LATER));
    await dbs.staff.db.transaction((tx) => markAddOnCancelled(tx, row.id, new Date("2026-10-25T09:00:00.000Z")));

    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({ status: "cancelled", endedAt: LATER });
  });
});

describe("recordUnappliedAddOnPayment", () => {
  it("stores the captured payment for staff with its link, and moves nothing", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const unapplied = { ...paymentFor(row.id, "fake_pay_late"), reason: "checkout_replaced" as const, now: LATER };

    const first = await dbs.staff.db.transaction((tx) => recordUnappliedAddOnPayment(tx, unapplied));

    expect(first.alreadyRecorded).toBe(false);
    expect(first.payment).toMatchObject({
      kind: "add_on",
      subscriptionId: null,
      status: "captured",
      attentionReason: "checkout_replaced",
      attentionResolvedAt: null,
    });
    const links = await dbs.staff.db.select().from(addOnPayments).where(eq(addOnPayments.paymentId, first.payment.id));
    expect(links).toHaveLength(1);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).toMatchObject({
      status: "incomplete",
      activatedAt: null,
      currentPeriodEnd: null,
    });

    const again = await dbs.staff.db.transaction((tx) => recordUnappliedAddOnPayment(tx, unapplied));
    expect(again).toMatchObject({ alreadyRecorded: true, payment: { id: first.payment.id } });
    expect(await dbs.staff.db.select().from(addOnPayments)).toHaveLength(1);
  });

  it("refuses a reason that means the payment applied", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const unapplied = { ...paymentFor(row.id, "fake_pay_x"), reason: "submission_failed" as unknown as UnappliedPaymentReason, now: LATER };
    await expect(dbs.staff.db.transaction((tx) => recordUnappliedAddOnPayment(tx, unapplied))).rejects.toThrow(/Not a reason for an unapplied payment/);
  });
});

describe("tax invoices for add-on payments", () => {
  it("never expects an invoice for money that bought nothing, and expects one for a payment that did", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const { payment: unapplied } = await dbs.staff.db.transaction((tx) =>
      recordUnappliedAddOnPayment(tx, { ...paymentFor(row.id, "fake_pay_late"), reason: "checkout_replaced", now: LATER }),
    );

    expect(isInvoiceablePayment(unapplied)).toBe(false);
    expect(await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessA)).toEqual([]);

    const { payment: applied } = await record(paymentFor(row.id, "fake_pay_applied"));
    expect(isInvoiceablePayment(applied)).toBe(true);
    expect((await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessA)).map((payment) => payment.id)).toEqual([applied.id]);
  });
});

describe("row-level security", () => {
  it("lets a customer read their own add-on rows, links and press releases, and nothing else's", async () => {
    const own = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const other = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessB));
    await record(paymentFor(own.id, "fake_pay_a"));
    await record(paymentFor(other.id, "fake_pay_b"));
    const releaseA = await pressReleaseFor(businessA, NOW);
    await pressReleaseFor(businessB, NOW);

    expect((await asOwner(businessA, OWNER_A, (tx) => listAddOnSubscriptionsForBusiness(tx, businessA))).map((row) => row.id)).toEqual([own.id]);
    expect(await asOwner(businessA, OWNER_A, (tx) => findAddOnSubscription(tx, businessB, other.id))).toBeNull();
    expect(await asOwner(businessA, OWNER_A, (tx) => tx.select().from(addOnPayments))).toHaveLength(1);
    expect((await asOwner(businessA, OWNER_A, (tx) => listPressReleasesForBusiness(tx, businessA))).map((row) => row.id)).toEqual([releaseA]);
    expect(await asOwner(businessA, OWNER_A, (tx) => listPressReleasesForBusiness(tx, businessB))).toEqual([]);
  });

  it("never lets the customer's connection write any of them", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const { payment } = await record(paymentFor(row.id, "fake_pay_a"));
    const release = await pressReleaseFor(businessA, NOW);
    const denied = /permission denied/i;

    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.insert(addOnSubscriptions).values(addOnRow(businessA, { addOn: "advertising" }))))).toMatch(denied);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.update(addOnSubscriptions).set({ status: "cancelled" }).where(eq(addOnSubscriptions.id, row.id))))).toMatch(denied);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.insert(addOnPayments).values({ paymentId: payment.id, addOnSubscriptionId: row.id, businessId: businessA })))).toMatch(denied);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.update(addOnPayments).set({ businessId: businessB })))).toMatch(denied);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.update(pressReleases).set({ status: "published" }).where(eq(pressReleases.id, release))))).toMatch(denied);
    expect(await captureErrorText(asOwner(businessA, OWNER_A, (tx) => tx.select().from(addOnProviderPlans)))).toMatch(denied);
  });

  it("keeps the record: staff cannot delete a row, and the public form cannot read one", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const denied = /permission denied/i;

    expect(await captureErrorText(dbs.staff.db.delete(addOnSubscriptions).where(eq(addOnSubscriptions.id, row.id)))).toMatch(denied);
    expect(await captureErrorText(dbs.publicRole.db.select().from(addOnSubscriptions))).toMatch(denied);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, row.id)).not.toBeNull();
  });
});

describe("what staff need to contact", () => {
  it("lists paid purchases not yet contacted and press releases still waiting, oldest first", async () => {
    const paidA = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(paidA.id, "fake_pay_a")); // activated 2026-10-02
    await insertAddOnSubscription(dbs.staff.db, addOnRow(businessB, { addOn: "advertising" })); // never paid
    const paidB = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessB));
    await record(paymentFor(paidB.id, "fake_pay_b", { paidAt: new Date("2026-10-03T09:00:00.000Z") }));
    const waiting = await pressReleaseFor(businessB, new Date("2026-10-01T09:00:00.000Z"));
    const done = await pressReleaseFor(businessA, new Date("2026-09-30T09:00:00.000Z"));
    await setPressReleaseStatus(dbs.staff.db, { id: done, status: "published", staffUserId: STAFF, now: LATER });

    const list = await listAddOnsToContact(dbs.staff.db, 10);

    expect(list).toEqual([
      { kind: "press-release", id: waiting, businessId: businessB, businessName: "Riverside", addOn: "press-release", at: new Date("2026-10-01T09:00:00.000Z") },
      { kind: "subscription", id: paidA.id, businessId: businessA, businessName: "Chennai Cafe", addOn: "social-media", at: NOW },
      { kind: "subscription", id: paidB.id, businessId: businessB, businessName: "Riverside", addOn: "social-media", at: new Date("2026-10-03T09:00:00.000Z") },
    ]);
    expect(await listAddOnsToContact(dbs.staff.db, 2)).toHaveLength(2);

    expect(await markAddOnContacted(dbs.staff.db, { id: paidA.id, staffUserId: STAFF, now: LATER })).toBe(true);
    expect(await markAddOnContacted(dbs.staff.db, { id: paidA.id, staffUserId: STAFF, now: LATER })).toBe(false);
    expect((await listAddOnsToContact(dbs.staff.db, 10)).map((item) => item.id)).toEqual([waiting, paidB.id]);
    expect(await findAddOnSubscription(dbs.staff.db, businessA, paidA.id)).toMatchObject({ contactedAt: LATER, contactedByStaffId: STAFF });

    await setPressReleaseStatus(dbs.staff.db, { id: waiting, status: "in_progress", staffUserId: STAFF, now: LATER });
    expect((await listAddOnsToContact(dbs.staff.db, 10)).map((item) => item.id)).toEqual([paidB.id]);
  });

  it("lists a business's press releases with what was paid, newest first", async () => {
    const older = await pressReleaseFor(businessA, new Date("2026-10-01T09:00:00.000Z"));
    const newer = await pressReleaseFor(businessA, new Date("2026-10-05T09:00:00.000Z"));

    const list = await listPressReleasesForBusiness(dbs.staff.db, businessA);

    expect(list.map((row) => row.id)).toEqual([newer, older]);
    expect(list[0]).toMatchObject({ status: "waiting", amountCents: 826_000, paidAt: null });
    expect(await setPressReleaseStatus(dbs.staff.db, { id: older, status: "published", staffUserId: STAFF, now: LATER })).toBe(true);
    expect(await setPressReleaseStatus(dbs.staff.db, { id: uuidv7(), status: "published", staffUserId: STAFF, now: LATER })).toBe(false);
    const after = await listPressReleasesForBusiness(dbs.staff.db, businessA);
    expect(after.find((row) => row.id === older)).toMatchObject({ status: "published", statusChangedAt: LATER, statusChangedByStaffId: STAFF });
  });
});

describe("press release status", () => {
  async function statusOf(businessId: string, id: string): Promise<string | undefined> {
    return (await listPressReleasesForBusiness(dbs.staff.db, businessId)).find((row) => row.id === id)?.status;
  }

  it("only moves forward: waiting, then in progress, then published", async () => {
    const id = await pressReleaseFor(businessA, NOW);
    expect(await setPressReleaseStatus(dbs.staff.db, { id, status: "in_progress", staffUserId: STAFF, now: NOW })).toBe(true);
    expect(await setPressReleaseStatus(dbs.staff.db, { id, status: "published", staffUserId: STAFF, now: LATER })).toBe(true);
    expect(await statusOf(businessA, id)).toBe("published");
  });

  it("lets a release jump from waiting straight to published", async () => {
    const id = await pressReleaseFor(businessA, NOW);
    expect(await setPressReleaseStatus(dbs.staff.db, { id, status: "published", staffUserId: STAFF, now: LATER })).toBe(true);
  });

  it("refuses to move backward, and leaves who set it and when as they were", async () => {
    const id = await pressReleaseFor(businessA, NOW);
    await setPressReleaseStatus(dbs.staff.db, { id, status: "published", staffUserId: STAFF, now: NOW });
    // A stale form posted after someone else published it.
    expect(await setPressReleaseStatus(dbs.staff.db, { id, status: "in_progress", staffUserId: OWNER_A, now: LATER })).toBe(false);
    expect(await setPressReleaseStatus(dbs.staff.db, { id, status: "waiting", staffUserId: OWNER_A, now: LATER })).toBe(false);
    const after = (await listPressReleasesForBusiness(dbs.staff.db, businessA)).find((row) => row.id === id);
    expect(after).toMatchObject({ status: "published", statusChangedAt: NOW, statusChangedByStaffId: STAFF });
  });

  it("changes nothing when the release is already at that status", async () => {
    const id = await pressReleaseFor(businessA, NOW);
    expect(await setPressReleaseStatus(dbs.staff.db, { id, status: "in_progress", staffUserId: STAFF, now: NOW })).toBe(true);
    expect(await setPressReleaseStatus(dbs.staff.db, { id, status: "in_progress", staffUserId: OWNER_A, now: LATER })).toBe(false);
    const after = (await listPressReleasesForBusiness(dbs.staff.db, businessA)).find((row) => row.id === id);
    expect(after).toMatchObject({ statusChangedAt: NOW, statusChangedByStaffId: STAFF });
  });

  it("never moves a release back to waiting", async () => {
    const id = await pressReleaseFor(businessA, NOW);
    expect(await setPressReleaseStatus(dbs.staff.db, { id, status: "waiting", staffUserId: STAFF, now: LATER })).toBe(false);
  });
});

describe("add-on rows for staff", () => {
  it("names the staff member who scheduled an end, and leaves the name empty for a customer's own", async () => {
    const byStaff = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(byStaff.id, "fake_pay_staff"));
    await dbs.staff.db.transaction((tx) => scheduleAddOnEnd(tx, { id: byStaff.id, kind: "pause", now: LATER, staffUserId: STAFF }));
    const byCustomer = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { addOn: "advertising" }));
    await record(paymentFor(byCustomer.id, "fake_pay_customer"));
    await dbs.staff.db.transaction((tx) => scheduleAddOnEnd(tx, { id: byCustomer.id, kind: "cancel", now: LATER, staffUserId: null }));
    await insertAddOnSubscription(dbs.staff.db, addOnRow(businessB));

    const rows = await listAddOnSubscriptionsForStaff(dbs.staff.db, businessA);

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === byStaff.id)).toMatchObject({ endKind: "pause", endRequestedByStaffName: "Staff" });
    expect(rows.find((row) => row.id === byCustomer.id)).toMatchObject({ endKind: "cancel", endRequestedByStaffName: null });
    expect(await listAddOnSubscriptionsForStaff(dbs.staff.db, "not-a-uuid")).toEqual([]);
  });
});

describe("finding the add-on a payment paid", () => {
  it("returns the linked row, and null for a plan payment", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    const { payment } = await record(paymentFor(row.id, "fake_pay_1"));
    const planPaymentId = await payForPlan(businessB, "fake_sub_plan", NOW);

    expect(await findAddOnSubscriptionForPayment(dbs.staff.db, payment.id)).toMatchObject({ id: row.id });
    expect(await findAddOnSubscriptionForPayment(dbs.staff.db, planPaymentId)).toBeNull();
    expect(await findAddOnSubscriptionForPayment(dbs.staff.db, "not-a-uuid")).toBeNull();
  });
});

describe("Razorpay plans per add-on price", () => {
  it("stores one plan id per add-on and amount, and keeps the first when two are saved", async () => {
    const key = { addOn: "social-media", netAmountCents: 1_000_000, taxRateBasisPoints: 1_800, currency: "INR" as const, provider: "razorpay" as const };
    expect(await findAddOnProviderPlan(dbs.staff.db, key)).toBeNull();

    expect(await saveAddOnProviderPlan(dbs.staff.db, { ...key, providerPlanId: "plan_first" })).toBe("plan_first");
    expect(await saveAddOnProviderPlan(dbs.staff.db, { ...key, providerPlanId: "plan_second" })).toBe("plan_first");

    expect(await findAddOnProviderPlan(dbs.staff.db, key)).toBe("plan_first");
    expect(await findAddOnProviderPlan(dbs.staff.db, { ...key, netAmountCents: 900_000 })).toBeNull();
  });
});

describe("the plan's own checks ignore add-on payments", () => {
  it("does not count an add-on payment as the plan's first payment", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await record(paymentFor(row.id, "fake_pay_addon", { paidAt: new Date("2026-09-01T09:00:00.000Z") }));

    expect(await findFirstPayment(dbs.staff.db, businessA)).toBeNull();
    // An add-on alone does not make the business a client.
    expect((await listClients(dbs.staff.db)).find((client) => client.businessId === businessA)).toBeUndefined();

    // The plan's payment comes later in time, and is still the first one that bought the plan.
    const planPaymentId = await payForPlan(businessA, "fake_sub_plan", NOW);
    expect(await findFirstPayment(dbs.staff.db, businessA)).toMatchObject({ id: planPaymentId });
    expect((await listClients(dbs.staff.db)).find((client) => client.businessId === businessA)?.billing.firstPayment).toMatchObject({ paidAt: NOW });
  });

  it("does not hold the plan's checkout for an add-on payment under review", async () => {
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA));
    await dbs.staff.db.transaction((tx) => recordUnappliedAddOnPayment(tx, { ...paymentFor(row.id, "fake_pay_late"), reason: "checkout_replaced", now: LATER }));

    expect((await findBillingState(dbs.staff.db, businessA))?.paymentUnderReview).toBe(false);
  });
});

describe("receipts", () => {
  it("name the add-on an add-on payment paid for, and nothing for other payments", async () => {
    const planPaymentId = await payForPlan(businessA, "fake_sub_plan", NOW);
    const row = await insertAddOnSubscription(dbs.staff.db, addOnRow(businessA, { addOn: "advertising" }));
    const { payment } = await record(paymentFor(row.id, "fake_pay_addon", { paidAt: LATER }));

    const receipts = await asOwner(businessA, OWNER_A, (tx) => listReceiptsForBusiness(tx, businessA, 10));

    expect(receipts.find((receipt) => receipt.id === payment.id)).toMatchObject({ kind: "add_on", addOnId: "advertising", planName: null, chargeDescription: null, taxRateBasisPoints: 1_800 });
    expect(receipts.find((receipt) => receipt.id === planPaymentId)).toMatchObject({ addOnId: null });
  });
});
