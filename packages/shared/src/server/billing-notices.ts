import { hasBillingAccess } from "@brandbasket/billing";
import {
  findLatestSubscriptionForBusiness,
  findPlanById,
  listSubscriptionsEndingFirstTerm,
  listSubscriptionsPaidThroughBetween,
  type Database,
  type Subscription,
} from "@brandbasket/db";
import { nextBundledNetCents, nextDiscountCents } from "../lib/billing/bundle";
import { paymentsContinue } from "../lib/billing/payments-continue";
import { renewalChargeCents } from "../lib/billing/terms";
import { notifyEvent } from "./notify-event";
import { sendFirstChargeReminder, type PaymentEmailDeps } from "./payment-emails";

/*
 * The timer sweep for two billing notices that have no write to hang on: the reminder before the first full price charge, and the
 * plan lapsed notice. Both are keyed so a timer that runs every 15 minutes (or twice) notifies once. Run it from an existing
 * internal route; it adds no timer of its own.
 */

const DAY_MS = 86_400_000;
/** The reminder goes out this long before the charge (the matrix: 3 days before). */
export const REMINDER_LEAD_DAYS = 3;
/**
 * A lapse is announced only if access ran out within this window, so the first run after this ships does not write to every old lapse.
 * shortcut: a timer that was down longer than this misses a lapse, so keep it well above the timer's gap.
 */
export const LAPSE_WINDOW_DAYS = 14;

export interface BillingNoticeReport {
  readonly reminders: number;
  readonly lapses: number;
  readonly failed: number;
}

/** What the reminder says the next payment is: the plan's renewal price less the discount and with the services, or null when it is free. */
async function reminderAmountCents(db: Database, subscription: Subscription): Promise<{ readonly amountCents: number; readonly currency: "INR" | "USD" } | null> {
  const plan = await findPlanById(db, subscription.planId);
  if (plan === null) return null;
  const amountCents = renewalChargeCents(plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
  return amountCents === null ? null : { amountCents, currency: plan.currency };
}

async function sendReminders(db: Database, deps: PaymentEmailDeps, now: Date): Promise<{ sent: number; failed: number }> {
  const due = await listSubscriptionsEndingFirstTerm(db, { from: now, to: new Date(now.getTime() + REMINDER_LEAD_DAYS * DAY_MS) });
  let sent = 0;
  let failed = 0;
  for (const subscription of due) {
    try {
      if (!paymentsContinue(subscription) || subscription.commitmentEndsAt === null) continue;
      const latest = await findLatestSubscriptionForBusiness(db, subscription.businessId);
      if (latest?.id !== subscription.id) continue;
      const charge = await reminderAmountCents(db, subscription);
      if (charge === null) continue;
      await sendFirstChargeReminder(db, deps, { businessId: subscription.businessId, ...charge, chargeDate: subscription.commitmentEndsAt }, now);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("[billing-notices] A reminder could not be sent.", { subscriptionId: subscription.id, error: error instanceof Error ? error.name : "error" });
    }
  }
  return { sent, failed };
}

async function sendLapses(db: Database, now: Date): Promise<{ sent: number; failed: number }> {
  const candidates = await listSubscriptionsPaidThroughBetween(db, { from: new Date(now.getTime() - LAPSE_WINDOW_DAYS * DAY_MS), to: now });
  let sent = 0;
  let failed = 0;
  for (const subscription of candidates) {
    try {
      if (hasBillingAccess(subscription, now) || subscription.paidThroughAt === null) continue;
      // A newer subscription (a reactivation) means they are back: only the business's latest one can lapse.
      const latest = await findLatestSubscriptionForBusiness(db, subscription.businessId);
      if (latest?.id !== subscription.id) continue;
      await notifyEvent(db, {
        event: "billing.plan_lapsed",
        audience: { kind: "customer", businessId: subscription.businessId },
        dedupeKey: `${subscription.id}:${subscription.paidThroughAt.toISOString()}`,
        data: {},
      });
      sent += 1;
    } catch (error) {
      failed += 1;
      console.error("[billing-notices] A lapse notice could not be sent.", { subscriptionId: subscription.id, error: error instanceof Error ? error.name : "error" });
    }
  }
  return { sent, failed };
}

/** Sends every reminder and lapse notice that is due. Never throws: a failure is counted and logged, and the next run tries again. */
export async function sendDueBillingNotices(db: Database, deps: PaymentEmailDeps, now: Date): Promise<BillingNoticeReport> {
  const reminders = await sendReminders(db, deps, now).catch((error: unknown) => {
    console.error("[billing-notices] The reminder sweep failed.", { error: error instanceof Error ? error.name : "error" });
    return { sent: 0, failed: 1 };
  });
  const lapses = await sendLapses(db, now).catch((error: unknown) => {
    console.error("[billing-notices] The lapse sweep failed.", { error: error instanceof Error ? error.name : "error" });
    return { sent: 0, failed: 1 };
  });
  return { reminders: reminders.sent, lapses: lapses.sent, failed: reminders.failed + lapses.failed };
}
