import "server-only";
import { addMonthsUtc, monthsPerCycle } from "@brandbasket/billing";
import type { BillingInterval } from "@brandbasket/db";
import { addOnById, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";
import { PAYMENT_RECEIVED_MESSAGE } from "@brandbasket/shared/lib/billing/payment-step";
import { describeDiscount } from "@brandbasket/shared/lib/billing/terms";
import { redirect } from "next/navigation";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { INTAKE_SUMMARY_STEP, startHref } from "../start/rules";
import { loadIntake } from "../start/server";
import type { BillingDetailsView } from "./rules/billing-details-view";
import { MEMBER_WELCOME_HREF } from "./rules/confirm-href";
import { ledgerRows, ledgerSummary, type LedgerRow } from "./rules/ledger";
import {
  billingParamValue,
  billingSwitchHrefs,
  isWaitingOnPayment,
  MEMBERSHIP_PATH,
  readBillingInterval,
  readMembershipPaymentNotice,
  readSelectedServices,
  renewalTerms,
  unsettledCheckout,
} from "./rules/membership";
import { CHECKOUT_COPY, CHECKOUT_PLAN_COPY, checkoutLead, checkoutSteps, type CheckoutStep } from "./rules/plans";
import { loadBusinessEntry } from "./server/entry";
import { loadMembershipCheckout } from "./server/membership-checkout";

/*
 * The view behind /checkout: the old /plan page (apps/platform components/panel/membership/membership-page.tsx) for an
 * account a sign-up opened, and the old Check and send payment (/onboarding/review) for a website client invited by staff,
 * which pays for the website alone. Every figure comes from the shared pricing through rules/ledger.ts and
 * rules/membership.ts; the page works nothing out.
 */

/** What the price card shows and the Pay form posts. */
export interface CheckoutLedgerView {
  readonly services: readonly MonthlyAddOnId[];
  /** How often this basket is paid for, and where each choice of the Monthly | Yearly switch goes. */
  readonly billing: { readonly interval: BillingInterval; readonly value: string; readonly monthlyHref: string; readonly yearlyHref: string };
  readonly rows: readonly LedgerRow[];
  readonly total: string;
  /** "Includes ₹4,637 of GST at 18%", or null for a plan with no GST (USD never mentions it). */
  readonly gstLine: string | null;
  readonly adCredit: string | null;
  /** The line under the Pay button: what is taken each month after this payment. */
  readonly renewal: string;
  /** The code in force, worded, or null. */
  readonly code: { readonly code: string; readonly worth: string | null } | null;
  readonly lapsedCode: string | null;
  /** Null for a business that gets no tax invoice (billed in dollars). */
  readonly billingDetails: BillingDetailsView | null;
  /** Where "Change services" goes, or null when the services cannot be changed here. */
  readonly changeServicesHref: string | null;
  readonly paymentFailed: boolean;
}

export interface CheckoutAbout {
  readonly gets: readonly { readonly title: string; readonly items: readonly string[] }[];
  readonly steps: readonly CheckoutStep[];
}

export type CheckoutView =
  | { readonly kind: "pay"; readonly title: string; readonly lead: string; readonly ledger: CheckoutLedgerView; readonly about: CheckoutAbout }
  /** Money arrived that bought nothing; staff are sorting it out, so nothing is offered. */
  | { readonly kind: "under-review"; readonly message: string }
  /** Back from the provider before its word arrived: the page reloads until the payment is recorded. */
  | { readonly kind: "waiting"; readonly waitKey: string }
  /** No plan is on sale in the business's currency. */
  | { readonly kind: "no-plan" }
  /** A member who is not the owner: paying is the owner's (the actions refuse anyone else). */
  | { readonly kind: "owner-only" };

type Params = Readonly<Record<string, string | string[] | undefined>>;

/**
 * Reads the checkout for the signed-in business, or redirects: a business that has paid goes Home (with the welcome when this
 * payment opened it), a lapsed one to Plan & billing to reactivate, and a new account that has not finished the questions to
 * /start. The caller has run the guard.
 */
export async function loadCheckout(customer: CustomerContext, params: Params, now: Date = new Date()): Promise<CheckoutView> {
  const { billing } = customer;
  const notice = readMembershipPaymentNotice(params);
  if (billing.status === "paid") redirect(notice === "received" ? MEMBER_WELCOME_HREF : "/");
  // Restarting a lapsed plan is reactivation, on Plan & billing, never a new first payment.
  if (billing.status === "lapsed") redirect("/billing");
  // Not a redirect: the workspace layout sends an unpaid sign-up back here, so sending a non-owner Home would loop.
  if (customer.role !== "owner") return { kind: "owner-only" };

  const entry = await loadBusinessEntry(customer);
  const signUp = entry.kind === "listing";
  // A website client invited by staff pays for the website alone (the old Check and send); a sign-up account for its basket.
  const interval = readBillingInterval(params);
  const view = await loadMembershipCheckout(customer, "managed", signUp ? readSelectedServices(params) : WEBSITE_ALONE, now, interval);
  const waiting = isWaitingOnPayment(billing.subscription, notice);

  // A new account answers the short questions first. A payment on its way, or under review, is never sent away from the page
  // that says so.
  if (signUp && view.offer.kind === "available" && notice === null && !waiting && !billing.paymentUnderReview) {
    if ((await loadIntake(customer.tenant)).completedAt === null) redirect(startHref(view.services));
  }

  if (billing.paymentUnderReview) return { kind: "under-review", message: PAYMENT_RECEIVED_MESSAGE };
  const checkout = unsettledCheckout(billing.subscription);
  if (waiting && checkout !== null) return { kind: "waiting", waitKey: `membership:${checkout.id}` };
  const { plan } = view;
  if (plan === null) return { kind: "no-plan" };

  const pricing = {
    planInitialAmountCents: plan.initialAmountCents,
    currency: plan.currency,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    forfeited: view.forfeited,
    hasEverPaid: view.hasEverPaid,
    interval,
  };
  const code = view.discount === null ? null : { code: view.discount.code, stated: view.discount.stated, months: view.discount.months };
  const summary = ledgerSummary(pricing, view.services, code);
  const taxed = plan.taxRateBasisPoints > 0;
  return {
    kind: "pay",
    title: CHECKOUT_COPY.title,
    lead: checkoutLead(plan.currency, plan.taxRateBasisPoints),
    ledger: {
      services: view.services,
      billing: { interval, value: billingParamValue(interval), ...billingSwitchHrefs(MEMBERSHIP_PATH, params) },
      rows: ledgerRows(summary, plan.currency, code),
      total: formatMoney(summary.totalCents, plan.currency),
      gstLine: taxed ? `Includes ${formatMoney(summary.gstCents, plan.currency)} of GST at ${formatPercent(plan.taxRateBasisPoints / 100)}` : null,
      adCredit: summary.adCredit?.label ?? null,
      renewal: renewalTerms(
        summary,
        { ...pricing, initialTermMonths: plan.initialTermMonths },
        code?.months ?? null,
        interval === "year" ? formatDate(addMonthsUtc(now, monthsPerCycle("year")), now) : null,
      ),
      code:
        view.discount === null
          ? null
          : { code: view.discount.code, worth: describeDiscount({ code: view.discount.code, amountCents: summary.discountCents, months: view.discount.months, stated: view.discount.stated }, plan.currency) },
      lapsedCode: view.lapsedCode,
      billingDetails: view.billingDetails,
      changeServicesHref: signUp && view.offer.kind === "available" ? startHref(view.services, INTAKE_SUMMARY_STEP) : null,
      paymentFailed: notice === "failed",
    },
    about: {
      gets: view.services.map((id) => ({ title: addOnById(id).title, items: CHECKOUT_PLAN_COPY[id].gets })),
      steps: checkoutSteps(view.services),
    },
  };
}

