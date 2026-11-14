import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businessMembers,
  businesses,
  findActivePlan,
  notificationPreferences,
  openCheckoutSubscription,
  recordFailedPayment,
  recordUnappliedPayment,
  users,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { execSql, openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { createOutboxTransport, type EmailMessage } from "@brandbasket/email";
import { packageLines } from "./lib/billing/packages";
import { activateFirstPayment, activateRenewalPayment } from "./server/billing-activation";
import { sendFirstChargeReminder, sendPaymentFailed, sendPaymentReceipt, type PaymentEmailDeps } from "./server/payment-emails";

// The email senders are server-only in the app; there is no browser here to keep them out of.
vi.mock("server-only", () => ({}));

/** The customer emails about a payment, against a real database: who gets one, what it says, and that it is sent once. */

const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const ORIGIN = "https://app.brandbasket.in";

let dbs: TestDatabases;
let businessId = "";
let services: Plan;
const sent: EmailMessage[] = [];

/** Sends through the real outbox table, which is what the idempotency check reads, and keeps a copy for the assertions. */
function deps(): PaymentEmailDeps {
  const outbox = createOutboxTransport(dbs.staff.db);
  return {
    dashboardOrigin: ORIGIN,
    send: async (message) => {
      sent.push(message);
      await outbox.send(message);
    },
  };
}

async function addBusiness(slug: string, currency: "INR" | "USD", owner: { readonly name: string; readonly email: string }): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug, name: "Rao Dental Care", currency }).returning({ id: businesses.id });
  const id = rows[0]?.id ?? "";
  await dbs.owner.db.insert(users).values({ id: `user-${slug}`, name: owner.name, email: owner.email, emailVerified: true });
  await dbs.owner.db.insert(businessMembers).values({ businessId: id, userId: `user-${slug}`, role: "owner" });
  return id;
}

function websiteLines(plan: Plan): readonly NewBundledAddOn[] {
  return packageLines({ services: ["managed-website"], forfeited: false }, plan.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
  }));
}

function openSubscription(plan: Plan): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"e".repeat(24)}`,
    bundledAddOns: websiteLines(plan),
    replacing: null,
    now: PAID_AT,
  });
}

function payFirst(subscription: Subscription, plan: Plan, providerPaymentId = "fake_pay_first") {
  return dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan, provider: "fake", providerPaymentId, paidAt: PAID_AT }),
  );
}

async function outboxCount(template: string): Promise<number> {
  const rows = await querySql<{ count: string }>(dbs.owner, `select count(*) as count from email_messages where template = '${template}'`);
  return Number(rows[0]?.count ?? 0);
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
  if (plan === null) throw new Error("No active INR services plan was seeded");
  services = plan;
  businessId = await addBusiness("rao-dental", "INR", { name: "Asha Rao", email: "asha@raodental.example" });
  sent.length = 0;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendPaymentReceipt", () => {
  it("writes the approved receipt for a first payment, with the dates and the receipt link, and sends it once", async () => {
    const subscription = await openSubscription(services);
    const { payment } = await payFirst(subscription, services);

    await sendPaymentReceipt(dbs.staff.db, deps(), payment.id, PAID_AT);

    expect(sent).toHaveLength(1);
    const email = sent[0];
    expect(email).toMatchObject({ to: "asha@raodental.example", subject: "Payment received: ₹2,999", template: "payment-received" });
    expect(email?.bodyText).toContain("Hi Asha,");
    expect(email?.bodyText).toContain("We have received your payment of ₹2,999 for Website Management.");
    expect(email?.bodyText).toContain("Includes GST at 18%.");
    expect(email?.bodyText).toContain("Your plan is paid up to 9 November 2026.");
    expect(email?.bodyText).toContain("Your next payment of ₹2,999 is taken on 9 November 2026.");
    expect(email?.bodyText).toContain(`Download your receipt: ${ORIGIN}/billing/receipts?ids=${payment.id}`);
    expect(await outboxCount("payment-received")).toBe(1);

    await sendPaymentReceipt(dbs.staff.db, deps(), payment.id, PAID_AT);
    expect(sent).toHaveLength(1);
    expect(await outboxCount("payment-received")).toBe(1);
  });

  it("sends nothing for money kept for staff, which bought nothing", async () => {
    const subscription = await openSubscription(services);
    const { payment } = await recordUnappliedPayment(dbs.staff.db, {
      businessId,
      subscriptionId: subscription.id,
      provider: "fake",
      providerPaymentId: "fake_pay_wrong_amount",
      kind: "initial",
      amountCents: 12_300,
      currency: "INR",
      paidAt: PAID_AT,
      reason: "amount_mismatch",
      now: PAID_AT,
    });

    await sendPaymentReceipt(dbs.staff.db, deps(), payment.id, PAID_AT);
    expect(sent).toHaveLength(0);
  });

  it("sends nothing to an owner who signs in with a phone number and has no address", async () => {
    await execSql(dbs.owner, `update users set email = '919876543210@phone.brandbasket.invalid' where id = 'user-rao-dental'`);
    const { payment } = await payFirst(await openSubscription(services), services);
    await sendPaymentReceipt(dbs.staff.db, deps(), payment.id, PAID_AT);
    expect(sent).toHaveLength(0);
  });

  it("says nothing about GST to a dollar customer, and shows dollars", async () => {
    const usd = await findActivePlan(dbs.staff.db, "USD", "managed");
    if (usd === null) throw new Error("No active USD services plan was seeded");
    businessId = await addBusiness("us-cafe", "USD", { name: "Sam Lee", email: "sam@uscafe.example" });
    const subscription = await openCheckoutSubscription(dbs.staff.db, {
      businessId,
      planId: usd.id,
      provider: "fake",
      providerSubscriptionId: `fake_sub_${"f".repeat(24)}`,
      bundledAddOns: websiteLines(usd),
      replacing: null,
      now: PAID_AT,
    });
    const { payment } = await payFirst(subscription, usd, "fake_pay_usd");

    await sendPaymentReceipt(dbs.staff.db, deps(), payment.id, PAID_AT);

    expect(sent[0]?.subject).toBe("Payment received: $59");
    expect(sent[0]?.bodyText).not.toMatch(/GST/i);
  });

  it("never throws, even when the delivery fails", async () => {
    const { payment } = await payFirst(await openSubscription(services), services);
    const failing: PaymentEmailDeps = { dashboardOrigin: ORIGIN, send: () => Promise.reject(new Error("brevo is down")) };
    await expect(sendPaymentReceipt(dbs.staff.db, failing, payment.id, PAID_AT)).resolves.toBeUndefined();
    await expect(sendPaymentReceipt(dbs.staff.db, failing, "not-a-payment", PAID_AT)).resolves.toBeUndefined();
  });
});

describe("sendPaymentFailed", () => {
  const FAILED = { amountCents: 299_900, currency: "INR", chargeDescription: null } as const;

  it("tells a customer whose plan is still paid for the date it runs to, and links to Plan and billing", async () => {
    const { payment } = await payFirst(await openSubscription(services), services);
    expect(payment.id).not.toBe("");

    await sendPaymentFailed(dbs.staff.db, deps(), { businessId, ...FAILED }, new Date("2026-10-20T09:00:00.000Z"));

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "asha@raodental.example", subject: "Your payment did not go through" });
    expect(sent[0]?.bodyText).toContain("We could not take your payment of ₹2,999 for Website Management.");
    expect(sent[0]?.bodyText).toContain("Your plan stays active until 9 November 2026. After that it pauses until the payment is made.");
    expect(sent[0]?.bodyText).toContain(`Pay now: ${ORIGIN}/billing/payment`);
  });

  it("says the plan is paused once the paid-through date has passed", async () => {
    await payFirst(await openSubscription(services), services);
    await sendPaymentFailed(dbs.staff.db, deps(), { businessId, ...FAILED }, new Date("2026-12-01T09:00:00.000Z"));
    expect(sent[0]?.bodyText).toContain("Your plan is paused until the payment is made.");
    expect(sent[0]?.bodyText).not.toContain("stays active");
  });

  it("says nothing about the plan for a failed extra, and names what it was for", async () => {
    await payFirst(await openSubscription(services), services);
    await sendPaymentFailed(dbs.staff.db, deps(), { businessId, ...FAILED, amountCents: 142_500, chargeDescription: "Extra change hours" }, PAID_AT);
    expect(sent[0]?.bodyText).toContain("We could not take your payment of ₹1,425 for Extra change hours.");
    expect(sent[0]?.bodyText).not.toMatch(/plan stays|plan is paused/);
  });

  it("says nothing about the plan to a customer who never paid", async () => {
    await openSubscription(services);
    await sendPaymentFailed(dbs.staff.db, deps(), { businessId, ...FAILED }, PAID_AT);
    expect(sent[0]?.bodyText).not.toMatch(/plan stays|plan is paused/);
  });

  it("is sent only when the failure was recorded for the first time: the record is keyed on the provider's payment id", async () => {
    const record = { businessId, provider: "razorpay", providerPaymentId: "pay_failed_1", kind: "renewal", amountCents: 299_900, currency: "INR", failureReason: "Declined", failedAt: PAID_AT } as const;
    const outcomes = [await recordFailedPayment(dbs.staff.db, record), await recordFailedPayment(dbs.staff.db, record)];
    expect(outcomes).toEqual(["recorded", "already-recorded"]);
  });

  it("sends nothing when the owner turned billing emails off, and still sends the receipt", async () => {
    await dbs.owner.db.insert(notificationPreferences).values({ userId: "user-rao-dental", businessId, topic: "billing", email: false });
    const { payment } = await payFirst(await openSubscription(services), services);

    await sendPaymentFailed(dbs.staff.db, deps(), { businessId, ...FAILED }, PAID_AT);
    expect(sent).toHaveLength(0);

    await sendPaymentReceipt(dbs.staff.db, deps(), payment.id);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ template: "payment-received" });
  });

  it("sends the email anyway when the preference cannot be read", async () => {
    await payFirst(await openSubscription(services), services);
    await execSql(dbs.owner, "alter table notification_preferences rename to notification_preferences_away");
    try {
      await sendPaymentFailed(dbs.staff.db, deps(), { businessId, ...FAILED }, PAID_AT);
    } finally {
      await execSql(dbs.owner, "alter table notification_preferences_away rename to notification_preferences");
    }
    expect(sent).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith("[payment-email] Could not read the email preference, sending anyway.", expect.anything());
  });

  it("still sends when the owner turned off a different topic", async () => {
    await dbs.owner.db.insert(notificationPreferences).values({ userId: "user-rao-dental", businessId, topic: "product_news", email: false });
    await payFirst(await openSubscription(services), services);
    await sendPaymentFailed(dbs.staff.db, deps(), { businessId, ...FAILED }, PAID_AT);
    expect(sent).toHaveLength(1);
  });

  it("sends nothing to an owner with no address, and never throws", async () => {
    await execSql(dbs.owner, `update users set email = '919876543210@phone.brandbasket.invalid' where id = 'user-rao-dental'`);
    await sendPaymentFailed(dbs.staff.db, deps(), { businessId, ...FAILED }, PAID_AT);
    expect(sent).toHaveLength(0);
    await expect(sendPaymentFailed(dbs.staff.db, deps(), { businessId: "not-a-business", ...FAILED }, PAID_AT)).resolves.toBeUndefined();
  });
});

describe("a renewal receipt", () => {
  it("names the next payment from the subscription as it stands after the renewal", async () => {
    const subscription = await openSubscription(services);
    const first = await payFirst(subscription, services);
    await sendPaymentReceipt(dbs.staff.db, deps(), first.payment.id, PAID_AT);
    const renewal = await dbs.staff.db.transaction((tx) =>
      activateRenewalPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt: new Date("2026-11-09T09:00:00.000Z"),
        provider: "fake",
        providerPaymentId: "fake_pay_renewal",
        amountCents: 299_900,
        currency: "INR",
        paidAt: new Date("2026-11-09T09:00:00.000Z"),
        paidThroughAt: new Date("2026-12-09T09:00:00.000Z"),
        periodStart: new Date("2026-11-09T09:00:00.000Z"),
        invoicedPrice: { plan: services, bundledAddOns: [], netAmountCents: 0, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );

    await sendPaymentReceipt(dbs.staff.db, deps(), renewal.payment.id, new Date("2026-11-09T10:00:00.000Z"));

    // A renewal is its own payment, so it gets its own receipt beside the first one's.
    expect(sent).toHaveLength(2);
    expect(sent[1]?.bodyText).toContain("Your plan is paid up to 9 December 2026.");
    expect(sent[1]?.bodyText).toContain("Your next payment of ₹2,999 is taken on 9 December 2026.");
  });
});

describe("sendFirstChargeReminder", () => {
  it("sends reminder with the first full charge date and amount, only once", async () => {
    await payFirst(await openSubscription(services), services);
    const chargeDate = new Date("2026-11-09T09:00:00.000Z");

    await sendFirstChargeReminder(dbs.staff.db, deps(), {
      businessId,
      amountCents: 299_900,
      currency: "INR",
      chargeDate,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "asha@raodental.example",
      template: "first-charge-reminder",
      subject: "Upcoming renewal: ₹2,999 on 9 November 2026",
    });
    expect(sent[0]?.bodyText).toContain("Your next payment of ₹2,999 for Website Management will be taken on 9 November 2026.");
    expect(await outboxCount("first-charge-reminder")).toBe(1);

    // Idempotency: second call does not send another reminder
    await sendFirstChargeReminder(dbs.staff.db, deps(), {
      businessId,
      amountCents: 299_900,
      currency: "INR",
      chargeDate,
    });
    expect(sent).toHaveLength(1);
    expect(await outboxCount("first-charge-reminder")).toBe(1);
  });
});
