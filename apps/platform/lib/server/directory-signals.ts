import "server-only";
import { createHmac } from "node:crypto";
import {
  answerByAsked,
  consumeRateLimit,
  directoryRefId,
  incrementDirectoryDailyCount,
  purgeOldDirectoryDailyCounts,
  readActiveDirectoryPaidTags,
  readDirectorySignals,
  readDirectoryShareCounts,
  resolveDirectoryAsk,
  resolveDirectoryNamed,
  type Database,
  type DirectoryAsk,
  type DirectoryNamed,
  type RateLimitRule,
} from "@fynix/db";
import type { DirectoryEventKind, ListingSignals, SignalsResponse } from "@/lib/directory-api";
import { getStaffDb } from "./db";
import { accountCodeSecret } from "./env";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { ipRateLimitKey } from "./ip-key";

/**
 * The work behind `POST /api/directory/events` and `GET /api/directory/signals`: counting what visitors do on a
 * directory business (a page view or a contact tap) and working out which businesses are Trending. Runs on the staff
 * connection (see `getStaffDb`'s sanctioned exceptions): directory_daily_counts is staff-only, and the website's
 * shared secret has already been checked by the route.
 *
 * Only aggregate daily counts are stored. A visitor is counted once per business, kind and day through a rate-limit
 * key that is an HMAC (keyed with the account code secret) of their address, never the address itself, and the address is
 * then dropped.
 */

/** The directory serves Thane: its days are Indian calendar days. */
export const DIRECTORY_TIME_ZONE = "Asia/Kolkata";

const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** One count per visitor, business, kind and day. */
export const ONCE_A_DAY_RULE: RateLimitRule = { limit: 1, windowSeconds: ONE_DAY_SECONDS };
/** Every event from one address, whatever the business: far above a person browsing, well below a bot's crawl. */
export const IP_HOURLY_RULE: RateLimitRule = { limit: 300, windowSeconds: ONE_HOUR_SECONDS };

/** Separates these hashes from any other use of the same secret. */
const HASH_CONTEXT = "fynix:directory-events:v1";

/** `unknown_business`: the event names an id no business on the platform has. */
export type DirectoryEventOutcome = "counted" | "repeat" | "limited" | "unknown_business" | "failed";

/** One visitor action on one business, as the events route read it from the contract's request. */
export interface DirectoryEvent {
  readonly business: DirectoryNamed;
  readonly kind: DirectoryEventKind;
  readonly clientIp: string;
}

/** The id or key an event named its business by: public data, safe to log. */
function businessLabel(business: DirectoryNamed): string {
  return business.by === "id" ? business.id : business.key;
}

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: DIRECTORY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The Asia/Kolkata calendar day `now` falls on, `YYYY-MM-DD`. */
export function directoryDay(now: Date): string {
  const parts = new Map(dayFormatter.formatToParts(now).map((part) => [part.type, part.value]));
  const year = parts.get("year");
  const month = parts.get("month");
  const day = parts.get("day");
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(`Could not read a calendar day from ${now.toISOString()}`);
  }
  return `${year}-${month}-${day}`;
}

/** A keyed hash of `parts` (JSON-encoded, so no two different lists can collide by concatenation). */
export function visitorHash(secret: string, parts: readonly string[]): string {
  return createHmac("sha256", secret)
    .update(JSON.stringify([HASH_CONTEXT, ...parts]))
    .digest("base64url");
}

/** The day the purge last ran in this process: it only needs to run once a day, not on every event. */
let lastPurgeDay: string | null = null;

/** Opportunistic housekeeping, like the review codes' purge: not awaited, so it never slows or fails an event. */
function purgeOnceADay(db: Database, day: string): void {
  if (lastPurgeDay === day) return;
  lastPurgeDay = day;
  purgeOldDirectoryDailyCounts(db, day).catch((error: unknown) => {
    // Let the next event try again.
    if (lastPurgeDay === day) lastPurgeDay = null;
    console.error("Could not purge old directory daily counts.", errorLogInfo(error));
  });
}

/**
 * Counts one visitor action on one business, unless the visitor's address has sent more than IP_HOURLY_RULE allows (a
 * bot), the business is an id nobody has, or it is a repeat (the same visitor, business, kind and day: counted
 * already; a place is one business whichever of its keys or its id the visits came by). The outcome is only for logs
 * and tests: the route answers every one of them the same way.
 */
export async function recordDirectoryEvent(event: DirectoryEvent, now: Date): Promise<DirectoryEventOutcome> {
  try {
    const secret = accountCodeSecret();
    const db = getStaffDb();
    const day = directoryDay(now);
    purgeOnceADay(db, day);

    // The /64 of an IPv6 address, like every other rate limit here: one household is one visitor.
    const visitor = ipRateLimitKey(event.clientIp);

    const ceiling = await consumeRateLimit(db, `dir-event:ip:${visitorHash(secret, [visitor])}`, IP_HOURLY_RULE, now);
    if (!ceiling.allowed) return "limited";

    const business = await resolveDirectoryNamed(db, event.business);
    if (business === null) return "unknown_business";

    // The window is pinned to the day's own date, so the whole Asia/Kolkata day shares one bucket rather than being
    // split at UTC midnight (05:30 there); the day is in the key too, so tomorrow starts afresh.
    const once = await consumeRateLimit(
      db,
      `dir-event:once:${visitorHash(secret, [visitor, directoryRefId(business), event.kind, day])}`,
      ONCE_A_DAY_RULE,
      new Date(`${day}T00:00:00.000Z`),
    );
    if (!once.allowed) return "repeat";

    await incrementDirectoryDailyCount(db, { business, kind: event.kind, day });
    return "counted";
  } catch (error) {
    // The business and kind are public; the address is never logged.
    console.error("Could not count a directory event.", { business: businessLabel(event.business), kind: event.kind, ...errorLogInfo(error) });
    return "failed";
  }
}

/**
 * Which of the businesses asked about carry a signal on `now`: Trending (earned, today's Asia/Kolkata day), how many
 * times its profile was shared (all time), and the paid tag a business is showing this week (a running, switched-on
 * directory_promotions week, found through the client listing's place). Each business is read once and answered under
 * every id and key it was asked by; only those with any of them are included, and `paidTag` is left out when there is none, as the contract allows. At most
 * MAX_RATING_KEYS together: the route checks that before calling.
 */
export async function readSignals(ask: DirectoryAsk, now: Date): Promise<SignalsResponse> {
  const db = getStaffDb();
  const resolved = await resolveDirectoryAsk(db, ask);
  const [scored, paidTags, shares] = await Promise.all([
    readDirectorySignals(db, resolved.lookup, directoryDay(now)),
    readActiveDirectoryPaidTags(db, resolved.lookup, now),
    readDirectoryShareCounts(db, resolved.lookup),
  ]);
  const byBusiness = new Map<string, ListingSignals>();
  for (const [business, signal] of scored) {
    if (signal.trending) byBusiness.set(business, { trending: true });
  }
  for (const [business, paidTag] of paidTags) {
    byBusiness.set(business, { trending: byBusiness.get(business)?.trending ?? false, paidTag });
  }
  for (const [business, count] of shares) {
    byBusiness.set(business, { trending: false, ...byBusiness.get(business), shares: count });
  }
  return { signals: Object.fromEntries(answerByAsked(resolved, byBusiness)) };
}
