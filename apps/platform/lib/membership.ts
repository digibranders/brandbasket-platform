import { formatMoney, type MoneyCurrency } from "@fynix/shared/lib/money";
import { BRAND, featureShownTo, type Brand } from "@/lib/brand";
import { featuresOf, MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/plan-features";

export { MEMBERSHIP_TIERS, type MembershipTier } from "@/lib/plan-features";

/*
 * The two paid plans bought from a free listing account, Care and Premium (docs/superpowers/specs/2026-09-30-single-
 * entry-premium-design.md, 2026-10-07-care-plan-design.md): where each one's page is, and where the payment pages send
 * someone who is buying it. Plain constants and small functions, so the server modules, the pages and the payment
 * callback all name the same addresses.
 */

/**
 * A plan's page: what it includes, what it costs, and the button that pays for it. A free listing account opens it
 * from its dashboard; one that chose the plan at sign-up is held on it until it pays or decides to carry on free.
 */
const MEMBERSHIP_PATHS: Readonly<Record<MembershipTier, string>> = { care: "/care", premium: "/premium" };

export function membershipPathFor(tier: MembershipTier): string {
  return MEMBERSHIP_PATHS[tier];
}

/** The Premium membership's page. */
export const MEMBERSHIP_PATH = MEMBERSHIP_PATHS.premium;

/** The Care plan's page. */
export const CARE_PATH = MEMBERSHIP_PATHS.care;

/** The tier a sign-up choice buys, or null for a choice that buys nothing (the free listing). */
export function membershipTierForChoice(choice: string | null): MembershipTier | null {
  return MEMBERSHIP_TIERS.find((tier) => tier === choice) ?? null;
}

/**
 * The Upgrade page: Free, Care and Premium side by side. A free listing account buys either plan from it; a Care client
 * moves up to Premium on the subscription it has (docs/superpowers/specs/2026-10-08-care-to-premium-upgrade-design.md).
 */
export const UPGRADE_PATH = "/upgrade";

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
export const MEMBERSHIP_NAMES: Readonly<Record<MembershipTier, string>> = { care: "Care plan", premium: "Premium membership" };

/**
 * What a plan includes, in the order the website's comparison table lists it (lib/plan-features.ts). Short lines: the
 * page shows them as a list, and the dashboard has no room for paragraphs.
 */
export function membershipBenefits(tier: MembershipTier, brand: Brand = BRAND): readonly string[] {
  return featuresOf(tier).filter((feature) => featureShownTo(feature.id, brand)).map((feature) => {
    const value = feature[tier];
    const label = feature.label;
    return typeof value === "string" ? `${label}: ${value}` : label;
  });
}

/** The three layers a plan stacks, which the payment page sorts what a plan holds into. */
export type BenefitGroupName = "Listing" | "Website" | "Social media";

export interface BenefitGroup {
  readonly name: BenefitGroupName;
  readonly items: readonly string[];
}

/** Which layer each row of the plan table belongs to, by its id. A row that is not here is the listing's. */
const FEATURE_GROUPS: Readonly<Record<string, BenefitGroupName>> = {
  website: "Website",
  "website-management": "Website",
  chatbot: "Website",
  hosting: "Website",
  appointments: "Website",
  "google-business": "Social media",
  facebook: "Social media",
  instagram: "Social media",
  "marketing-discount": "Social media",
};

const GROUP_ORDER: readonly BenefitGroupName[] = ["Listing", "Website", "Social media"];

/**
 * What a plan includes, sorted into the layers it stacks: the listing, the website, social media. Each group keeps the
 * table's order, and a group a plan has nothing in is left out (Care has no social media, for one).
 */
export function groupedBenefits(tier: MembershipTier, brand: Brand = BRAND): readonly BenefitGroup[] {
  const buckets = new Map<BenefitGroupName, string[]>(GROUP_ORDER.map((name) => [name, []]));
  for (const feature of featuresOf(tier).filter((item) => featureShownTo(item.id, brand))) {
    const value = feature[tier];
    const label = feature.label;
    const line = typeof value === "string" ? `${label}: ${value}` : label;
    buckets.get(FEATURE_GROUPS[feature.id] ?? "Listing")?.push(line);
  }
  return GROUP_ORDER.flatMap((name) => {
    const items = buckets.get(name) ?? [];
    return items.length === 0 ? [] : [{ name, items }];
  });
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

/** The same price in two parts, for a page that sets the figure large: "₹9,999" and "a month + 18% GST". */
export function membershipPriceParts(plan: MembershipPricing): { readonly amount: string; readonly terms: string } {
  const amount = formatMoney(plan.recurringAmountCents, plan.currency);
  return { amount, terms: plan.taxRateBasisPoints === 0 ? "a month" : `a month + ${plan.taxRateBasisPoints / 100}% GST` };
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

/**
 * Whether a plan's own page (/care, /premium) hands a free account over to the Upgrade page. Only an account opening it
 * from its dashboard: an owner held there on the plan they chose, a payment's return address, and an account whose
 * payment is still being settled each need the page's own words.
 */
export function plansMoveToUpgradePage(state: {
  readonly held: boolean;
  readonly notice: MembershipPaymentNotice | null;
  readonly waiting: boolean;
  readonly paymentUnderReview: boolean;
}): boolean {
  return !state.held && state.notice === null && !state.waiting && !state.paymentUnderReview;
}
