import "server-only";
import { businessHasHadService, findBillingState, findOpenPaymentLinkForBusiness, isPackageOfferForfeited, type BillingInterval, type Plan } from "@brandbasket/db";
import { readBundleSelection } from "@brandbasket/shared/lib/billing/bundle";
import { setupFeeFor } from "@brandbasket/shared/lib/billing/setup-fee";
import { isWebsiteKind, type WebsiteKind } from "@brandbasket/shared/lib/billing/website-kind";
import type { BuildDeal } from "../rules/build-fee";
import type { BillingDetailsView } from "../rules/billing-details-view";
import type { LedgerFirstMonth } from "../rules/ledger";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { TRIAL_ADD_ON_IDS } from "@brandbasket/shared/lib/billing/trial";
import type { MembershipTier } from "../rules/membership";
import { loadReactivationBasket } from "@brandbasket/shared/server/reactivation-basket";
import { getBillingProvider } from "./billing";
import { loadBillingDetailsView } from "./billing-details";
import type { GrantedCustomer } from "./customer-access";
import { getStaffDb } from "./db";
import { getMembershipPlan } from "./membership";
import { codeBasisFor, findLapsedAppliedCode, resolveAppliedDiscount, type AppliedDiscount } from "./referrals";

/** Everything the way to pay for one plan needs, read once for the page that shows it. */
export interface MembershipCheckoutView {
  /** The plan on sale for this tier, or null when none is. */
  readonly plan: Plan | null;
  /**
   * The services this checkout is for, the whole subscription: what the page's address names, or the basket a business that
   * has paid before lapsed with (loadReactivationBasket), the same rule the checkout applies.
   */
  readonly services: readonly MonthlyAddOnId[];
  /** The code in force against the basket's package net, re-validated now, or null. */
  readonly discount: AppliedDiscount | null;
  /** A code that was applied and no longer works against the basket, so the page can say why the price is full. */
  readonly lapsedCode: string | null;
  /** The business has given the package offer up for good: every line is at list, with no ad credit. */
  readonly forfeited: boolean;
  /** The business has paid before: it earns no ad credit. */
  readonly hasEverPaid: boolean;
  /** The invoice details form's state: an account buying its membership cannot open Billing, so the form is offered here. */
  readonly billingDetails: BillingDetailsView | null;
  /**
   * The services offered: `available` to show the package card before the first payment, none after. They are all lines
   * of the one subscription (lib/billing/packages.ts); the plan row itself costs nothing.
   */
  readonly offer: MembershipOffer;
  /** What the first-month offer (plan 63) is judged on, read as the checkout reads it; null for a reactivation, which never gets it. */
  readonly firstMonth: LedgerFirstMonth | null;
  /** How often the basket is paid: the address's, or the one a staff payment link names (plan 65). */
  readonly interval: BillingInterval;
  /** The kind of website, the build fee owed with it (null when none) and the staff note on its discount. */
  readonly deal: BuildDeal;
  /** A staff payment link decides the services, interval, kind and fee: the page offers no way to change them. */
  readonly locked: boolean;
}

/** What a checkout may add to the basket its address names (plan 65): the kind of website, and whether the list build fee is owed when no payment link names one. */
export interface MembershipDealOptions {
  readonly chosenKind: WebsiteKind;
  readonly chargeListFee: boolean;
}

export type MembershipOffer =
  | { readonly kind: "none" }
  | { readonly kind: "available" };

/**
 * One plan's checkout for a basket of services, as the customer would pay for it right now. This page's own plan, not
 * the account's: a free account may buy either from the same place. Re-validated on every call, so a code retired since
 * it was applied quietly stops discounting rather than showing a price the checkout would refuse to honour.
 */
export async function loadMembershipCheckout(
  customer: Pick<GrantedCustomer, "tenant" | "billing">,
  tier: MembershipTier,
  requested: readonly MonthlyAddOnId[],
  now: Date,
  requestedInterval: BillingInterval = "month",
  options: MembershipDealOptions = { chosenKind: "b2b", chargeListFee: false },
): Promise<MembershipCheckoutView> {
  const { businessId } = customer.tenant;
  const staffDb = getStaffDb();
  // The plan the business is billed in, as startMembershipCheckoutFor will charge it; rupees when it has no billing state yet.
  const state = await findBillingState(staffDb, businessId);
  const plan = await getMembershipPlan(tier, state?.currency ?? "INR");
  const hasEverPaid = state?.hasEverPaid ?? true;
  const reactivation = hasEverPaid ? await loadReactivationBasket(staffDb, businessId) : null;
  // A staff payment link bound to the business decides the basket, interval, kind and fee, as the checkout will read it (plan 65).
  const bound = hasEverPaid ? null : await findOpenPaymentLinkForBusiness(staffDb, businessId, now);
  const link = bound !== null && plan !== null && bound.currency === plan.currency ? bound : null;
  const services = reactivation?.services ?? (link === null ? requested : readBundleSelection(link.services));
  const interval: BillingInterval = link === null ? requestedInterval : link.billingInterval === "year" ? "year" : "month";
  const kind: WebsiteKind = link?.websiteKind != null && isWebsiteKind(link.websiteKind) ? link.websiteKind : options.chosenKind;
  // A reactivation takes no code, so none is looked for against its basket.
  const basis = plan === null || hasEverPaid ? null : codeBasisFor(services, plan.currency, interval, kind);
  const [discount, lapsedCode, forfeited, billingDetails] = await Promise.all([
    basis === null ? null : resolveAppliedDiscount(businessId, basis, now),
    basis === null ? null : findLapsedAppliedCode(businessId, basis, now),
    reactivation?.forfeited ?? isPackageOfferForfeited(staffDb, businessId),
    loadBillingDetailsView(customer),
  ]);
  const offer: MembershipOffer = !hasEverPaid && plan !== null ? { kind: "available" } : { kind: "none" };
  // A code that still works is not lapsed, whatever the second read says.
  // The offer is for a first purchase: a business coming back from a lapse pays its first month in full, as the checkout charges it.
  // The website too: a build fee is owed on a first purchase of it only (D15).
  const hadService: LedgerFirstMonth["hadService"] | null =
    reactivation === null
      ? Object.fromEntries(await Promise.all([...TRIAL_ADD_ON_IDS, "managed-website" as const].map(async (id) => [id, await businessHasHadService(staffDb, businessId, id)] as const)))
      : null;
  const firstMonth: LedgerFirstMonth | null = hadService === null ? null : { provider: getBillingProvider().name, hadService };
  const owesFee =
    plan !== null && reactivation === null && services.includes("managed-website") && hadService?.["managed-website"] === false && (link !== null || options.chargeListFee);
  const deal: BuildDeal = {
    kind,
    fee: owesFee ? setupFeeFor(kind, plan.currency, link?.setupFeeDiscountCents ?? 0) : null,
    note: owesFee ? (link?.setupFeeNote ?? null) : null,
  };
  return { plan, services, discount, lapsedCode: discount === null ? lapsedCode : null, forfeited, hasEverPaid, billingDetails, offer, firstMonth, interval, deal, locked: link !== null };
}
