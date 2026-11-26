import type { BillingDetailsStart, SavedBillingDetails } from "@brandbasket/shared/lib/billing/billing-details-start";

/**
 * What Billing shows and asks for as the customer's billing details. The view is plain data and has no database or
 * request access; lib/server/billing-details.ts reads the rows and builds it with the helpers in
 * @brandbasket/shared/lib/billing/billing-details-start, which the staff client page uses too.
 */

export interface BillingDetailsView {
  /** Null until the customer saves details. */
  readonly saved: SavedBillingDetails | null;
  /** The business's own name: what an invoice is made out to when the customer has no GSTIN. */
  readonly businessName: string;
  /** The saved details, or else the onboarding name and address, so the form rarely starts empty. */
  readonly start: BillingDetailsStart;
}

/**
 * Whether a business is billed in rupees, the only payments that get tax invoices (D1). A business with a plan is billed
 * in the plan's currency; a free listing account has no plan, so its own billing currency decides (it still pays for ad
 * spots and promotions). Null means the currency could not be read, which counts as no.
 */
export function billsInRupees(planCurrency: string | null, businessCurrency: string | null): boolean {
  return (planCurrency ?? businessCurrency) === "INR";
}

/** What decides whether a checkout waits for billing details: who is paying, and what is already known about them. */
export interface BillingGateFacts {
  readonly rupees: boolean;
  readonly hasProfile: boolean;
  readonly kind: "website" | "listing";
  readonly signupChoice: string | null;
  /** The GST state the owner gave at sign-up, or null for an older account or a country outside India. */
  readonly stateCode: string | null;
  /** Whether the business name and onboarding address could be printed on an invoice (printable ASCII): an invoice made out from them must be. */
  readonly fallbackPrintable: boolean;
}

/**
 * Whether the checkout must collect billing details before opening a payment. A tax invoice needs a recipient, and without a
 * profile it falls back to the business name and the state given at sign-up (findInvoiceFallbackRecipient), which is all a
 * buyer without a GSTIN is asked for. So only a paid sign-up that gave its state, and whose name and address can be printed, may pay without a profile (an unprintable one would leave the invoice unissued). A client invited by
 * staff, a free listing account and a sign-up with no state are asked for the full details, as before.
 */
export function needsBillingDetails(facts: BillingGateFacts): boolean {
  if (!facts.rupees || facts.hasProfile) return false;
  const paidSignUp = facts.kind === "listing" && facts.signupChoice === "managed";
  return !(paidSignUp && facts.stateCode !== null && facts.fallbackPrintable);
}
