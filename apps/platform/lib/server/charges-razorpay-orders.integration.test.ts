import type { BillingProvider } from "@brandbasket/billing";
import { businessMembers, businesses, charges, insertCharge, payments, users } from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pay pressed twice at once on a charge, through a real database: one Razorpay order is kept, and Razorpay's payment
 * is matched back to the charge through that order, once, whichever order the customer paid.
 */

const state = vi.hoisted(() => ({ dbs: null as TestDatabases | null }));
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({
  getAppDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.app.db;
  },
  getStaffDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.staff.db;
  },
}));
vi.mock("./billing", () => ({ getBillingProvider: vi.fn() }));
vi.mock("./add-ons", () => ({ basketDeps: () => ({}) }));
vi.mock("@brandbasket/shared/server/basket-change", () => ({ finishAddOnAfterPayment: vi.fn() }));

import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { recordRazorpayChargePayment, startCustomerChargePayment } from "./charges";

const OWNER = "owner-a";
const NOW = new Date("2026-10-27T10:01:18.000Z");
const AMOUNT = 285_000;

function dbs(): TestDatabases {
  if (state.dbs === null) throw new Error("The test database is not open");
  return state.dbs;
}

let businessId = "";
let chargeId = "";
let customer: GrantedCustomer;
/** Every order the fake Razorpay opened, in the order it opened them. */
let orders: string[];

function razorpay(): BillingProvider {
  return {
    name: "razorpay",
    startChargePayment: async () => {
      // A round trip to Razorpay, so two presses at once both get as far as asking for an order.
      await new Promise((resolve) => setTimeout(resolve, 20));
      const providerOrderId = `order_${orders.length + 1}`;
      orders.push(providerOrderId);
      return { providerOrderId, redirectTo: null };
    },
  } as unknown as BillingProvider;
}

function paidEvent(orderId: string, paymentId: string) {
  return { orderId, paymentId, amountCents: AMOUNT, currency: "INR" as const, paidAt: NOW, method: null };
}

beforeAll(() => {
  state.dbs = openTestDatabases();
});

afterAll(async () => {
  await state.dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs().owner);
  await seedPlansFromMigrations(dbs().owner);
  orders = [];
  await dbs().staff.db.insert(users).values({ id: OWNER, name: "Asha", email: "asha@example.com" });
  const [business] = await dbs().staff.db.insert(businesses).values({ slug: "chennai-cafe", name: "Chennai Cafe", currency: "INR" }).returning({ id: businesses.id });
  businessId = business?.id ?? "";
  await dbs().staff.db.insert(businessMembers).values({ businessId, userId: OWNER, role: "owner" });
  const charge = await insertCharge(dbs().staff.db, {
    businessId,
    kind: "change_hours",
    description: "Extra change hours",
    quantity: 2,
    unitAmountCents: 142_500,
    taxRateBasisPoints: 1800,
    amountCents: AMOUNT,
    currency: "INR",
    createdByStaffId: null,
  });
  chargeId = charge.id;
  customer = {
    tenant: { userId: OWNER, businessId, businessName: "Chennai Cafe", role: "owner" },
    user: { id: OWNER, email: "asha@example.com" },
    billing: {},
  } as unknown as GrantedCustomer;
  vi.mocked(getBillingProvider).mockReturnValue(razorpay());
});

describe("a charge paid on Razorpay after Pay was pressed twice at once", () => {
  it("keeps the first order, sends both presses to it, and records the payment once", async () => {
    const [first, second] = await Promise.all([startCustomerChargePayment(customer, chargeId), startCustomerChargePayment(customer, chargeId)]);

    const stored = await dbs().staff.db.query.charges.findFirst({ where: (table, { eq }) => eq(table.id, chargeId) });
    expect(orders).toHaveLength(2);
    expect(stored?.providerOrderId).not.toBeNull();
    expect(first).toMatchObject({ kind: "razorpay", orderId: stored?.providerOrderId });
    expect(second).toMatchObject({ kind: "razorpay", orderId: stored?.providerOrderId });

    const spare = orders.find((order) => order !== stored?.providerOrderId) ?? "";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // The order that lost the claim is refused, and the customer's payment on the kept one still lands.
    await recordRazorpayChargePayment(paidEvent(spare, "pay_spare"), NOW);
    expect(await dbs().staff.db.select().from(payments)).toHaveLength(0);
    expect(String(warn.mock.calls[0]?.[0])).toContain("unknown-charge-order");
    warn.mockRestore();

    await recordRazorpayChargePayment(paidEvent(stored?.providerOrderId ?? "", "pay_kept"), NOW);
    await recordRazorpayChargePayment(paidEvent(stored?.providerOrderId ?? "", "pay_kept"), NOW);
    expect(await dbs().staff.db.select().from(payments)).toHaveLength(1);
    expect((await dbs().staff.db.select().from(charges))[0]).toMatchObject({ status: "paid", paymentId: expect.any(String) });
  });
});
