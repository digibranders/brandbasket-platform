import "server-only";
import { findLatestKickoffOutcome } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { getStaffDb } from "./db";

/**
 * When the kickoff call staff marked as missed (the customer or the team did not attend) was due to start, or null when the
 * latest outcome says anything else or recorded no time. Call it only while the business has no booking: a new booking
 * replaces the old miss. Staff connection, because customers cannot read setup_call_outcomes (see lib/server/db.ts).
 * A failed read is logged and gives null, so it can never break Home.
 */
export async function loadMissedKickoffAt(tenant: TenantContext): Promise<Date | null> {
  try {
    const latest = await findLatestKickoffOutcome(getStaffDb(), tenant.businessId);
    if (latest === null || (latest.outcome !== "customer_no_show" && latest.outcome !== "team_no_show")) return null;
    return latest.callStartsAt ?? latest.callEndsAt;
  } catch (error) {
    console.error("[missed-kickoff] could not read the latest outcome", errorLogInfo(error));
    return null;
  }
}
