import { addOnById, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { packageBasisPointsFor, packageLineWith, packageOfferNote, type PackageListLine } from "@brandbasket/shared/lib/billing/packages";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { CHECKOUT_PLAN_COPY } from "@/features/checkout/rules/plans";
import { pricesNote } from "@/features/checkout/rules/currency-words";
import { itemsFor, type AskedSetupKey, type ChecklistKey, type SavedAnswers } from "@/features/checklist/rules-items";
import { doneSetupKeys } from "@/features/checklist/setup-rules";
import { formatMoney } from "@/lib/format";

/*
 * What a Social & Ads or Local SEO + AEO page asks of the customer to start, and the Not bought screen of both services.
 * The asks are ported from apps/platform lib/setup-asks.ts: a question already answered, or not about delivery, is left
 * out. The questions themselves are answered in the setup checklist (features/checklist), which saves each on its own, so
 * the card links there instead of holding a second copy of the forms.
 */

export type SetupService = "social" | "search";

/** The id the card carries, so Home can open the service page scrolled to it. */
export const SETUP_CARD_ID = "setup";

/** Where a service's open questions are asked: the card at the top of its own page (ported: setupPageHref). */
export function setupPageHref(service: SetupService): string {
  return `/${service}#${SETUP_CARD_ID}`;
}

/** The line under each question (ported from lib/ready-items.ts). */
const HINTS: Readonly<Record<AskedSetupKey, string>> = {
  accounts: "Links to your pages, and whether you added us as an admin",
  budget: "And how far from you to show ads",
  areas: "Where you want to be found",
};

export interface SetupAsk {
  readonly key: ChecklistKey;
  readonly label: string;
  readonly hint: string;
  /** The checklist item that takes the answer. */
  readonly href: string;
}

/** The open questions a service blocks on, in the order the checklist lists them. */
export function setupAsks(service: SetupService, answers: SavedAnswers): readonly SetupAsk[] {
  const done = doneSetupKeys(answers);
  return itemsFor([service]).flatMap((item): SetupAsk[] =>
    item.setup === null || done.includes(item.setup) ? [] : [{ key: item.key, label: item.label, hint: HINTS[item.setup], href: `/checklist?item=${item.key}` }],
  );
}

/** "We need one thing from you". */
export function setupCardTitle(count: number): string {
  return count === 1 ? "We need one thing from you" : "We need a few things from you";
}

// ---- Not bought ----

// Social pitches Social Media Management; Local SEO + AEO is no longer sold, so its Not bought page offers what it was.
const ADD_ON_OF: Readonly<Record<SetupService, MonthlyAddOnId>> = { social: "social-media", search: "local-seo-aeo" };

const LEAD: Readonly<Record<SetupService, string>> = {
  social: "We plan and publish your posts each month on up to 4 platforms, with captions and images made with AI. You approve every post before it goes out.",
  search: "We improve how you show up on Google, Maps and in AI answers like ChatGPT. Every month you see what we did and how your searches moved.",
};

export interface NotBoughtView {
  readonly service: SetupService;
  readonly lead: string;
  readonly includes: readonly string[];
  /** "₹8,999 a month". */
  readonly price: string;
  /** The price before the package offer, only when there is one. */
  readonly listPrice: string | null;
  /** "Package offer, 10% off", only when there is one. */
  readonly offer: string | null;
  /** "Prices are in rupees and include GST." */
  readonly note: string;
  readonly addHref: string;
}

/**
 * The service as it would be priced once it joins the services already held: from the shared package rules, so the
 * discount here is the one checkout will take. Nothing on the screen works a price out.
 */
export function notBoughtView(input: { readonly service: SetupService; readonly held: readonly PackageListLine[]; readonly forfeited: boolean; readonly currency: MoneyCurrency }): NotBoughtView {
  const addOn = ADD_ON_OF[input.service];
  const line = packageLineWith(input.held, input.forfeited, addOn, input.currency);
  const offered = line.discountCents > 0;
  const basisPoints = packageBasisPointsFor({ services: [...input.held.map((held) => held.addOn).filter((id) => id !== addOn), addOn], forfeited: input.forfeited });
  return {
    service: input.service,
    lead: LEAD[input.service],
    includes: [...CHECKOUT_PLAN_COPY[addOn].gets, ...(addOnById(addOn).extra === undefined ? [] : ["Your ad spend is paid on top"])],
    price: `${formatMoney(line.netCents, input.currency)} a month`,
    listPrice: offered ? `${formatMoney(line.listCents, input.currency)} a month` : null,
    offer: offered ? packageOfferNote(basisPoints) : null,
    note: pricesNote(input.currency, input.currency === "INR"),
    addHref: `/billing?add=${input.service}`,
  };
}
