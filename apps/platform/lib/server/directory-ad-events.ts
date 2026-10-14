import "server-only";
import {
  consumeRateLimit,
  holdsLivePlacement,
  incrementDirectoryAdDailyCount,
  purgeOldDirectoryAdDailyCounts,
  type Database,
} from "@fynix/db";
import type { DirectoryAdEventRequest } from "@/lib/directory-api";
import { getStaffDb } from "./db";
import { directoryDay, IP_HOURLY_RULE, ONCE_A_DAY_RULE, visitorHash } from "./directory-signals";
import { bookingOtpSecret } from "./env";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { ipRateLimitKey } from "./ip-key";

/**
 * The work behind `POST /api/directory/ad-events`: counting who saw and clicked an advertiser's ad, for the reports on
 * its Advertise page. Like the listing events (directory-signals.ts) it keeps only daily counts, counts a visitor once
 * per ad, placement, kind and day through an HMAC of their address, and never stores the address. It also counts an ad
 * only while it is running on that placement, so an event for a business with no ad there, or for last week's, is
 * dropped: the numbers an advertiser reads cannot be inflated by naming an id.
 */

/** Counts are kept this long: the reports look back 28 days, and a week more covers the one still being read. */
const KEEP_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Separates these hashes from the listing events' hashes, which use the same secret. */
const HASH_SCOPE = "ad";

/** `not_running`: the business has no ad on that placement this week. `unknown_business`: the id is not in the place registry. */
export type DirectoryAdEventOutcome = "counted" | "repeat" | "limited" | "not_running" | "unknown_business" | "failed";

export interface DirectoryAdEvent {
  readonly placeId: string;
  readonly placement: DirectoryAdEventRequest["placement"];
  readonly kind: DirectoryAdEventRequest["kind"];
  readonly clientIp: string;
}

/** The day the purge last ran in this process, like the listing events': it only needs to run once a day. */
let lastPurgeDay: string | null = null;

function purgeOnceADay(db: Database, now: Date): void {
  const day = directoryDay(now);
  if (lastPurgeDay === day) return;
  lastPurgeDay = day;
  purgeOldDirectoryAdDailyCounts(db, directoryDay(new Date(now.getTime() - KEEP_DAYS * DAY_MS))).catch((error: unknown) => {
    if (lastPurgeDay === day) lastPurgeDay = null;
    console.error("Could not purge old directory ad counts.", errorLogInfo(error));
  });
}

/**
 * Counts one sighting or click of an ad, unless the address has sent more than IP_HOURLY_RULE allows, the ad is not
 * running, or it is a repeat (the same visitor, ad, placement, kind and day). The outcome is only for logs and tests:
 * the route answers every one of them the same way.
 */
export async function recordDirectoryAdEvent(event: DirectoryAdEvent, now: Date): Promise<DirectoryAdEventOutcome> {
  try {
    const secret = bookingOtpSecret();
    const db = getStaffDb();
    const day = directoryDay(now);
    purgeOnceADay(db, now);

    const visitor = ipRateLimitKey(event.clientIp);
    const ceiling = await consumeRateLimit(db, `dir-ad-event:ip:${visitorHash(secret, [HASH_SCOPE, visitor])}`, IP_HOURLY_RULE, now);
    if (!ceiling.allowed) return "limited";

    if (!(await holdsLivePlacement(db, event.placeId, event.placement, now))) return "not_running";

    const once = await consumeRateLimit(
      db,
      `dir-ad-event:once:${visitorHash(secret, [HASH_SCOPE, visitor, event.placeId, event.placement, event.kind, day])}`,
      ONCE_A_DAY_RULE,
      new Date(`${day}T00:00:00.000Z`),
    );
    if (!once.allowed) return "repeat";

    await incrementDirectoryAdDailyCount(db, { placeId: event.placeId, placement: event.placement, day, kind: event.kind });
    return "counted";
  } catch (error) {
    // The place, placement and kind are public; the address is never logged.
    console.error("Could not count a directory ad event.", { placeId: event.placeId, placement: event.placement, kind: event.kind, ...errorLogInfo(error) });
    return "failed";
  }
}
