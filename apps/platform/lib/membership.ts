import { chargedAmountCents } from "@brandbasket/billing/tax";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleNetCents, type BundleLine } from "@brandbasket/shared/lib/billing/bundle";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import { BRAND, featureShownTo, type Brand } from "@/lib/brand";
import { featuresOf, MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/plan-features";

export { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/plan-features";

/*
 * The plan bought from the account a sign-up opens, Managed Website (docs/plans/11-platform-plans.md in the BrandBasket
 * workspace): where its page is, and where the payment pages send someone who is buying it. Plain constants and small functions, so the server modules, the pages and the payment
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

/** The plan's page with add-ons already ticked (`?addons=digital-growth,local-seo-aeo`): what the website's basket links to. */
export function membershipHrefWithAddOns(tier: MembershipTier, addOns: readonly MonthlyAddOnId[]): string {
  return addOns.length === 0 ? membershipPathFor(tier) : `${membershipPathFor(tier)}?addons=${addOns.join(",")}`;
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

/** The plan's name as the pages say it. */
export const MEMBERSHIP_NAMES: Readonly<Record<MembershipTier, string>> = { managed: "Managed Website" };

/**
 * What a plan includes, in the order the website's comparison table lists it (lib/plan-features.ts). Short lines: the
 * page shows them as a list, and the dashboard has no room for paragraphs.
 */
export function membershipBenefits(tier: MembershipTier, brand: Brand = BRAND): readonly string[] {
  return featuresOf(tier).filter((feature) => featureShownTo(feature.id, brand)).map((feature) => feature.label);
}

/** The heading the payment page sorts what the plan holds under. */
export type BenefitGroupName = "Website";

export interface BenefitGroup {
  readonly name: BenefitGroupName;
  readonly items: readonly string[];
}

/** What the plan includes, under its one heading. */
export function groupedBenefits(tier: MembershipTier, brand: Brand = BRAND): readonly BenefitGroup[] {
  const items = membershipBenefits(tier, brand);
  return items.length === 0 ? [] : [{ name: "Website", items }];
}

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
export function membershipPriceLine(plan: MembershipPricing): string {
  const { amount, terms } = membershipPriceParts(plan);
  return `${amount} ${terms}`;
}

/**
 * The same price in two parts, for a page that sets the figure large: "₹9,999" and "a month + 18% GST". With a discount
 * (a code, the package offer) the figure is the discounted price and `was` the list price.
 */
export function membershipPriceParts(
  plan: MembershipPricing,
  discountCents = 0,
): { readonly amount: string; readonly terms: string; readonly was: string | null } {
  const amount = formatMoney(plan.recurringAmountCents - discountCents, plan.currency);
  return {
    amount,
    terms: plan.taxRateBasisPoints === 0 ? "a month" : `a month + ${plan.taxRateBasisPoints / 100}% GST`,
    // The list price, shown struck through beside a discounted one.
    was: discountCents > 0 ? formatMoney(plan.recurringAmountCents, plan.currency) : null,
  };
}

/** What today's payment is made of, in the plan's minor units, for the order summary beside the Pay button. */
export interface OrderSummary {
  /** The plan's price before any code. */
  readonly listCents: number;
  /** What the applied code takes off the plan, or 0. */
  readonly discountCents: number;
  /** The plan's price less the code: the plan's own taxable line. */
  readonly planNetCents: number;
  /** The add-ons taken at this checkout, with any package discount, billed in this same payment. */
  readonly addOns: readonly BundleLine[];
  /** The taxable amount of the whole payment: the plan less the code, plus the add-ons. */
  readonly netCents: number;
  readonly gstCents: number;
  /** What the provider takes today: the same figure the Pay button shows and the checkout freezes. */
  readonly totalCents: number;
}

/**
 * The first payment broken into its parts: the plan, a code, the add-ons taken with it, the GST and the total. The total
 * comes from chargedAmountCents, the one place the charge is worked out, over the plan's price plus the add-ons' nets.
 */
export function orderSummary(
  plan: { readonly initialAmountCents: number; readonly taxRateBasisPoints: number },
  discountCents: number,
  addOns: readonly BundleLine[] = [],
): OrderSummary {
  const bundledCents = bundleNetCents(addOns);
  const netCents = plan.initialAmountCents + bundledCents - discountCents;
  const totalCents = chargedAmountCents(plan.initialAmountCents + bundledCents, discountCents, plan.taxRateBasisPoints);
  return {
    listCents: plan.initialAmountCents,
    discountCents,
    planNetCents: plan.initialAmountCents - discountCents,
    addOns,
    netCents,
    gstCents: totalCents - netCents,
    totalCents,
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

