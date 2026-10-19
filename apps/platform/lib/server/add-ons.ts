import "server-only";
import { chargedAmountCents } from "@brandbasket/billing";
import {
  consumeRateLimit,
  findBusinessCurrency,
  findLiveBundledAddOns,
  withTenantScope,
  type BundledAddOn,
  type RateLimitRule,
  type ScopedTransaction,
} from "@brandbasket/db";
import { addOnById, addOnPrice, MONTHLY_ADD_ON_IDS, type AddOnPrice, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { removeBundledAddOn, type BasketDeps } from "@brandbasket/shared/server/basket-change";
import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";

/*
 * The Add-ons page's server side (docs/plans/11-platform-plans.md in the BrandBasket workspace). Brandbasket bills an add-on
 * only inside the plan's own monthly payment: it is chosen at the first checkout, and taken out here from the next billing
 * date. Adding one after the first payment joins the same payment too; until that is built (step 4 of the plan), the page
 * says to write to us. Fynix's separate add-on subscriptions are not sold here.
 */

/** A stuck button or a script must not be able to change the plan at the provider without limit. */
export const ADD_ON_CHECKOUT_RATE_LIMIT: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };

const TOO_MANY_ATTEMPTS = "That's a lot of attempts in a short time. Please wait a little and try again.";

function refused(message: string): { readonly kind: "refused"; readonly message: string } {
  return { kind: "refused", message };
}

/** What an add-on taken at the first checkout costs inside the plan's payment, as frozen on it. */
function bundledPrice(row: BundledAddOn, currency: AddOnPrice["currency"]): AddOnPrice {
  return {
    currency,
    listCents: row.listAmountCents,
    discountCents: row.offerDiscountAmountCents,
    offerCents: row.offerDiscountAmountCents,
    netCents: row.netAmountCents,
    taxRateBasisPoints: row.taxRateBasisPoints,
    chargedCents: chargedAmountCents(row.netAmountCents, 0, row.taxRateBasisPoints),
  };
}

/** The currency the business is billed in, which an add-on is priced in. */
async function billedCurrencyOf(tx: ScopedTransaction, businessId: string): Promise<AddOnPrice["currency"]> {
  const currency = await findBusinessCurrency(tx, businessId);
  if (currency === null) throw new Error(`No business with id ${businessId} to price an add-on for`);
  return currency;
}

export type AddOnPageEntry =
  /** Taken at the first checkout and billed inside the plan's monthly payment. */
  | {
      readonly kind: "included";
      readonly addOn: MonthlyAddOnId;
      readonly price: AddOnPrice;
      /** The next billing date, when the add-on stops if it has been asked to; null while it is not ending. */
      readonly endsOn: Date | null;
      /** The next billing date, whether or not it is ending: when taking it out would take effect. */
      readonly nextBillingOn: Date | null;
    }
  /** Not in the plan's payment: shown at today's list price, with the way to ask for it. */
  | { readonly kind: "available"; readonly addOn: MonthlyAddOnId; readonly price: AddOnPrice };

export interface AddOnsPage {
  readonly addOns: readonly AddOnPageEntry[];
  /** What the business is billed in. */
  readonly currency: AddOnPrice["currency"];
}

/** Everything the Add-ons page shows, read through row-level security as the signed-in customer. */
export async function loadAddOnsPage(customer: GrantedCustomer): Promise<AddOnsPage> {
  const { tenant } = customer;
  const { bundled, currency } = await withTenantScope(getAppDb(), tenant, async (tx) => ({
    bundled: await findLiveBundledAddOns(tx, tenant.businessId),
    currency: await billedCurrencyOf(tx, tenant.businessId),
  }));
  const nextBillingOn = customer.billing.subscription?.paidThroughAt ?? null;
  const addOns = MONTHLY_ADD_ON_IDS.map((addOn): AddOnPageEntry => {
    const included = bundled.find((row) => row.addOn === addOn && row.status === "active");
    if (included === undefined) return { kind: "available", addOn, price: addOnPrice(addOnById(addOn), currency) };
    return { kind: "included", addOn, price: bundledPrice(included, currency), endsOn: included.endRequestedAt === null ? null : nextBillingOn, nextBillingOn };
  });
  return { addOns, currency };
}

const NOT_IN_PLAN = "That add-on isn't part of your plan payment any more. Reload the page to see where it stands.";
const CANNOT_REMOVE_NOW = "We couldn't remove that just now. Please try again in a minute.";

/** What taking an add-on out of the plan's payment came to. */
export type BundledRemovalResult =
  | { readonly kind: "scheduled"; readonly endsOn: Date; readonly message: string }
  | { readonly kind: "refused"; readonly message: string };

/** The connections and plan maker the shared basket changes run with, on the platform. */
export function basketDeps(): BasketDeps {
  return { staffDb: getStaffDb(), provider: getBillingProvider(), ensureDiscountPlan };
}

/**
 * Takes an add-on out of the plan's monthly payment from the next billing date (removeBundledAddOn in
 * @brandbasket/shared/server/basket-change). The page's form carries only the add-on; the row, its price and the new amount
 * all come from the database, under the business's lock.
 */
export async function removeBundledAddOnFor(customer: Pick<GrantedCustomer, "tenant">, addOn: MonthlyAddOnId, now: Date): Promise<BundledRemovalResult> {
  const { businessId } = customer.tenant;
  const limit = await consumeRateLimit(getAppDb(), `add-on-checkout:business:${businessId}`, ADD_ON_CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  const removal = await removeBundledAddOn(basketDeps(), { businessId, addOn, now });
  switch (removal.kind) {
    case "scheduled":
      return {
        kind: "scheduled",
        endsOn: removal.endsOn,
        message: `${addOnById(addOn).title} stays until your next payment date, then it stops and your monthly payment goes down.`,
      };
    case "not-in-plan":
      return refused(NOT_IN_PLAN);
    case "failed":
      return refused(CANNOT_REMOVE_NOW);
    default: {
      const unhandled: never = removal;
      throw new Error(`Unhandled removal outcome: ${String(unhandled)}`);
    }
  }
}
