import { chargedAmountCents } from "@brandbasket/billing/tax";
import { MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines, type BundleLine } from "@brandbasket/shared/lib/billing/bundle";
import { adCreditCentsAtCheckout, packageBasisPointsFor } from "@brandbasket/shared/lib/billing/packages";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/plan-features";

export { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/plan-features";

/*
 * The services bought from the account a sign-up opens (docs/plans/11-platform-plans.md in the BrandBasket
 * workspace): where the checkout page is, and where the payment pages send someone who is buying them. Plain constants and small functions, so the server modules, the pages and the payment
 * callback all name the same addresses.
 */

/**
 * A plan's page: what it includes, what it costs, and the button that pays for it. A free listing account opens it
 * from its dashboard; one that chose the plan at sign-up is held on it until it pays or decides to carry on free.
 */
const MEMBERSHIP_PATHS: Readonly<Record<MembershipTier, string>> = { managed: "/plan" };

export function membershipPathFor(tier: MembershipTier): string {
  return MEMBERSHIP_PATHS[tier];
}

/** The plan page's parameter naming its basket of services, comma separated. */
export const MEMBERSHIP_SERVICES_PARAM = "services";

/**
 * The plan's page opened on a basket of services (`?services=managed-website,digital-growth`): what the website's basket
 * links to. The basket is the whole subscription; with none named the page sells the website alone.
 */
export function membershipHrefWithServices(tier: MembershipTier, services: readonly MonthlyAddOnId[]): string {
  return services.length === 0 ? membershipPathFor(tier) : `${membershipPathFor(tier)}?${MEMBERSHIP_SERVICES_PARAM}=${services.join(",")}`;
}

/**
 * The basket after a service is ticked or taken out, in the catalogue's order. The last service stays: a subscription is
 * never empty, so taking it out changes nothing.
 */
export function servicesAfterToggle(selected: readonly MonthlyAddOnId[], service: MonthlyAddOnId): readonly MonthlyAddOnId[] {
  const next = MONTHLY_ADD_ON_IDS.filter((id) => (id === service ? !selected.includes(id) : selected.includes(id)));
  return next.length === 0 ? selected : next;
}

/** The plan's page. */
export const MEMBERSHIP_PATH = MEMBERSHIP_PATHS.managed;

/** The tier a sign-up choice buys, or null for a choice that buys nothing (the free listing). */
export function membershipTierForChoice(choice: string | null): MembershipTier | null {
  return MEMBERSHIP_TIERS.find((tier) => tier === choice) ?? null;
}

/** Where a business that has just become a member lands: the client dashboard's Home, with setup as its next step. */
export const MEMBER_HOME = "/";

/** What the membership page is told about a payment it was sent back from. Codes, never messages. */
export type MembershipPaymentNotice = "received" | "failed";

const PAYMENT_PARAM = "payment";

/** The provider has the money and we are waiting to hear: the plan's page says so and keeps checking. */
export function membershipReceivedHref(tier: MembershipTier): string {
  return `${membershipPathFor(tier)}?${PAYMENT_PARAM}=received`;
}

/** The payment did not go through, or could not be confirmed: nothing was recorded. */
export function membershipFailedHref(tier: MembershipTier): string {
  return `${membershipPathFor(tier)}?${PAYMENT_PARAM}=failed`;
}

/** The notice the page's address names, or null. */
export function readMembershipPaymentNotice(params: Readonly<Record<string, string | string[] | undefined>>): MembershipPaymentNotice | null {
  const value = params[PAYMENT_PARAM];
  return value === "received" || value === "failed" ? value : null;
}

/**
 * The mark the Razorpay pay page puts on its callback address when the checkout is for a membership, naming the plan,
 * so the callback, which knows nothing about who is paying, sends the browser back to that plan's page.
 */
export const MEMBERSHIP_CALLBACK_PARAM = "for";

/** The plan a callback address names, or null when it names none (a website client's own payment). */
export function readMembershipCallbackTier(value: string | null): MembershipTier | null {
  return MEMBERSHIP_TIERS.find((tier) => tier === value) ?? null;
}

/** The checkout page's name as the pages say it. */
export const MEMBERSHIP_NAMES: Readonly<Record<MembershipTier, string>> = { managed: "Checkout" };

/** The part of a plan the price line is made from. */
export interface MembershipPricing {
  readonly recurringAmountCents: number;
  readonly currency: MoneyCurrency;
  readonly taxRateBasisPoints: number;
}

/**
 * The membership's price as people say it, before tax, with the tax named: "₹2,999 a month + 18% GST", or
 * "$69 a month" for a plan with none. The figure the Pay button shows is the charged one, tax included.
 */
export function membershipPriceLine(plan: MembershipPricing, bundledAddOnNetCents = 0): string {
  const { amount, terms } = membershipPriceParts(plan, 0, bundledAddOnNetCents);
  return `${amount} ${terms}`;
}

/**
 * The same price in two parts, for a page that sets the figure large: "₹9,999" and "a month + 18% GST". With a discount
 * (a code, the package offer) the figure is the discounted price and `was` the list price.
 */
export function membershipPriceParts(
  plan: MembershipPricing,
  discountCents = 0,
  bundledAddOnNetCents = 0,
): { readonly amount: string; readonly terms: string; readonly was: string | null } {
  // The plan row costs nothing: the services on the subscription's lines are the price.
  const listCents = plan.recurringAmountCents + bundledAddOnNetCents;
  const amount = formatMoney(listCents - discountCents, plan.currency);
  return {
    amount,
    terms: plan.taxRateBasisPoints === 0 ? "a month" : `a month + ${plan.taxRateBasisPoints / 100}% GST`,
    // The list price, shown struck through beside a discounted one.
    was: discountCents > 0 ? formatMoney(listCents, plan.currency) : null,
  };
}

/** The package offer on the basket, named for the summary: "Package offer, 30% off", and what it takes off before GST. */
export interface PackageOfferRow {
  readonly label: string;
  readonly discountCents: number;
}

/** The ad credit the checkout would freeze, as the summary words it: "We add ₹5,000 a month to your ads". */
export interface AdCreditRow {
  readonly cents: number;
  readonly label: string;
}

/** What today's payment is made of, in the plan's minor units, for the order summary beside the Pay button. */
export interface OrderSummary {
  /** One line per service, each with its list price, its package discount and its net, in the catalogue's order. */
  readonly lines: readonly BundleLine[];
  /** The package offer taken off the lines, or null when there is none (one service, or the offer given up). */
  readonly offer: PackageOfferRow | null;
  /** What the applied code takes off the one service, or 0. A package never has one. */
  readonly discountCents: number;
  /** The taxable amount of the whole payment: the plan's own price and the lines' nets, less the code. */
  readonly netCents: number;
  readonly gstCents: number;
  /** What the provider takes today: the same figure the Pay button shows and the checkout freezes. */
  readonly totalCents: number;
  /** The monthly ad credit this checkout would freeze, or null when it freezes none. */
  readonly adCredit: AdCreditRow | null;
}

/** The basket and the business facts the checkout prices it with: the same inputs, so the page quotes what Razorpay will charge. */
export interface OrderSummaryInput {
  /** The plan's own first-payment price (plans.initial_amount_cents): 0 on the services plan, added to the lines when it is not. */
  readonly planInitialAmountCents: number;
  readonly services: readonly MonthlyAddOnId[];
  readonly currency: MoneyCurrency;
  readonly taxRateBasisPoints: number;
  /** The business has given the package offer up for good (businesses.package_offer_forfeited_at). */
  readonly forfeited: boolean;
  /** The business has paid before: it earns no ad credit. */
  readonly hasEverPaid: boolean;
}

/**
 * The first payment broken into its parts, worked out with the functions checkout uses: the lines and the package offer
 * from bundleLines (packageLines), the ad credit from adCreditCentsAtCheckout and the total from chargedAmountCents over the lines'
 * nets less the code. Checkout charges the plan's own price plus the lines, so the total adds `planInitialAmountCents`
 * too; on the services plan that is 0 and the lines are the whole charge. Throws on an empty basket and on a code with a
 * package, which checkout refuses too.
 */
export function orderSummary(input: OrderSummaryInput, discountCents: number): OrderSummary {
  const { planInitialAmountCents, services, currency, taxRateBasisPoints, forfeited, hasEverPaid } = input;
  const lines = bundleLines(services, currency, forfeited);
  if (lines.length === 0) throw new RangeError("An order needs at least one service");
  if (discountCents > 0 && lines.length > 1) throw new RangeError("A code applies to one service, never to a package");
  const chargeableCents = planInitialAmountCents + lines.reduce((total, line) => total + line.netCents, 0);
  const totalCents = chargedAmountCents(chargeableCents, discountCents, taxRateBasisPoints);
  const netCents = chargeableCents - discountCents;
  const basisPoints = packageBasisPointsFor({ services, forfeited });
  const adCreditCents = adCreditCentsAtCheckout({ services, forfeited, hasEverPaid }, currency);
  return {
    lines,
    offer: basisPoints === 0 ? null : { label: `Package offer, ${basisPoints / 100}% off`, discountCents: lines.reduce((total, line) => total + line.offerCents, 0) },
    discountCents,
    netCents,
    gstCents: totalCents - netCents,
    totalCents,
    adCredit: adCreditCents === 0 ? null : { cents: adCreditCents, label: `We add ${formatMoney(adCreditCents, currency)} a month to your ads` },
  };
}

/** The Pay form's state: idle, or the reason the payment could not be started. */
export type MembershipFormState = { readonly status: "idle" } | { readonly status: "error"; readonly message: string };

export const initialMembershipFormState: MembershipFormState = { status: "idle" };

/** What the membership page needs to know about the business's newest subscription. */
export interface MembershipCheckout {
  readonly id: string;
  readonly status: string;
  readonly activatedAt: Date | null;
}

/**
 * The checkout a free listing account's payment may still be settling on, or null. Until the first payment is
 * recorded the subscription has never been activated (`activatedAt` is null); it is `incomplete`, or already `active`
 * when the provider's word that the mandate was authorised arrived before its word that the charge went through.
 * Either way the account must not be offered Pay again while it is told a payment is on its way.
 */
export function unsettledCheckout<T extends MembershipCheckout>(subscription: T | null): T | null {
  if (subscription === null || subscription.activatedAt !== null) return null;
  return subscription.status === "incomplete" || subscription.status === "active" ? subscription : null;
}

/** Whether the plan's payment is still being settled: sent back from the provider with a checkout open, or already authorised. */
export function isWaitingOnPayment<T extends MembershipCheckout>(subscription: T | null, notice: MembershipPaymentNotice | null): boolean {
  const checkout = unsettledCheckout(subscription);
  return checkout !== null && (notice === "received" || checkout.status === "active");
}

