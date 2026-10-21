import "server-only";
import { chargedAmountCents } from "@brandbasket/billing";
import {
  consumeRateLimit,
  findBusinessCurrency,
  findLiveBundledAddOns,
  isPackageOfferForfeited,
  withTenantScope,
  type BundledAddOn,
  type RateLimitRule,
  type ScopedTransaction,
} from "@brandbasket/db";
import { addOnById, isMonthlyAddOnId, MONTHLY_ADD_ON_IDS, type AddOnPrice, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { packageLineWith } from "@brandbasket/shared/lib/billing/packages";
import {
  readAddOnAssessment,
  removeBundledAddOn,
  startAddOn,
  type AddOnAssessment,
  type BasketDeps,
} from "@brandbasket/shared/server/basket-change";
import { dropPreview, type DropPreview } from "@/lib/billing/drop-service";
import { getBillingProvider } from "./billing";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb, getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";

/*
 * The Add-ons page's server side (docs/plans/11-platform-plans.md and 13-platform-add-ons-after-signup.md in the BrandBasket
 * workspace). Brandbasket bills an add-on only inside the plan's own monthly payment: chosen at the first checkout, or added
 * here with a charge for the rest of the paid month, and taken out here from the next billing date. Fynix's separate add-on
 * subscriptions are not sold here.
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

/** What an add-on that is not in the plan's payment offers: the add, or why not and what to do instead. */
export type AddOnOffer =
  /** Add it now: the charge for the rest of the paid month, then the new monthly payment from `renewsOn`, both with tax. */
  | { readonly kind: "quote"; readonly chargeCents: number; readonly daysLeft: number; readonly nextRenewalCents: number; readonly renewsOn: Date }
  /** The month renews within the hour: add it after `renewsOn`. */
  | { readonly kind: "renewal-due"; readonly renewsOn: Date | null }
  /** Paid by bank transfer: staff add it. */
  | { readonly kind: "manual" }
  /** Anything else that stops an add here (no live plan, a payment under review): write to us. */
  | { readonly kind: "write" };

export type AddOnPageEntry =
  /** Billed inside the plan's monthly payment. */
  | {
      readonly kind: "included";
      readonly addOn: MonthlyAddOnId;
      readonly price: AddOnPrice;
      /** The next billing date, when the add-on stops if it has been asked to; null while it is not ending. */
      readonly endsOn: Date | null;
      /** The next billing date, whether or not it is ending: when taking it out would take effect. */
      readonly nextBillingOn: Date | null;
      /** Added this month and paid for: the next billing date, from which it is in the monthly payment. Null once it is. */
      readonly joinsOn: Date | null;
      /** It is ending and adding it again keeps it, at no charge. */
      readonly keepable: boolean;
      /** What taking it out would leave, shown before it is done. Null when it is ending, is the only service (that is cancelling) or the account is closing. */
      readonly drop: DropPreview | null;
    }
  /** Not in the plan's payment: its price once added (the package price the basket would earn), and the add or the way to ask for it. */
  | { readonly kind: "available"; readonly addOn: MonthlyAddOnId; readonly price: AddOnPrice; readonly offer: AddOnOffer };

export interface AddOnsPage {
  readonly addOns: readonly AddOnPageEntry[];
  /** What the business is billed in. */
  readonly currency: AddOnPrice["currency"];
}

function offerOf(assessment: AddOnAssessment | null, renewsOn: Date | null): AddOnOffer {
  if (assessment === null) return { kind: "write" };
  switch (assessment.kind) {
    case "offer":
      return {
        kind: "quote",
        chargeCents: assessment.quote.chargeCents,
        daysLeft: assessment.quote.daysLeft,
        nextRenewalCents: assessment.quote.nextRenewalCents,
        renewsOn: assessment.quote.periodEnd,
      };
    case "unavailable":
      return assessment.reason === "renewal-due" ? { kind: "renewal-due", renewsOn } : { kind: "write" };
    case "blocked":
      return assessment.reason === "manual-billing" ? { kind: "manual" } : { kind: "write" };
    case "keep":
      return { kind: "write" };
    default: {
      const unhandled: never = assessment;
      throw new Error(`Unhandled add-on assessment: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Everything the Add-ons page shows, read through row-level security as the signed-in customer. */
export async function loadAddOnsPage(customer: GrantedCustomer, now: Date): Promise<AddOnsPage> {
  const { tenant } = customer;
  const providerName = getBillingProvider().name;
  const { bundled, currency, assessments, forfeited } = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const forfeited = await isPackageOfferForfeited(tx, tenant.businessId);
    const assessed = new Map<MonthlyAddOnId, AddOnAssessment | null>();
    for (const addOn of MONTHLY_ADD_ON_IDS) {
      assessed.set(addOn, await readAddOnAssessment(tx, { businessId: tenant.businessId, addOn, providerName, now, forfeited }));
    }
    return {
      bundled: await findLiveBundledAddOns(tx, tenant.businessId),
      currency: await billedCurrencyOf(tx, tenant.businessId),
      assessments: assessed,
      forfeited,
    };
  });
  const closing = customer.billing.subscription?.cancelRequestedAt != null;
  const stayingLines = bundled.filter((row) => row.status === "active" && row.endRequestedAt === null);
  const staying = stayingLines.map((row) => row.addOn).filter(isMonthlyAddOnId);
  const nextBillingOn = customer.billing.subscription?.paidThroughAt ?? null;
  const addOns = MONTHLY_ADD_ON_IDS.map((addOn): AddOnPageEntry => {
    const assessment = assessments.get(addOn) ?? null;
    const included = bundled.find((row) => row.addOn === addOn && row.status === "active");
    // What it costs once added: the package price the basket would earn, which is list for a service on its own.
    if (included === undefined) return { kind: "available", addOn, price: packageLineWith({ services: staying, forfeited }, addOn, currency), offer: offerOf(assessment, nextBillingOn) };
    return {
      kind: "included",
      addOn,
      price: bundledPrice(included, currency),
      endsOn: included.endRequestedAt === null ? null : nextBillingOn,
      nextBillingOn,
      joinsOn: included.billedFrom === null ? nextBillingOn : null,
      keepable: assessment?.kind === "keep",
      drop: included.endRequestedAt === null && !closing ? dropPreview({ staying: stayingLines, dropping: addOn, forfeited, currency }) : null,
    };
  });
  return { addOns, currency };
}

/** What asking to add an add-on came to, for the page. */
export type AddOnAddResult =
  /** A charge for the rest of the month to pay: the page sends the customer to pay it. */
  | { readonly kind: "pay"; readonly chargeId: string }
  /** It is on (kept, or added with nothing to take): the page redraws. */
  | { readonly kind: "done" }
  | { readonly kind: "refused"; readonly message: string };

const CANNOT_ADD_NOW = "We couldn't add that just now. Reload the page to see where it stands.";

/**
 * Add on the Add-ons page: a charge for the rest of the paid month, or keeping an add-on that is ending
 * (startAddOn in @brandbasket/shared/server/basket-change). The form carries only the add-on; whether it can be added, and
 * at what price, is worked out again on the server under the business's lock.
 */
export async function addBundledAddOnFor(customer: Pick<GrantedCustomer, "tenant">, addOn: MonthlyAddOnId, now: Date): Promise<AddOnAddResult> {
  const { businessId } = customer.tenant;
  const limit = await consumeRateLimit(getAppDb(), `add-on-checkout:business:${businessId}`, ADD_ON_CHECKOUT_RATE_LIMIT);
  if (!limit.allowed) return refused(TOO_MANY_ATTEMPTS);

  const started = await startAddOn(basketDeps(), { businessId, addOn, staffId: null, now });
  switch (started.kind) {
    case "pay":
      return { kind: "pay", chargeId: started.chargeId };
    case "added":
    case "kept":
      return { kind: "done" };
    case "refused":
    case "changed":
      return refused(CANNOT_ADD_NOW);
    default: {
      const unhandled: never = started;
      throw new Error(`Unhandled add-on start: ${JSON.stringify(unhandled)}`);
    }
  }
}

const NOT_IN_PLAN = "That add-on isn't part of your plan payment any more. Reload the page to see where it stands.";
const LAST_SERVICE = "That is your only service, so it can't be removed on its own. To stop paying, delete your account from Settings.";
const CANCEL_REQUESTED = "Your account is set to close, so a service can't be removed on its own.";
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
        message: `${addOnById(addOn).title} stays until your next payment date, then it stops.`,
      };
    case "not-in-plan":
      return refused(NOT_IN_PLAN);
    case "last-service":
      return refused(LAST_SERVICE);
    case "cancel-requested":
      return refused(CANCEL_REQUESTED);
    case "failed":
      return refused(CANNOT_REMOVE_NOW);
    default: {
      const unhandled: never = removal;
      throw new Error(`Unhandled removal outcome: ${String(unhandled)}`);
    }
  }
}
