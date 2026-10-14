import "server-only";
import { BillingRangeError } from "@fynix/billing/billing-range-error";
import { UnknownStateError } from "@fynix/billing/gst-states";
import { InvalidGstinError } from "@fynix/billing/gstin";
import { InvoiceAmountMismatchError } from "@fynix/billing/tax-invoice";
import { constraintOf, errorLogInfo, providerErrorInfo } from "./error-log-info";

/** Every billing log line starts with this, so `grep '\[fynix:billing\]'` finds them all. */
export const BILLING_LOG_PREFIX = "[fynix:billing]";

/**
 * The billing events worth a log line. Each is a fixed, greppable name; the details travel as fields.
 * - `confirmation-refused`: a confirmation passed the provider's signature check and was then refused or set aside.
 * - `submission-failed-after-payment`: a first payment was recorded, then sending the customer's answers failed.
 * - `provider-cancel-failed`: a subscription we no longer want could not be cancelled at the provider.
 * - `checkout-orphaned`: a subscription opened at the provider could not be recorded here.
 * - `webhook-processing-failed`: a webhook event's own processing failed for a reason unrelated to the data itself —
 *   typically a database or network error — and should be investigated; Razorpay will retry the delivery.
 * - `discount-plan-failed`: the provider would not create the discounted plan a code needs, so no checkout opened.
 * - `retention-offer-failed`: the provider would not move a subscription to the discounted plan a stay offer needs, or
 *   our record of the offer could not be written after it had. Either way staff should check the subscription.
 * - `upgrade-provider-failed`: a customer paid to move up to Premium and the provider would not (or could not) move
 *   their subscription to Premium's plan from the next renewal. They have Premium; staff finish the move by hand.
 * - `upgrade-renewal-at-old-price`: a renewal arrived at the old plan's price while a paid move up was waiting for
 *   it, so the provider has not moved the subscription; staff should check it.
 * - `affiliate-currency-mismatch`: a payment on an affiliate code earned nothing because the affiliate's flat reward
 *   is in another currency; staff should fix the reward and add the earning by hand.
 * - `tax-invoice-issued`: a payment got its tax invoice. Logged at info, so the register can be traced to payments.
 * - `tax-invoice-failed`: a payment was recorded but its tax invoice could not be issued. The payment stands; staff
 *   issue the missing invoice from the client page.
 * - `invoice-register-failed`: the monthly register could not be written because one invoice could not (an unknown
 *   state, say). The fields name the month and the invoice number, never the customer, so staff can find the invoice.
 * - `billing-details-saved-by-staff`: a staff member changed a client's billing details. Names who and for which
 *   business, never the values, which are a customer's name, GSTIN and address.
 * - `add-on-plan-failed`: the provider would not make the plan an add-on purchase needs, so no checkout opened.
 * - `add-on-checkout-failed`: the provider would not open an add-on subscription, so no checkout opened.
 * - `add-on-end-failed`: the provider would not stop an add-on subscription (a pause or cancel, or undoing a Keep it),
 *   so nothing was recorded and the customer was asked to try again.
 * - `add-on-end-not-recorded`: the provider was told to stop an add-on, then our record had moved on and could not be
 *   updated. Staff should check the subscription at the provider.
 * - `add-on-view-failed`: an add-on row holds data the page cannot make sense of. Staff should look at the row.
 */
export type BillingLogEvent =
  | "confirmation-refused"
  | "submission-failed-after-payment"
  | "provider-cancel-failed"
  | "checkout-orphaned"
  | "webhook-processing-failed"
  | "affiliate-currency-mismatch"
  | "discount-plan-failed"
  | "retention-offer-failed"
  | "upgrade-provider-failed"
  | "upgrade-renewal-at-old-price"
  | "tax-invoice-issued"
  | "tax-invoice-failed"
  | "invoice-register-failed"
  | "billing-details-saved-by-staff"
  | "add-on-plan-failed"
  | "add-on-checkout-failed"
  | "add-on-end-failed"
  | "add-on-end-not-recorded"
  | "add-on-view-failed";

/** Plain values only. Never put a checkout token or any other credential in here. */
export type BillingLogFields = Readonly<Record<string, string | number | boolean | null>>;

/** An error as a billing log line may carry it. */
export interface DescribedError {
  readonly errorName: string;
  readonly pgCode: string | null;
  /** The database constraint it broke, when it was a constraint violation. */
  readonly constraint: string | null;
  /** The provider's or network's error code ("BAD_REQUEST_ERROR", "ECONNRESET"), when the failure carries one. */
  readonly providerCode: string | null;
  /** The HTTP status of a provider's refusal, when the failure carries one. */
  readonly httpStatus: number | null;
  /** Null unless the error is one of ours whose message holds no customer details (see describeError). */
  readonly errorMessage: string | null;
}

/**
 * Errors whose messages we write ourselves and keep free of customer details: state codes, amounts and counts only.
 * Anything else may carry them: Drizzle puts a failed query's params (names, GSTINs, addresses) into its message.
 * Not a bare RangeError: other code throws those with messages that quote input.
 */
const MESSAGE_SAFE_ERRORS: readonly (abstract new (...args: never[]) => Error)[] = [
  UnknownStateError,
  InvoiceAmountMismatchError,
  InvalidGstinError,
  BillingRangeError,
];

/**
 * An error reduced to what is safe and useful in a log: its name, Postgres code and constraint (see errorLogInfo), a
 * payment provider's error code and HTTP status (see providerErrorInfo), and its message only for the errors in
 * MESSAGE_SAFE_ERRORS. Never a payload or description it may carry.
 */
export function describeError(error: unknown): DescribedError {
  const safeMessage = MESSAGE_SAFE_ERRORS.some((kind) => error instanceof kind) && error instanceof Error ? error.message : null;
  return { ...errorLogInfo(error), constraint: constraintOf(error), ...providerErrorInfo(error), errorMessage: safeMessage };
}

/**
 * Writes one structured billing log line: the prefix and event name as the message, then a JSON object of fields,
 * so a log search can filter on `event` and `businessId` alike.
 */
export function logBillingEvent(level: "info" | "warn" | "error", event: BillingLogEvent, fields: BillingLogFields): void {
  const line = `${BILLING_LOG_PREFIX} ${event} ${JSON.stringify({ event, ...fields })}`;
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
