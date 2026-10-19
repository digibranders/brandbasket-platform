import type { Plan } from "@brandbasket/db";
import { formatCalendarDate } from "@brandbasket/shared/lib/format";
import type { ChecklistItem } from "@brandbasket/shared/lib/onboarding/checklist";
import type { CustomerBillingStatus } from "./status";
import {
  describeDiscountedPlanTerms,
  discountedFirstPaymentAmount,
  initialTermLabel,
  type PlanDiscount,
} from "@brandbasket/shared/lib/billing/terms";

/** Check and send, where payment happens. */
export const PAYMENT_STEP_HREF = "/onboarding/review";

/** Billing: the plan, its receipts, and where a customer whose plan has lapsed reactivates it. */
export const BILLING_HREF = "/billing";

/** Where a lapsed customer reactivates, and where that payment brings them back. */
export const REACTIVATE_HREF = BILLING_HREF;

/** How a reactivation payment went, as Billing's `?payment=` says it. */
export type ReactivationReturn = "received" | "failed";

/** Billing after a reactivation payment, saying how it went. */
export function reactivationReturnHref(result: ReactivationReturn): string {
  return `${REACTIVATE_HREF}?payment=${result}`;
}

/** What a customer is told when money arrived that could not be applied, and while staff sort it out. */
export const PAYMENT_RECEIVED_MESSAGE =
  "We’ve received your payment. Our team will be in touch shortly to sort out your account.";

/** What a customer whose plan has lapsed is told, everywhere it comes up. */
export const PLAN_ENDED_MESSAGE = "Your plan has ended. Your website and content are safe, and you can restart it from Billing.";

/** What the payment part of Check and send offers. */
export type PaymentStep =
  /** Not paid, answers still open: pay, and sending happens with it. `ready` mirrors the checklist. */
  | { readonly kind: "pay-and-send"; readonly amount: string; readonly terms: string; readonly ready: boolean }
  /** Not paid, but the answers were sent before payment was required: pay, nothing more to send. */
  | { readonly kind: "pay"; readonly amount: string; readonly terms: string }
  /** Paid and still open: send without paying again. `missing` is what the checklist still needs. */
  | { readonly kind: "send"; readonly missing: ChecklistItem | null }
  /** Paid once, lapsed since: restarting is reactivation, on Billing. */
  | { readonly kind: "reactivate" }
  /** Money arrived that could not be applied; staff are sorting it out, so nothing is offered. */
  | { readonly kind: "under-review" }
  /** No price exists for the business's currency, so nothing can be charged. */
  | { readonly kind: "no-plan" }
  /** Paid and sent, or nothing to set up. */
  | { readonly kind: "none" };

export interface PaymentStepInput {
  readonly status: CustomerBillingStatus;
  readonly plan: Plan | null;
  readonly hasProject: boolean;
  /** True once the answers have been sent. */
  readonly locked: boolean;
  readonly missing: ChecklistItem | null;
  /** A received payment is waiting for staff (see CustomerBilling.paymentUnderReview). */
  readonly paymentUnderReview: boolean;
  /**
   * The referral discount in force, or null. Every amount this returns is computed from it, so the price on the
   * button is always the price the checkout is opened for.
   */
  readonly discount: PlanDiscount | null;
}

export function paymentStep({
  status,
  plan,
  hasProject,
  locked,
  missing,
  paymentUnderReview,
  discount,
}: PaymentStepInput): PaymentStep {
  if (!hasProject) return { kind: "none" };
  switch (status) {
    case "paid":
      return locked ? { kind: "none" } : { kind: "send", missing };
    case "lapsed":
      return locked ? { kind: "none" } : { kind: "reactivate" };
    case "unpaid": {
      if (paymentUnderReview) return { kind: "under-review" };
      if (plan === null) return { kind: "no-plan" };
      const amount = discountedFirstPaymentAmount(plan, discount);
      const terms = describeDiscountedPlanTerms(plan, discount);
      return locked
        ? { kind: "pay", amount, terms }
        : { kind: "pay-and-send", amount, terms, ready: missing === null };
    }
    default: {
      const unhandled: never = status;
      throw new Error(`Unhandled billing status: ${String(unhandled)}`);
    }
  }
}

export interface BannerInput {
  readonly status: CustomerBillingStatus;
  readonly plan: Plan | null;
  /** Every answer step is done (or the answers were already sent). */
  readonly setupComplete: boolean;
  /** The answers were sent before payment was required, so the build is waiting only on the payment. */
  readonly locked: boolean;
  /** A received payment is waiting for staff. */
  readonly paymentUnderReview: boolean;
  /** The first step still to do. */
  readonly nextStepHref: string;
  /** The referral discount in force, or null; the banner's price matches the Pay button's. */
  readonly discount: PlanDiscount | null;
  /** A renewal is failing and being retried: the date the paid period ends (CustomerBilling.renewalFailingUntil). */
  readonly renewalFailingUntil: Date | null;
}

export interface BannerAction {
  readonly href: string;
  readonly label: string;
}

export interface BannerPrice {
  /** "$75" */
  readonly amount: string;
  /** "First month" */
  readonly term: string;
}

interface BannerCopy {
  readonly title: string;
  readonly message?: string;
}

export type BillingBannerModel =
  /** Payment is still to be made: the price, and a button to the next thing to do. */
  | (BannerCopy & { readonly kind: "pay"; readonly price: BannerPrice | null; readonly action: BannerAction })
  /** A renewal failed and is being retried inside the paid period: nothing is lost yet, but the customer should know. */
  | (BannerCopy & { readonly kind: "retrying"; readonly action: BannerAction })
  /** The plan has ended: a button to Billing, where the price is shown and the plan restarted. */
  | (BannerCopy & { readonly kind: "reactivate"; readonly action: BannerAction })
  /** Nothing to do but wait for the team. */
  | (BannerCopy & { readonly kind: "notice" });

const PAY_TITLE = "Make your payment to continue";
const PAY_TO_CARRY_ON = "Once it’s done, we’ll carry on building your website.";

function priceOf(plan: Plan | null, discount: PlanDiscount | null): BannerPrice | null {
  return plan === null
    ? null
    : { amount: discountedFirstPaymentAmount(plan, discount), term: initialTermLabel(plan.initialTermMonths) };
}

function payAction(plan: Plan | null): BannerAction {
  // The price sits beside the button, so the button needn't repeat it.
  return { href: PAYMENT_STEP_HREF, label: plan === null ? "Check and send" : "Pay now" };
}

/**
 * The payment banner, or null when none should show (a customer inside a paid period). Its words match the
 * customer's state, and its button never points at a payment the customer can't make yet: until setup is complete
 * it sends them to finish it.
 */
export function billingBanner({
  status,
  plan,
  setupComplete,
  locked,
  paymentUnderReview,
  nextStepHref,
  discount,
  renewalFailingUntil,
}: BannerInput): BillingBannerModel | null {
  switch (status) {
    case "paid":
      if (renewalFailingUntil === null) return null;
      // Access runs to the end of the period that was paid for, so the customer is told when it ends if retries fail.
      return {
        kind: "retrying",
        title: "We couldn’t take your last payment",
        message: `We’ll try again. Your website stays online until ${formatCalendarDate(renewalFailingUntil, "Asia/Kolkata")}; if the payments keep failing, it goes offline then.`,
        action: { href: BILLING_HREF, label: "See Billing" },
      };
    case "lapsed":
      // The price is on Billing, beside the Reactivate button, worked out from the plan on sale today.
      return {
        kind: "reactivate",
        title: "Your plan has ended",
        message: "Your website and content are safe. Restart it from Billing.",
        action: { href: REACTIVATE_HREF, label: "Reactivate" },
      };
    case "unpaid": {
      if (paymentUnderReview) {
        return {
          kind: "notice",
          title: "Payment received",
          message: "Our team will be in touch shortly to sort out your account.",
        };
      }
      const price = priceOf(plan, discount);
      if (locked) return { kind: "pay", title: PAY_TITLE, message: PAY_TO_CARRY_ON, price, action: payAction(plan) };
      const action = setupComplete ? payAction(plan) : { href: nextStepHref, label: "Finish setup" };
      return { kind: "pay", title: PAY_TITLE, price, action };
    }
    default: {
      const unhandled: never = status;
      throw new Error(`Unhandled billing status: ${String(unhandled)}`);
    }
  }
}

/** Where a payment that could not be applied lands: Check and send, with the "we've received it" message. */
export const PAYMENT_RECEIVED_HREF = `${PAYMENT_STEP_HREF}?payment=received`;

/** Where a confirmed payment lands: the project once it is sent, otherwise back on Check and send. */
export function afterPaymentHref(projectStillOpen: boolean): string {
  return projectStillOpen ? PAYMENT_STEP_HREF : "/project";
}
