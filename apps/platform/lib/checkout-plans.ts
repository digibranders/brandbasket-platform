import { PLAN_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { PACKAGE_OFFERS, percentOf } from "@brandbasket/shared/lib/billing/packages";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { pricesNote } from "@/lib/currency-words";

/*
 * The words on the checkout page that belong to a plan, as plain data (docs/design/checkout-ledger.html in the BrandBasket
 * workspace). Prices and percentages are never typed here: the page works them out from the pricing module and passes them in.
 * Browser-safe and pure.
 */

export interface CheckoutPlanCopy {
  /** The line under the plan's name on its chip. `monthly` is the plan's monthly price, already formatted. */
  readonly blurb: (monthly: string) => string;
  /** What the plan includes, as "What you get" lists it. */
  readonly gets: readonly string[];
}

export const CHECKOUT_PLAN_COPY: Readonly<Record<MonthlyAddOnId, CheckoutPlanCopy>> = {
  "managed-website": {
    blurb: (monthly) => `Website free to build, ${monthly} a month to keep it running`,
    gets: ["A website of up to 10 pages, mobile-friendly", "Enquiry forms and click-to-call", "A local SEO foundation", "The OyeChats professional chatbot"],
  },
  // From the website's plan columns (brandbasket-website content/pricing.ts and content/basket.ts).
  "social-media": {
    blurb: () => "AI posts, captions and scheduling on up to 4 platforms",
    gets: ["AI content and caption generation", "AI image and creative generation", "Automated posting and scheduling", "Up to 4 platforms managed"],
  },
  "paid-ads": {
    blurb: () => "Meta ads with AI creatives, set up and optimised",
    gets: ["Meta ads on Facebook and Instagram", "AI ad copy and creative generation", "Campaign setup and optimisation", "Budget and bidding management"],
  },
  "expert-monitoring": {
    blurb: () => "Free with all three plans",
    gets: ["Experts watching your website, social media and ads", "Fixes for what slips", "Help to grow"],
  },
};

export interface CheckoutStep {
  readonly title: string;
  readonly note: string;
}

const PAY_STEP: CheckoutStep = { title: "You pay", note: "Secure payment" };
const KICKOFF_STEP: CheckoutStep = { title: "Book your kickoff call", note: "30 minutes, video" };

/** "What happens next" for a basket with the Managed Website: the build, then the launch. */
const WEBSITE_STEPS: readonly CheckoutStep[] = [
  PAY_STEP,
  KICKOFF_STEP,
  { title: "We start building", note: "Within 48 hours of the call" },
  { title: "Your website is live", note: "Within 7 working days of the call" },
];

/** "What happens next" for a basket without it (Social and/or Ads): there is no website to build. */
const NO_WEBSITE_STEPS: readonly CheckoutStep[] = [
  PAY_STEP,
  KICKOFF_STEP,
  { title: "We start on your plan", note: "Within 48 hours of the call" },
];

/** "What happens next", in order, for the plans in the basket. */
export function checkoutSteps(services: readonly MonthlyAddOnId[]): readonly CheckoutStep[] {
  return services.includes("managed-website") ? WEBSITE_STEPS : NO_WEBSITE_STEPS;
}

/** What the package offers are worth for two and for three plans, as whole-number percentages: "10" and "20". */
function offerPercent(planCount: number): string {
  const offer = PACKAGE_OFFERS.find((candidate) => candidate.services.length === planCount);
  if (offer === undefined) throw new Error(`No package offer for ${planCount} plans`);
  return percentOf(offer.basisPoints);
}

/** The line under the page title: what to do, then what the prices are in (and whether they carry GST). */
export function checkoutLead(currency: MoneyCurrency, taxRateBasisPoints: number): string {
  return `Choose the services you want. ${pricesNote(currency, taxRateBasisPoints > 0)}`;
}

/** The page's own words. */
export const CHECKOUT_COPY = {
  title: "Your plan",
  packageNote: `Two plans are ${offerPercent(2)}% off, all three are ${offerPercent(3)}% off.`,
  allThree: `All three plans: ${offerPercent(PLAN_ADD_ON_IDS.length)}% off every month.`,
  getHeading: "What you get",
  nextHeading: "What happens next",
  websiteBadge: "Website free",
} as const;
