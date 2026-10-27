import { MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";

/** The three services, by the names the dashboard uses for them. */
export type ServiceKey = "website" | "social" | "search";

const SERVICE_OF: Readonly<Record<MonthlyAddOnId, ServiceKey>> = {
  "managed-website": "website",
  "digital-growth": "social",
  "local-seo-aeo": "search",
};

export const SERVICE_NAMES: Readonly<Record<ServiceKey, string>> = { website: "Website", social: "Social & Ads", search: "Search" };

const SERVICE_WORDS: Readonly<Record<ServiceKey, string>> = { website: "website", social: "social", search: "search" };

/** A bundled service line as stored (bundled_add_ons). */
export interface ServiceLine {
  readonly addOn: string;
  readonly status: string;
  readonly endRequestedAt: Date | null;
}

/** The services the plan keeps, in catalogue order: active lines that are not on their way out (a service asked to be dropped is still billed until its end, but the kickoff call does not plan it). */
export function servicesBought(lines: readonly ServiceLine[]): readonly ServiceKey[] {
  const paid = new Set(lines.filter((line) => line.status === "active" && line.endRequestedAt === null).map((line) => line.addOn));
  return MONTHLY_ADD_ON_IDS.filter((id) => paid.has(id)).map((id) => SERVICE_OF[id]);
}

/** How long after a call's end time the first look stays open when staff have not marked it held. */
const HELD_GRACE_MS = 2 * 24 * 3_600_000;

export interface FirstLookInput {
  readonly hasAccess: boolean;
  readonly websiteLive: boolean;
  readonly setupSent: boolean;
  readonly callHeld: boolean;
  readonly callEndsAtIso: string | null;
  readonly nowMs: number;
}

/**
 * The facts inFirstLook needs, read from what the shell and the home page both load (billing, the live website, the
 * project, the call state). One place, so the rail and the page cannot disagree about whether the first look is over.
 */
export function firstLookInput(facts: {
  readonly hasAccess: boolean;
  readonly liveWebsite: unknown;
  readonly project: { readonly onboardingSubmittedAt: Date | null } | null;
  readonly callState: { readonly booking: { readonly heldAtIso: string | null; readonly endsAtIso: string | null } | null; readonly readAtMs: number };
}): FirstLookInput {
  return {
    hasAccess: facts.hasAccess,
    websiteLive: facts.liveWebsite !== null,
    setupSent: facts.project?.onboardingSubmittedAt != null,
    callHeld: facts.callState.booking?.heldAtIso != null,
    callEndsAtIso: facts.callState.booking?.endsAtIso ?? null,
    nowMs: facts.callState.readAtMs,
  };
}

/**
 * Whether the account is still in its first look (plan 28 section 3): it has paid, the website has not been sent or
 * launched, and the kickoff call has not been held. Staff mark a call held in the console. If nobody does, the first look
 * ends two days after the call's end time. A booked call with no end time (a booking page that did not report one) keeps
 * the first look open until staff mark it or the website is sent. An account that has not paid, or has lapsed, never gets it.
 */
export function inFirstLook(input: FirstLookInput): boolean {
  if (!input.hasAccess) return false;
  if (input.websiteLive || input.setupSent || input.callHeld) return false;
  return input.callEndsAtIso === null || Date.parse(input.callEndsAtIso) + HELD_GRACE_MS > input.nowMs;
}

/** "A", "A and B", "A, B and C". */
export function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1] ?? ""}`;
}

/** "website, social and search": what the kickoff call plans, in the call card's sentence. */
export function serviceWords(services: readonly ServiceKey[]): string {
  return andList(services.map((service) => SERVICE_WORDS[service]));
}
