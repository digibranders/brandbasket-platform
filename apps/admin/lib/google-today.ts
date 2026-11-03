import type { ConnectedSource, GoogleAttentionCutoffs, GoogleAttentionRow, GoogleConnectionRow } from "@brandbasket/db";
import { addDays, localDateIn } from "@brandbasket/shared/lib/calendar/local-date";
import { formatStoredDate } from "@brandbasket/shared/lib/format";
import { FINAL_LAG_DAYS } from "@brandbasket/shared/server/gsc/report";
import { GOOGLE_STUCK_DAYS, wholeDaysBetween } from "./google-card";
import { shortDate, TEAM_TIME_ZONE } from "./team-time";
import type { TodayItem } from "./today-queue";

/*
 * The Google part of Today (plan 62, step 5): three kinds of thing a person has to do. The age rules are here as pure
 * functions; the database query takes their cutoffs, so only rows that are already late are read.
 */

const DAY_MS = 86_400_000;
/** A connected source with no new day for this many days is listed. */
export const NO_DATA_DAYS = 3;
/** Each pull ends this many days before today: Analytics at yesterday, Search Console at its final day. */
const DATA_LAG_DAYS: Readonly<Record<ConnectedSource, number>> = { ga4: 1, gsc: FINAL_LAG_DAYS };
const SOURCE_NAMES: Readonly<Record<ConnectedSource, string>> = { gsc: "Search Console", ga4: "Analytics" };

/**
 * The cutoffs for the query. A source is silent when its newest day is NO_DATA_DAYS or more behind the day its nightly pull
 * should have reached (a healthy Search Console site is always 3 days behind today, so "3 days before today" would list all of them).
 */
export function googleAttentionCutoffs(now: Date): GoogleAttentionCutoffs {
  const today = localDateIn(TEAM_TIME_ZONE, now);
  const before = (source: ConnectedSource): string => addDays(today, -(DATA_LAG_DAYS[source] + NO_DATA_DAYS - 1));
  return { unverifiedBefore: new Date(now.getTime() - GOOGLE_STUCK_DAYS * DAY_MS), gscDataBefore: before("gsc"), ga4DataBefore: before("ga4") };
}

/** How many days a connected source's newest day is behind the day its pull should have reached; zero when it is up to date. */
export function daysWithoutData(source: ConnectedSource, latestDay: string, now: Date): number {
  const expected = addDays(localDateIn(TEAM_TIME_ZONE, now), -DATA_LAG_DAYS[source]);
  return Math.max(0, Math.round((Date.parse(`${expected}T00:00:00Z`) - Date.parse(`${latestDay}T00:00:00Z`)) / DAY_MS));
}

const plural = (count: number): string => `${count} ${count === 1 ? "day" : "days"}`;
const clientWebsite = (businessId: string): string => `/clients/${businessId}/website`;

/** Queue items for the late Search Console sites and silent sources. */
export function googleAttentionItems(rows: readonly GoogleAttentionRow[], now: Date): readonly TodayItem[] {
  return rows.map((row): TodayItem => {
    if (row.kind === "unverified") {
      return {
        key: `google:unverified:${row.businessId}`,
        kind: "google",
        href: `${clientWebsite(row.businessId)}?google=look#google`,
        title: `${row.businessName}: Google cannot see the verification tag`,
        detail: `Not verified ${plural(wholeDaysBetween(row.since, now))} after the site was added.`,
        action: "Retry verification",
        dueAt: new Date(row.since.getTime() + GOOGLE_STUCK_DAYS * DAY_MS),
      };
    }
    const behind = daysWithoutData(row.source, row.latestDay, now);
    return {
      key: `google:no-data:${row.businessId}:${row.source}`,
      kind: "google",
      href: `/clients/${row.businessId}`,
      title: `${row.businessName}: no Google data for ${plural(Math.max(behind, NO_DATA_DAYS))}`,
      detail: `${SOURCE_NAMES[row.source]} is connected. Its newest day is ${formatStoredDate(row.latestDay)}.`,
      action: "Open client",
      // The moment the gap passed the tolerance.
      dueAt: new Date(`${addDays(row.latestDay, DATA_LAG_DAYS[row.source] + NO_DATA_DAYS)}T00:00:00Z`),
    };
  });
}

export type GoogleSignIn = Pick<GoogleConnectionRow, "purpose" | "status" | "updatedAt">;

const LOST_LINES = {
  read: "The reading sign-in was refused by Google. Nothing is pulled until it is connected again.",
  write: "The setting-up sign-in was refused by Google. New sites are not set up until it is connected again.",
} as const;

/** One item while any sign-in of the Brandbasket Google account is lost; admins only, so the caller passes nothing for other roles. */
export function googleSignInItems(connections: readonly GoogleSignIn[]): readonly TodayItem[] {
  const lost = connections.filter((connection) => connection.status === "access_lost");
  const first = [...lost].sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime())[0];
  if (first === undefined) return [];
  const purposes = new Set(lost.map((connection) => connection.purpose));
  return [
    {
      key: "google:sign-in",
      kind: "google",
      href: "/settings#google",
      title: "Brandbasket Google sign-in was lost",
      detail: purposes.size > 1 ? "Both sign-ins were refused by Google. Nothing is pulled or set up until they are connected again." : `${LOST_LINES[first.purpose]} Refused on ${shortDate(first.updatedAt)}.`,
      action: "Open Settings",
      dueAt: first.updatedAt,
    },
  ];
}
