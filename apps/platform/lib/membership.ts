import { chargedAmountCents, gstInsideCents } from "@brandbasket/billing/tax";
import { MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines, bundleNetCents, type BundleLine } from "@brandbasket/shared/lib/billing/bundle";
import { adCreditCentsAtCheckout, packageBasisPointsFor } from "@brandbasket/shared/lib/billing/packages";
import { initialTermPhrase } from "@brandbasket/shared/lib/billing/terms";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/plan-features";

export { type MembershipTier } from "@/lib/plan-features";

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
 * The membership's price as people say it, with the GST named: "₹2,999 a month, GST included", or "$65 a month" for a
 * plan with none. It is also the figure the Pay button shows: every price includes GST.
 */
export function membershipPriceLine(plan: MembershipPricing, bundledAddOnNetCents = 0): string {
  const { amount, terms } = membershipPriceParts(plan, 0, bundledAddOnNetCents);
  return `${amount} ${terms}`;
}

/** The services a sign-up is for, as one phrase in catalogue order: "Managed Website, Social Media and Ads and Local SEO + AEO". */
export function servicesPhrase(services: readonly MonthlyAddOnId[]): string {
  const titles = bundleLines(services, "INR").map((line) => line.title);
  return titles.length < 2 ? (titles[0] ?? "") : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/** What the services cost a month for a new sign-up, GST included, at the package price (a new account has given up nothing). */
export function basketNetCents(services: readonly MonthlyAddOnId[], currency: MoneyCurrency): number {
  return bundleNetCents(bundleLines(services, currency));
}

/**
 * The same price in two parts, for a page that sets the figure large: "₹9,999" and "a month, GST included". With a discount
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
    terms: plan.taxRateBasisPoints === 0 ? "a month" : "a month, GST included",
    // The list price, shown struck through beside a discounted one.
    was: discountCents > 0 ? formatMoney(listCents, plan.currency) : null,
  };
}

/** The package offer on the basket, named for the summary: "Package offer, 20% off", and what it takes off. */
export interface PackageOfferRow {
  readonly label: string;
  readonly discountCents: number;
}

/** The ad credit the checkout would freeze, as the summary words it: "We add ₹5,000 a month to your ads". */
export interface AdCreditRow {
  readonly cents: number;
  readonly label: string;
}

/** What today's payment is made of, in the plan's minor units (GST included), for the order summary beside the Pay button. */
export interface OrderSummary {
  /** One line per service, each with its list price, its package discount and its net, in the catalogue's order. */
  readonly lines: readonly BundleLine[];
  /** The package offer taken off the lines, or null when there is none (one service, or the offer given up). */
  readonly offer: PackageOfferRow | null;
  /** What the applied code takes off the basket after the package offer, or 0. */
  readonly discountCents: number;
  /** What the whole payment is worth before the code's discount is taken off: the plan's own price and the lines' prices. */
  readonly netCents: number;
  /** The GST inside `totalCents`, for the line that says what the price includes. */
  readonly gstCents: number;
  /** What the provider takes today: the same figure the Pay button shows and the checkout freezes. */
  readonly totalCents: number;
  /** What each month costs once the code's discount has ended: `totalCents` when there is no code. */
  readonly totalWithoutCodeCents: number;
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
 * prices less the code. Checkout charges the plan's own price plus the lines, so the total adds `planInitialAmountCents`
 * too; on the services plan that is 0 and the lines are the whole charge. The code comes off once, after the package offer.
 * Throws on an empty basket.
 */
export function orderSummary(input: OrderSummaryInput, discountCents: number): OrderSummary {
  const { planInitialAmountCents, services, currency, taxRateBasisPoints, forfeited, hasEverPaid } = input;
  const lines = bundleLines(services, currency, forfeited);
  if (lines.length === 0) throw new RangeError("An order needs at least one service");
  const chargeableCents = planInitialAmountCents + lines.reduce((total, line) => total + line.netCents, 0);
  const totalCents = chargedAmountCents(chargeableCents, discountCents);
  const netCents = chargeableCents;
  const basisPoints = packageBasisPointsFor({ services, forfeited });
  const adCreditCents = adCreditCentsAtCheckout({ services, forfeited, hasEverPaid }, currency);
  return {
    lines,
    offer: basisPoints === 0 ? null : { label: `Package offer, ${basisPoints / 100}% off`, discountCents: lines.reduce((total, line) => total + line.offerCents, 0) },
    discountCents,
    netCents,
    gstCents: gstInsideCents(totalCents, taxRateBasisPoints),
    totalCents,
    totalWithoutCodeCents: chargedAmountCents(chargeableCents, 0),
    adCredit: adCreditCents === 0 ? null : { cents: adCreditCents, label: `We add ${formatMoney(adCreditCents, currency)} a month to your ads` },
  };
}

/** The plan facts the line under the Pay button is worded from. */
export interface RenewalTermsPlan {
  readonly currency: MoneyCurrency;
  readonly taxRateBasisPoints: number;
  readonly initialTermMonths: number;
}

/**
 * The line under the Pay button: what is taken each month after the first payment, and, for a code with a length, for how many
 * more months that lower amount runs before the price without the code. The first payment uses one of the code's months
 * (settleDiscountAfterPayment counts payments), so a 3-month code has 2 more after it.
 */
export function renewalTerms(
  parts: Pick<OrderSummary, "totalCents" | "totalWithoutCodeCents" | "discountCents" | "lines">,
  plan: RenewalTermsPlan,
  codeMonths: number | null,
): string {
  const money = (cents: number): string => formatMoney(cents, plan.currency);
  const gst = plan.taxRateBasisPoints > 0 ? " (GST included)" : "";
  const first = `Your first payment covers ${initialTermPhrase(plan.initialTermMonths)}, then`;
  const services = parts.lines.length === 1 ? "service" : "services";
  if (parts.discountCents === 0 || codeMonths === null) return `${first} ${money(parts.totalCents)}${gst} is taken each month for your ${services}.`;
  const monthsLeft = codeMonths - 1;
  if (monthsLeft < 1) return `${first} ${money(parts.totalWithoutCodeCents)}${gst} is taken each month for your ${services}.`;
  return `${first} ${money(parts.totalCents)}${gst} is taken each month for ${monthsLeft} more ${monthsLeft === 1 ? "month" : "months"}, and ${money(parts.totalWithoutCodeCents)} a month after that.`;
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

