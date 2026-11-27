import "server-only";
import { addMonthsUtc, monthsPerCycle } from "@brandbasket/billing";
import { gstInsideCents } from "@brandbasket/billing/tax";
import type { BillingInterval } from "@brandbasket/db";
import type { WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import { addOnById, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { WEBSITE_ALONE } from "@brandbasket/shared/lib/billing/bundle";
import { PAYMENT_RECEIVED_MESSAGE } from "@brandbasket/shared/lib/billing/payment-step";
import { describeDiscount } from "@brandbasket/shared/lib/billing/terms";
import { redirect } from "next/navigation";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import type { CustomerContext } from "@/lib/guards";
import { INTAKE_SUMMARY_STEP, startHref } from "../start/rules";
import type { BillingDetailsView } from "./rules/billing-details-view";
import { feeRenewalTerms } from "./rules/build-fee";
import { MEMBER_WELCOME_HREF } from "./rules/confirm-href";
import { ledgerOffer, ledgerRows, ledgerSummary, type LedgerRow } from "./rules/ledger";
import { buildSignupBasketTable, type SignupBasketTable } from "./rules/signup-basket";
import {
  billingParamValue,
  billingSwitchHrefs,
  isWaitingOnPayment,
  MEMBERSHIP_PATH,
  MEMBERSHIP_SERVICES_PARAM,
  readBillingInterval,
  readMembershipPaymentNotice,
  readSelectedServices,
  readWebsiteKind,
  renewalTerms,
  unsettledCheckout,
} from "./rules/membership";
import { CHECKOUT_COPY, CHECKOUT_PLAN_COPY, checkoutLead, checkoutSteps, type CheckoutStep } from "./rules/plans";
import { billingDetailsMissing } from "./server/billing-details";
import { loadBusinessEntry, loadSavedServices } from "./server/entry";
import { recordFirstPaymentIfHeld } from "./server/first-payment-lookup";
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
  /** A staff payment link decided the basket, how often it is paid, the kind of website and the build fee: none of them can be changed here. */
  readonly locked: boolean;
  /** The kind of website the Pay form posts back (plan 65). */
  readonly siteKind: WebsiteKind;
}

export interface CheckoutAbout {
  readonly gets: readonly { readonly title: string; readonly items: readonly string[] }[];
  readonly steps: readonly CheckoutStep[];
}

export type CheckoutView =
  | { readonly kind: "pay"; readonly title: string; readonly lead: string; readonly ledger: CheckoutLedgerView; readonly about: CheckoutAbout }
  /** A sign-up account that has not paid: the one-screen checkout (plan 64) in its signed-in mode, with its own figures. */
  | {
      readonly kind: "signup-pay";
      readonly table: SignupBasketTable;
      readonly services: readonly string[];
      readonly paymentFailed: boolean;
      /** The kind of website to open on (plan 65). */
      readonly websiteKind: WebsiteKind;
      /** Set when a staff payment link decided the deal: the screen then offers no way to change it. */
      readonly link: { readonly interval: BillingInterval; readonly discountCents: number; readonly note: string | null } | null;
    }
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
 * payment opened it) and a lapsed one to Plan & billing to reactivate. A sign-up account that has not paid is shown the one-screen
 * checkout whatever the questions say: they are asked after the payment. The caller has run the guard.
 */
export async function loadCheckout(customer: CustomerContext, params: Params, now: Date = new Date()): Promise<CheckoutView> {
  const { billing } = customer;
  const notice = readMembershipPaymentNotice(params);
  if (billing.status === "paid") redirect(notice === "received" ? MEMBER_WELCOME_HREF : "/");
  // Restarting a lapsed plan is reactivation, on Plan & billing, never a new first payment.
  if (billing.status === "lapsed") redirect("/billing");
  // Not a redirect: the workspace layout sends an unpaid sign-up back here, so sending a non-owner Home would loop.
  if (customer.role !== "owner") return { kind: "owner-only" };

  // The provider’s webhook can be late or refused. A checkout that is still open is asked about first, so a payment the provider already
  // holds is recorded now and the customer moves on, instead of being offered Pay again.
  const openCheckout = unsettledCheckout(billing.subscription);
  if (openCheckout !== null && (await recordFirstPaymentIfHeld(openCheckout))) redirect(MEMBER_WELCOME_HREF);

  const entry = await loadBusinessEntry(customer);
  const signUp = entry.kind === "listing";
  // A website client invited by staff pays for the website alone (the old Check and send); a sign-up account for its basket.
  // A sign-up account owes the list build fee for its website (decision D14); a website client invited by staff has always had a free build.
  const view = await loadMembershipCheckout(customer, "managed", signUp ? readSelectedServices(params) : WEBSITE_ALONE, now, readBillingInterval(params), {
    chosenKind: readWebsiteKind(params),
    chargeListFee: signUp,
  });
  const interval = view.interval;
  const waiting = isWaitingOnPayment(billing.subscription, notice);

  if (billing.paymentUnderReview) return { kind: "under-review", message: PAYMENT_RECEIVED_MESSAGE };
  const checkout = unsettledCheckout(billing.subscription);
  if (waiting && checkout !== null) return { kind: "waiting", waitKey: `membership:${checkout.id}` };
  const { plan } = view;
  if (plan === null) return { kind: "no-plan" };

  // The one-screen checkout prices every service on sale itself, so it cannot show a code's discount, and it asks for no billing
  // address: a sign-up that gave its state needs none. A business with either of those keeps the full checkout below.
  if (signUp && view.firstMonth !== null && view.discount === null && view.lapsedCode === null && !(await billingDetailsMissing(customer))) {
    const named = params[MEMBERSHIP_SERVICES_PARAM] !== undefined;
    return {
      kind: "signup-pay",
      table: buildSignupBasketTable(plan.currency, view.firstMonth.provider, view.firstMonth.hadService),
      services: view.locked ? view.services : named ? readSelectedServices(params) : await loadSavedServices(customer),
      paymentFailed: notice === "failed",
      websiteKind: view.deal.kind,
      link: view.locked ? { interval, discountCents: view.deal.fee?.discountCents ?? 0, note: view.deal.note } : null,
    };
  }

  const pricing = {
    planInitialAmountCents: plan.initialAmountCents,
    currency: plan.currency,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    forfeited: view.forfeited,
    hasEverPaid: view.hasEverPaid,
    interval,
    kind: view.deal.kind,
  };
  const code = view.discount === null ? null : { code: view.discount.code, stated: view.discount.stated, months: view.discount.months };
  const summary = ledgerSummary(pricing, view.services, code);
  // With a plan on the first-month offer (plan 63) today's payment is less than a month of the services: the checkout charges it.
  const firstMonth = ledgerOffer(summary, view.firstMonth, plan.currency, interval, view.deal);
  const dueCents = firstMonth?.firstPaymentCents ?? summary.totalCents;
  const taxed = plan.taxRateBasisPoints > 0;
  return {
    kind: "pay",
    title: CHECKOUT_COPY.title,
    lead: checkoutLead(plan.currency, plan.taxRateBasisPoints),
    ledger: {
      services: view.services,
      billing: { interval, value: billingParamValue(interval), ...billingSwitchHrefs(MEMBERSHIP_PATH, params) },
      rows: ledgerRows(summary, plan.currency, code, firstMonth, view.deal),
      total: formatMoney(dueCents, plan.currency),
      gstLine: taxed ? `Includes ${formatMoney(gstInsideCents(dueCents, plan.taxRateBasisPoints), plan.currency)} of GST at ${formatPercent(plan.taxRateBasisPoints / 100)}` : null,
      adCredit: summary.adCredit?.label ?? null,
      renewal:
        view.deal.fee !== null && view.deal.fee.netCents > 0
          ? feeRenewalTerms({
              currency: plan.currency,
              taxed,
              interval,
              cycleCents: interval === "year" ? summary.totalWithoutCodeCents : summary.totalCents,
              services: summary.lines.length,
              codeMonths: code?.months ?? null,
              cycleWithoutCodeCents: summary.totalWithoutCodeCents,
            })
          : renewalTerms(
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
      changeServicesHref: signUp && !view.locked && view.offer.kind === "available" ? startHref(view.services, INTAKE_SUMMARY_STEP) : null,
      paymentFailed: notice === "failed",
      locked: view.locked,
      siteKind: view.deal.kind,
    },
    about: {
      gets: view.services.map((id) => ({ title: addOnById(id).title, items: CHECKOUT_PLAN_COPY[id].gets })),
      steps: checkoutSteps(view.services, view.deal.kind),
    },
  };
}

