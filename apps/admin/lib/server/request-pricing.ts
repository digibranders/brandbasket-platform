import "server-only";
import { findBillingState, type Database } from "@brandbasket/db";
import { chargePricing } from "@brandbasket/shared/lib/billing/charges";
import { summariseBilling } from "@brandbasket/shared/lib/billing/status";
import { includedEditsAllowed } from "@brandbasket/shared/lib/change-requests";

export interface RequestPricing {
  /** The price of one extra change hour, GST included, in paise (the plan's extra hour price). */
  readonly unitCents: number;
  readonly currency: "USD" | "INR";
  /** How many included edits the business has in a month: 0 when it does not hold the Managed Website service. */
  readonly includedAllowed: number;
}

/**
 * What a staff member needs to quote and to start an included edit: the hour's price from the customer's own plan (staff never
 * type a rate), its currency, and the month's allowance. Null when the business has no plan to price from. Staff connection.
 */
export async function requestPricing(db: Database, businessId: string, now: Date): Promise<RequestPricing | null> {
  const state = await findBillingState(db, businessId);
  if (state === null || state.plan === null) return null;
  const unitCents = chargePricing("change_hours", state.plan).unitAmountCents;
  if (unitCents === null) return null;
  return { unitCents, currency: state.plan.currency, includedAllowed: includedEditsAllowed(summariseBilling(state, now).hasWebsite) };
}
