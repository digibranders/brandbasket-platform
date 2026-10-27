import "server-only";
import { acceptChangeQuote, ChangeRequestError } from "@brandbasket/db";
import type { GrantedCustomer } from "./customer-access";
import { getStaffDb } from "./db";

/**
 * The customer's yes to a quote: opens the charge for it (or finds the one a double click already opened) and returns its id,
 * for the payment to start from. Customers never write charges through their own connection, so this runs on the staff
 * connection after the caller has proved who is asking: the business comes only from the session, the price only from the
 * stored quote, and the plan's GST rate from the customer's own billing. The work starts when the charge is paid.
 */
export async function openQuoteCharge(customer: Pick<GrantedCustomer, "tenant" | "billing">, requestId: string, now: Date): Promise<{ readonly chargeId: string }> {
  const { plan } = customer.billing;
  if (plan === null) throw new ChangeRequestError("forbidden", "There is no plan to price this quote from.");
  const { chargeId } = await acceptChangeQuote(getStaffDb(), {
    requestId,
    businessId: customer.tenant.businessId,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    now,
  });
  return { chargeId };
}
