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

/**
 * Whether the account is still in its first look (plan 28 section 3): it has paid and is current, the website is not
 * live and the setup has not been sent, and the kickoff call has not happened yet. An account that has not paid or
 * has lapsed never gets the first look. shortcut: a call counts as held once its end time has passed, so a missed call
 * also ends the first look; plan 30 replaces this with the team marking the call as held. A booked call with no end
 * time (a booking page that did not report one) keeps the first look open until the website is sent.
 */
export function inFirstLook(input: {
  readonly hasAccess: boolean;
  readonly websiteLive: boolean;
  readonly setupSent: boolean;
  readonly callEndsAtIso: string | null;
  readonly nowMs: number;
}): boolean {
  if (!input.hasAccess) return false;
  if (input.websiteLive || input.setupSent) return false;
  return input.callEndsAtIso === null || Date.parse(input.callEndsAtIso) > input.nowMs;
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
