import type { ReportSourceRow, StaffRole } from "@brandbasket/db";
import type { PillTone } from "@/components/console/status-pill";

/*
 * The Google card on a client's Website tab (plan 62, step 5), as plain data: what each half says, which state the card is in
 * and which buttons make sense. Nothing here reads a database or a token; the card only ever shows what the two
 * report_sources rows already say, so a claim that nothing checks (such as "the tag was seen on the live page") is not made.
 */

/** A Search Console site that is still unverified after this many days is "Needs a look". */
export const GOOGLE_STUCK_DAYS = 3;
const DAY_MS = 86_400_000;

export type GoogleSourceRow = ReportSourceRow;

export type GoogleCardState = "connected" | "setting-up" | "needs-look" | "free-address" | "not-added" | "detached";

export const GOOGLE_CARD_TITLES: Readonly<Record<GoogleCardState, string>> = {
  connected: "Both connected",
  "setting-up": "Setting up",
  "needs-look": "Needs a look",
  "free-address": "Not added",
  "not-added": "Not added",
  detached: "Detached",
};

/** Detaching and provisioning change what the go live job does for a client's live site, so support staff see the card but do not act on it. */
export function canManageGoogle(role: StaffRole): boolean {
  return role !== "support";
}

/** Whole days between two moments, never negative. */
export function wholeDaysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS));
}

/**
 * Whether Search Console is stuck: still unverified more than three days after the row was made. The row's own age is the
 * only clock the go live job does not keep moving (it rewrites `provisioned_at` and `updated_at` each time it asks again).
 */
export function isGoogleStuck(gsc: GoogleSourceRow | null, now: Date): boolean {
  if (gsc === null || gsc.status !== "awaiting_setup" || gsc.verifiedAt !== null) return false;
  return now.getTime() - gsc.createdAt.getTime() > GOOGLE_STUCK_DAYS * DAY_MS;
}

export function googleCardState(input: { readonly gsc: GoogleSourceRow | null; readonly ga4: GoogleSourceRow | null; readonly freeAddress: boolean; readonly now: Date }): GoogleCardState {
  const { gsc, ga4, freeAddress, now } = input;
  if (gsc === null && ga4 === null) return freeAddress ? "free-address" : "not-added";
  if (gsc?.status === "removed" || ga4?.status === "removed") return "detached";
  if (gsc?.status === "access_lost" || ga4?.status === "access_lost" || isGoogleStuck(gsc, now)) return "needs-look";
  return gsc?.status === "connected" && ga4?.status === "connected" ? "connected" : "setting-up";
}

export interface GooglePill {
  readonly tone: PillTone;
  readonly label: string;
}

export function searchConsolePill(gsc: GoogleSourceRow | null, now: Date): GooglePill {
  if (gsc === null) return { tone: "todo", label: "Not added" };
  switch (gsc.status) {
    case "connected":
      return { tone: "done", label: "Connected" };
    case "access_lost":
      return { tone: "problem", label: "Access lost" };
    case "removed":
      return { tone: "todo", label: "Detached" };
    case "pending":
      return { tone: "wait", label: "Waiting for first data" };
    case "awaiting_setup":
      return isGoogleStuck(gsc, now) ? { tone: "problem", label: "Not verified" } : { tone: "wait", label: "Waiting for the tag" };
  }
}

export function analyticsPill(ga4: GoogleSourceRow | null): GooglePill {
  if (ga4 === null) return { tone: "todo", label: "Not added" };
  switch (ga4.status) {
    case "connected":
      return { tone: "done", label: "Connected" };
    case "access_lost":
      return { tone: "problem", label: "Access lost" };
    case "removed":
      return { tone: "todo", label: "Detached" };
    case "pending":
      return { tone: "wait", label: "Waiting for first data" };
    case "awaiting_setup":
      return { tone: "wait", label: "Waiting for the tag" };
  }
}

export interface GoogleFact {
  readonly label: string;
  readonly value: string;
  /** A date shown beside the value, in the reader's own time zone. */
  readonly at?: Date;
  readonly note?: string;
  /** The value is an id, set in the figure font. */
  readonly figure?: boolean;
}

/** The Analytics tag is added to client sites only while the platform's switch is on; nothing here checks the live page. */
export function analyticsTagFact(enabled: boolean): GoogleFact {
  return enabled
    ? { label: "Tag on the live site", value: "On", note: "Not checked on the live page" }
    : { label: "Tag on the live site", value: "Switched off", note: "It goes on client sites when the switch is turned on" };
}

const LAG_NOTE = "Search Console runs about 3 days behind";

function lastDay(day: string | null, note?: string): GoogleFact {
  return day === null ? { label: "Last data day", value: "None yet" } : { label: "Last data day", value: day, ...(note === undefined ? {} : { note }) };
}

export function searchConsoleFacts(gsc: GoogleSourceRow | null, latestDay: string | null, now: Date): readonly GoogleFact[] {
  if (gsc === null) return [{ label: "Site", value: "Not added yet" }];
  const verified: GoogleFact =
    gsc.verifiedAt !== null
      ? { label: "Verified", value: "Yes", note: "Meta tag", at: gsc.verifiedAt }
      : { label: "Verified", value: isGoogleStuck(gsc, now) ? "No" : "Not yet", ...(gsc.detail === null ? {} : { note: gsc.detail }) };
  const owner: GoogleFact = gsc.secondOwnerOk
    ? { label: "Second owner", value: "Added", note: "Google lists both owners" }
    : gsc.verifiedAt === null
      ? { label: "Second owner", value: "After verifying" }
      : { label: "Second owner", value: "Not added yet", ...(gsc.detail === null ? {} : { note: gsc.detail }) };
  return [{ label: "Site", value: gsc.externalId, figure: true }, verified, owner, lastDay(latestDay, latestDay === null ? undefined : LAG_NOTE)];
}

export function analyticsFacts(ga4: GoogleSourceRow | null, latestDay: string | null, tagEnabled: boolean): readonly GoogleFact[] {
  if (ga4 === null) return [{ label: "Property", value: "Not added yet" }];
  return [
    { label: "Property", value: ga4.externalId, figure: true },
    { label: "Measurement ID", value: ga4.measurementId ?? "Not made yet", figure: ga4.measurementId !== null },
    analyticsTagFact(tagEnabled),
    lastDay(latestDay),
  ];
}

/** "https://omsweets.in/" gives "omsweets.in"; a Domain property "sc-domain:omsweets.in" too; anything else is null. */
export function hostOfSite(site: string): string | null {
  if (site.startsWith("sc-domain:")) return site.slice("sc-domain:".length) || null;
  try {
    return new URL(site).hostname || null;
  } catch {
    return null;
  }
}

export function searchConsoleLink(site: string): string {
  return `https://search.google.com/search-console?resource_id=${encodeURIComponent(site)}`;
}

/** The property's home in Analytics, or null when the stored id is not a property number. */
export function analyticsLink(propertyId: string): string | null {
  return /^\d{5,15}$/.test(propertyId) ? `https://analytics.google.com/analytics/web/#/p${propertyId}/reports/intelligenthome` : null;
}

export interface GoogleCallout {
  readonly tone: "plain" | "bad";
  readonly text: string;
  /** The last note the go live job left, shown in the figure font after the text. */
  readonly detail?: string;
}

/** The one sentence under the card's title, or null when there is nothing to say. Only facts the rows or the address give. */
export function googleCallout(input: { readonly state: GoogleCardState; readonly gsc: GoogleSourceRow | null; readonly ga4: GoogleSourceRow | null; readonly hostname: string | null; readonly now: Date }): GoogleCallout | null {
  const { state, gsc, ga4, hostname, now } = input;
  const site = (gsc === null ? null : hostOfSite(gsc.externalId)) ?? hostname ?? "the site";
  switch (state) {
    case "connected":
      return null;
    case "free-address":
      return { tone: "plain", text: `Not added: free addresses are never indexed.${hostname === null ? "" : ` This site is on ${hostname}.`} Google is added when the client moves to their own domain.` };
    case "not-added":
      return { tone: "plain", text: "Nothing added yet. Google is added once the site is live on its own domain." };
    case "detached":
      return { tone: "plain", text: "Detached by staff. The go-live job leaves this site alone and the history is kept. Provision now puts it back in the queue." };
    case "needs-look": {
      const lost = gsc?.status === "access_lost" ? "Search Console" : ga4?.status === "access_lost" ? "Analytics" : null;
      if (lost !== null) {
        const detail = (lost === "Search Console" ? gsc : ga4)?.detail ?? undefined;
        return { tone: "bad", text: `Google no longer allows access to this client's ${lost}.`, ...(detail === undefined ? {} : { detail }) };
      }
      const days = gsc === null ? GOOGLE_STUCK_DAYS : wholeDaysBetween(gsc.createdAt, now);
      return {
        tone: "bad",
        text: `Google still cannot see the tag on ${site}, ${days} days after the site was added. Check that the live page shows the tag, then retry.`,
        ...(gsc?.detail == null ? {} : { detail: gsc.detail }),
      };
    }
    case "setting-up":
      return gsc !== null && gsc.status === "awaiting_setup" && gsc.verifiedAt === null
        ? { tone: "plain", text: `Waiting for Google to see the verification tag on ${site}. We look again every 15 minutes and flag it here after ${GOOGLE_STUCK_DAYS} days.` }
        : null;
  }
}

export interface GoogleButtons {
  readonly openSearchConsole: string | null;
  readonly openAnalytics: string | null;
  readonly openLiveSite: string | null;
  readonly retry: boolean;
  readonly detach: boolean;
  readonly provisionNow: boolean;
}

/** Only the buttons that make sense for this state. Links are open to every role; the three actions need a role that may manage Google. */
export function googleButtons(input: { readonly state: GoogleCardState; readonly gsc: GoogleSourceRow | null; readonly ga4: GoogleSourceRow | null; readonly canManage: boolean }): GoogleButtons {
  const { state, gsc, ga4, canManage } = input;
  const none: GoogleButtons = { openSearchConsole: null, openAnalytics: null, openLiveSite: null, retry: false, detach: false, provisionNow: false };
  if (state === "free-address" || state === "not-added") return none;
  if (state === "detached") return { ...none, provisionNow: canManage };
  const host = gsc === null ? null : hostOfSite(gsc.externalId);
  return {
    openSearchConsole: gsc === null ? null : searchConsoleLink(gsc.externalId),
    openAnalytics: ga4 === null ? null : analyticsLink(ga4.externalId),
    openLiveSite: state === "needs-look" && host !== null ? `https://${host}/` : null,
    retry: canManage && gsc !== null && gsc.verifiedAt === null && gsc.status !== "access_lost",
    detach: canManage,
    provisionNow: false,
  };
}
