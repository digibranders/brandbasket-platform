import { randomUUID } from "node:crypto";
import type { BillingProvider } from "@brandbasket/billing";
import {
  billingProfiles,
  businesses,
  findAddOnSubscription,
  findTaxInvoiceByPaymentId,
  insertAddOnSubscription,
  markAddOnCancelled,
  AddOnPaymentConflictError,
  updateAddOnStatus,
  users,
  type AddOnSubscription,
} from "@brandbasket/db";
import { openTestDatabases, querySql, resetTestDatabase, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addOnById, addOnPrice } from "./lib/billing/add-ons";
import { ensureAddOnPlan } from "./server/add-on-plans";
import { activateAddOnPayment, applyAddOnPayment } from "./server/add-on-activation";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/** Recording an add-on payment and finding or making its Razorpay plan, against a real database. */

const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-09T09:00:00.000Z");
const LATER = new Date("2026-10-20T09:00:00.000Z");
const LIST_CENTS = 999_900;
const TAX_BASIS_POINTS = 1_800;

let dbs: TestDatabases;
let businessId = "";

async function seedBusiness(): Promise<string> {
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "qa-add-ons", name: "QA Add-ons Business", currency: "INR" })
    .returning({ id: businesses.id });
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("The business was not inserted");
  await dbs.owner.db.insert(billingProfiles).values({
    businessId: id,
    legalName: "QA Add-ons Business LLP",
    gstin: "27AAPFU0939F1ZV",
    addressLine1: "Shop 4, Gokul Arcade",
    addressLine2: null,
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: null,
    phone: null,
  });
  return id;
}

/** A Social Media and Ads row at the list price, as a purchase freezes it, with its own provider subscription id. */
function addRow(continuesId: string | null = null): Promise<AddOnSubscription> {
  return insertAddOnSubscription(dbs.staff.db, {
    id: randomUUID(),
    businessId,
    addOn: "digital-growth",
    listAmountCents: LIST_CENTS,
    discountAmountCents: 0,
    netAmountCents: LIST_CENTS,
    taxRateBasisPoints: TAX_BASIS_POINTS,
    chargedAmountCents: LIST_CENTS,
    currency: "INR",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${randomUUID()}`,
    continuesId,
  });
}

function pay(row: AddOnSubscription, providerPaymentId: string) {
  return dbs.staff.db.transaction((tx) =>
    activateAddOnPayment(tx, {
      addOnSubscriptionId: row.id,
      provider: "fake",
      providerPaymentId,
      amountCents: row.chargedAmountCents,
      currency: "INR",
      paidAt: PAID_AT,
      periodStart: PAID_AT,
      periodEnd: PERIOD_END,
    }),
  );
}

async function invoiceCount(): Promise<number> {
  const rows = await querySql<{ count: string }>(dbs.owner, "select count(*) as count from tax_invoices");
  return Number(rows[0]?.count ?? 0);
}

async function storedPlanIds(): Promise<string[]> {
  const rows = await querySql<{ provider_plan_id: string }>(dbs.owner, "select provider_plan_id from add_on_provider_plans");
  return rows.map((row) => row.provider_plan_id);
}

/** A provider whose plans are made after a short wait, so racing callers are all past the lookup before any saves. */
function providerMakingPlans(providerPlanIdFor: (call: number) => string | null): { provider: BillingProvider; calls: () => number } {
  let calls = 0;
  const createPlan: BillingProvider["createPlan"] = async () => {
    calls += 1;
    const providerPlanId = providerPlanIdFor(calls);
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { providerPlanId };
  };
  return { provider: { name: "razorpay", createPlan } as unknown as BillingProvider, calls: () => calls };
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await dbs.owner.db.insert(users).values({ id: "staff-add-ons", name: "Superadmin", email: "admin@example.test", emailVerified: true });
  businessId = await seedBusiness();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("activateAddOnPayment", () => {
  it("records the payment, opens the add-on for the period and issues exactly one tax invoice", async () => {
    const row = await addRow();

    const recorded = await pay(row, "fake_pay_first");

    expect(recorded.alreadyRecorded).toBe(false);
    expect(recorded.predecessorsToCancel).toEqual([]);
    expect(recorded.payment).toMatchObject({ kind: "add_on", amountCents: row.chargedAmountCents, status: "captured" });
    expect(await findAddOnSubscription(dbs.staff.db, businessId, row.id)).toMatchObject({
      status: "active",
      activatedAt: PAID_AT,
      currentPeriodStart: PAID_AT,
      currentPeriodEnd: PERIOD_END,
    });
    expect(await invoiceCount()).toBe(1);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id);
    expect(invoice?.lines[0]).toMatchObject({ description: "Social Media and Ads", unitAmountCents: LIST_CENTS });
    expect(invoice?.totalCents).toBe(recorded.payment.amountCents);
  });

  it("records nothing and issues no second invoice when the same payment is delivered again", async () => {
    const row = await addRow();
    const first = await pay(row, "fake_pay_first");

    const again = await pay(row, "fake_pay_first");

    expect(again.alreadyRecorded).toBe(true);
    expect(again.payment.id).toBe(first.payment.id);
    expect(again.predecessorsToCancel).toEqual([]);
    expect(await invoiceCount()).toBe(1);
    const payments = await querySql<{ count: string }>(dbs.owner, "select count(*) as count from payments");
    expect(Number(payments[0]?.count)).toBe(1);
  });

  it("returns the halted row Pay now replaces, now cancelled, and invoices the new payment", async () => {
    const halted = await addRow();
    await pay(halted, "fake_pay_old");
    await updateAddOnStatus(dbs.staff.db, { id: halted.id, status: "halted", providerStatus: "halted", haltedAt: LATER, now: LATER });
    const replacement = await addRow(halted.id);

    const recorded = await pay(replacement, "fake_pay_new");

    expect(recorded.predecessorsToCancel).toEqual([{ provider: "fake", providerSubscriptionId: halted.providerSubscriptionId }]);
    expect(await findAddOnSubscription(dbs.staff.db, businessId, halted.id)).toMatchObject({ status: "cancelled" });
    expect(await findAddOnSubscription(dbs.staff.db, businessId, replacement.id)).toMatchObject({ status: "active" });
    expect(await invoiceCount()).toBe(2);
  });
});

/** The payments flagged for staff, with what each says it is about. */
async function unappliedPayments(): Promise<{ provider_payment_id: string; attention_reason: string }[]> {
  return querySql<{ provider_payment_id: string; attention_reason: string }>(
    dbs.owner,
    "select provider_payment_id, attention_reason from payments where attention_reason is not null order by provider_payment_id",
  );
}

function apply(row: AddOnSubscription, providerPaymentId: string, overrides: { amountCents?: number } = {}) {
  return dbs.staff.db.transaction((tx) =>
    applyAddOnPayment(
      tx,
      {
        addOnSubscriptionId: row.id,
        provider: "fake",
        providerPaymentId,
        amountCents: overrides.amountCents ?? row.chargedAmountCents,
        currency: "INR",
        paidAt: PAID_AT,
        periodStart: PAID_AT,
        periodEnd: PERIOD_END,
      },
      LATER,
    ),
  );
}

describe("applyAddOnPayment", () => {
  it("applies a payment, invoices it, and names the halted rows it replaced for cancelling after the commit", async () => {
    const halted = await addRow();
    await pay(halted, "fake_pay_old");
    await updateAddOnStatus(dbs.staff.db, { id: halted.id, status: "halted", providerStatus: "halted", haltedAt: LATER, now: LATER });
    const replacement = await addRow(halted.id);

    const result = await apply(replacement, "fake_pay_new");

    expect(result).toEqual({ kind: "applied", paymentId: expect.any(String), cancelAtProvider: [{ provider: "fake", providerSubscriptionId: halted.providerSubscriptionId }] });
    expect(await findAddOnSubscription(dbs.staff.db, businessId, replacement.id)).toMatchObject({ status: "active" });
    expect(await invoiceCount()).toBe(2);
    expect(await unappliedPayments()).toEqual([]);
  });

  it("does nothing a second time for a payment it applied, and cancels nothing again", async () => {
    const row = await addRow();
    expect(await apply(row, "fake_pay_first")).toEqual({ kind: "applied", paymentId: expect.any(String), cancelAtProvider: [] });

    const again = await apply(row, "fake_pay_first");

    expect(again).toEqual({ kind: "already-recorded", cancelAtProvider: [] });
    expect(await invoiceCount()).toBe(1);
  });

  it("keeps a payment for an add-on another row already bills for staff, cancels this row, and names its subscription to cancel", async () => {
    const running = await addRow();
    await apply(running, "fake_pay_running");
    const doubled = await addRow();

    const result = await apply(doubled, "fake_pay_doubled");

    expect(result).toEqual({
      kind: "refused",
      reason: "already_paid",
      paymentId: expect.any(String),
      cancelAtProvider: [{ provider: "fake", providerSubscriptionId: doubled.providerSubscriptionId }],
    });
    expect(await findAddOnSubscription(dbs.staff.db, businessId, doubled.id)).toMatchObject({ status: "cancelled" });
    expect(await findAddOnSubscription(dbs.staff.db, businessId, running.id)).toMatchObject({ status: "active", currentPeriodEnd: PERIOD_END });
    expect(await unappliedPayments()).toEqual([{ provider_payment_id: "fake_pay_doubled", attention_reason: "already_paid" }]);
    // Money that bought nothing gets no invoice; only the running row's payment was invoiced.
    expect(await invoiceCount()).toBe(1);
  });

  it("does not record the money, mark the row or name a cancellation a second time when a refused payment is delivered again", async () => {
    const running = await addRow();
    await apply(running, "fake_pay_running");
    const doubled = await addRow();
    await apply(doubled, "fake_pay_doubled");

    const again = await apply(doubled, "fake_pay_doubled");

    expect(again).toEqual({ kind: "already-recorded", cancelAtProvider: [] });
    expect(await unappliedPayments()).toEqual([{ provider_payment_id: "fake_pay_doubled", attention_reason: "already_paid" }]);
    const payments = await querySql<{ count: string }>(dbs.owner, "select count(*) as count from payments");
    expect(Number(payments[0]?.count)).toBe(2);
  });

  it("keeps a payment on a checkout that was cancelled for staff, as checkout_replaced, and names its subscription to cancel", async () => {
    const replaced = await addRow();
    await dbs.staff.db.transaction((tx) => markAddOnCancelled(tx, replaced.id, LATER));

    const result = await apply(replaced, "fake_pay_late");

    expect(result).toEqual({
      kind: "refused",
      reason: "checkout_replaced",
      paymentId: expect.any(String),
      cancelAtProvider: [{ provider: "fake", providerSubscriptionId: replaced.providerSubscriptionId }],
    });
    expect(await unappliedPayments()).toEqual([{ provider_payment_id: "fake_pay_late", attention_reason: "checkout_replaced" }]);
    expect(await invoiceCount()).toBe(0);
  });

  it("lets a payment id that belongs to another row throw, and records nothing", async () => {
    const first = await addRow();
    await apply(first, "fake_pay_shared");
    const other = await addRow();
    await dbs.staff.db.transaction((tx) => markAddOnCancelled(tx, first.id, LATER));

    await expect(apply(other, "fake_pay_shared")).rejects.toBeInstanceOf(AddOnPaymentConflictError);

    expect(await unappliedPayments()).toEqual([]);
    expect(await findAddOnSubscription(dbs.staff.db, businessId, other.id)).toMatchObject({ status: "incomplete" });
  });

  it("lets a payment for a row that does not exist throw", async () => {
    const row = await addRow();

    await expect(apply({ ...row, id: randomUUID() }, "fake_pay_ghost")).rejects.toThrow();

    expect(await unappliedPayments()).toEqual([]);
  });
});

describe("ensureAddOnPlan", () => {
  const localSeo = addOnById("digital-growth");
  const memberPrice = addOnPrice(localSeo, "INR", 200_000);

  it("makes a plan once and reuses it for the same add-on and amount", async () => {
    const { provider, calls } = providerMakingPlans(() => "plan_fixed");

    const first = await ensureAddOnPlan(dbs.staff.db, provider, { addOn: localSeo, price: memberPrice });
    const second = await ensureAddOnPlan(dbs.staff.db, provider, { addOn: localSeo, price: memberPrice });

    expect(first).toBe("plan_fixed");
    expect(second).toBe("plan_fixed");
    expect(calls()).toBe(1);
    expect(await storedPlanIds()).toEqual(["plan_fixed"]);
  });

  it("keeps a separate plan for each amount", async () => {
    const { provider, calls } = providerMakingPlans((call) => `plan_${call}`);

    const member = await ensureAddOnPlan(dbs.staff.db, provider, { addOn: localSeo, price: memberPrice });
    const list = await ensureAddOnPlan(dbs.staff.db, provider, { addOn: localSeo, price: addOnPrice(localSeo, "INR") });

    expect([member, list]).toEqual(["plan_1", "plan_2"]);
    expect(calls()).toBe(2);
    expect((await storedPlanIds()).sort()).toEqual(["plan_1", "plan_2"]);
  });

  it("converges two concurrent calls on one stored plan id", async () => {
    const { provider, calls } = providerMakingPlans((call) => `plan_race_${call}`);

    const [a, b] = await Promise.all([
      ensureAddOnPlan(dbs.staff.db, provider, { addOn: localSeo, price: memberPrice }),
      ensureAddOnPlan(dbs.staff.db, provider, { addOn: localSeo, price: memberPrice }),
    ]);

    expect(calls()).toBe(2);
    const stored = await storedPlanIds();
    expect(stored).toHaveLength(1);
    expect(a).toBe(stored[0]);
    expect(b).toBe(stored[0]);
  });

  it("returns null and stores nothing for a provider with no plan ids", async () => {
    const { provider } = providerMakingPlans(() => null);

    await expect(ensureAddOnPlan(dbs.staff.db, provider, { addOn: localSeo, price: memberPrice })).resolves.toBeNull();
    expect(await storedPlanIds()).toEqual([]);
  });
});
