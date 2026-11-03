import "server-only";
import { findActivePlan, type Plan } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { getAppDb } from "@/lib/db";
import { basketNetCents, membershipPriceLine, servicesPhrase } from "../rules/membership";

/** The basket a sign-up link chose, named and priced in both currencies: the form shows the one for the country picked. */
export interface SignUpBasket {
  readonly name: string;
  readonly prices: Readonly<Record<MoneyCurrency, string | null>>;
}

/**
 * Prices the basket as checkout will price it, from the plan on sale in each currency. Plans are public (their row-level
 * security policy lets the app role read every row), so this reads them on the app connection with no scope. Null when no
 * Managed Website plan is on sale in that currency.
 */
export async function loadSignUpBasket(services: readonly MonthlyAddOnId[]): Promise<SignUpBasket> {
  const db = getAppDb();
  const [india, us] = await Promise.all([findActivePlan(db, "INR", "managed"), findActivePlan(db, "USD", "managed")]);
  const line = (plan: Plan | null): string | null => (plan === null ? null : membershipPriceLine(plan, basketNetCents(services, plan.currency)));
  return { name: servicesPhrase(services), prices: { INR: line(india), USD: line(us) } };
}
