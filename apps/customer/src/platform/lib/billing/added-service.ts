import type { Plan, Subscription } from "@brandbasket/db";
import { PLAN_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { nextBundledNetCents, nextDiscountCents } from "@brandbasket/shared/lib/billing/bundle";
import { nextPaymentDate } from "@brandbasket/shared/lib/billing/period";
import { renewalChargeCents } from "@brandbasket/shared/lib/billing/terms";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { addOnDate } from "./add-on-copy";
import { gstNote, type PaymentSummary, type PaymentSummaryRow } from "./payment-summary";

/*
 * Adding a service from Your services (plan 63, Option Y). A monthly Razorpay or fake plan opens one combined subscription that
 * covers every service and starts on a new billing date; what falls before that date is paid when the customer approves it.
 * These are the page's words and figures for it; the figures come from planCombinedAddOn (packages/shared), never from here.
 */

/** Where the customer approves the combined subscription they opened by adding a service. Razorpay only. */
export const ADDED_SERVICE_PAY_PATH = "/billing/services/pay";

/** A service is set to stop, or the plan to change, on `changesOn`: a new service is added after that, so the change is not undone. */
export function planChangesFirst(changesOn: Date): string {
  return `Your plan changes on ${addOnDate(changesOn)}. You can add a new service after that.`;
}

/** What a combined add comes to, as planCombinedAddOn works it out (cents, in the business's currency). */
export interface CombinedFigures {
  readonly upfrontCents: number;
  readonly serviceCents: number;
  readonly extensionCents: number;
  readonly paidThroughAt: Date;
  readonly newBillingDate: Date;
  readonly monthlyCents: number;
  /** On the first-month offer. */
  readonly offer: boolean;
}

/** The dialog for adding as one combined subscription: the service up to the new date, the plan's extra days, what is due and what follows. */
export function combinedSummary(figures: CombinedFigures, serviceTitle: string, currency: MoneyCurrency): PaymentSummary {
  const until = addOnDate(figures.newBillingDate);
  const rows: PaymentSummaryRow[] = [
    {
      key: "service",
      label: figures.offer ? `${serviceTitle}, first month` : `${serviceTitle}, until ${until}`,
      amount: formatMoney(figures.serviceCents, currency),
      tone: "plain",
    },
  ];
  if (figures.extensionCents > 0) {
    rows.push({ key: "plan", label: `Your plan, ${addOnDate(figures.paidThroughAt)} to ${until}`, amount: formatMoney(figures.extensionCents, currency), tone: "plain" });
  }
  return {
    title: `Add ${serviceTitle}`,
    rows,
    totalLabel: "Due today",
    total: formatMoney(figures.upfrontCents, currency),
    notes: [`From ${until}, you pay ${formatMoney(figures.monthlyCents, currency)} a month for all your services.`, ...gstNote(currency)],
  };
}

/** What a charge for the rest of the paid month comes to (a plan that is not combined): the days left, then the new monthly payment. */
export interface QuoteFigures {
  readonly chargeCents: number;
  readonly daysLeft: number;
  readonly nextRenewalCents: number;
  readonly renewsOn: Date;
}

/** The dialog for adding with a charge for the rest of the paid month. */
export function quoteSummary(figures: QuoteFigures, serviceTitle: string, currency: MoneyCurrency): PaymentSummary {
  const days = figures.daysLeft === 1 ? "1 day" : `${figures.daysLeft} days`;
  return {
    title: `Add ${serviceTitle}`,
    rows: [{ key: "rest", label: `${serviceTitle}, ${days} left this month`, amount: formatMoney(figures.chargeCents, currency), tone: "plain" }],
    totalLabel: "Due today",
    total: formatMoney(figures.chargeCents, currency),
    notes: [`Then ${formatMoney(figures.nextRenewalCents, currency)} a month from ${addOnDate(figures.renewsOn)}.`, ...gstNote(currency)],
  };
}

/** The strip above the services: the next payment, and how many of the three plans are held. */
export interface ServicesGlance {
  /** Null when no payment follows (the account is closing) or it is arranged by hand. */
  readonly next: { readonly amount: string; readonly on: string } | null;
  readonly plansHeld: number;
  readonly plansTotal: number;
}

/** What the strip says. Null for a business with no subscription to show it for. */
export function servicesGlance(input: {
  readonly subscription: Pick<
    Subscription,
    "provider" | "cancelRequestedAt" | "commitmentEndsAt" | "paidThroughAt" | "bundledAddOnNetCents" | "pendingBundledAddOnNetCents" | "discountAmountCents" | "nextDiscountAmountCents"
  > | null;
  readonly plan: Pick<Plan, "recurringAmountCents" | "currency"> | null;
  readonly entries: readonly { readonly kind: "included" | "available"; readonly addOn: MonthlyAddOnId }[];
  readonly now: Date;
}): ServicesGlance | null {
  const { subscription, plan, entries, now } = input;
  if (subscription === null || plan === null) return null;
  const on = nextPaymentDate(subscription, now);
  const charge = renewalChargeCents(plan, nextDiscountCents(subscription), nextBundledNetCents(subscription));
  const pays = on !== null && charge !== null && subscription.cancelRequestedAt === null && subscription.provider !== "manual";
  return {
    next: pays ? { amount: formatMoney(charge, plan.currency), on: addOnDate(on) } : null,
    plansHeld: PLAN_ADD_ON_IDS.filter((addOn) => entries.some((entry) => entry.kind === "included" && entry.addOn === addOn)).length,
    plansTotal: PLAN_ADD_ON_IDS.length,
  };
}
