import type { BillingDetailsStart, SavedBillingDetails } from "@fynix/shared/lib/billing/billing-details-start";

/**
 * What Billing shows and asks for as the customer's billing details. The view is plain data and has no database or
 * request access; lib/server/billing-details.ts reads the rows and builds it with the helpers in
 * @fynix/shared/lib/billing/billing-details-start, which the staff client page uses too.
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
