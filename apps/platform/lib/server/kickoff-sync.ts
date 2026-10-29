import "server-only";
import { addActivityEvent, firstPreviewDueAfterKickoff, KICKOFF_SETTLE_HOURS, listKickoffsToStart, markProjectReadyAfterKickoff } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/lib/leads-api";
import { getStaffDb } from "./db";

/**
 * The secret the scheduled job sends as `Authorization: Bearer <token>`. Unset or too short means the route refuses every
 * request, so nothing starts a build by accident on a server that has not set it up.
 */
export function kickoffSyncToken(): string | null {
  const token = process.env.KICKOFF_SYNC_TOKEN?.trim() ?? "";
  return token.length >= LEADS_API_TOKEN_MIN_LENGTH ? token : null;
}

export interface KickoffSyncReport {
  /** The kickoffs that are over whose project had not started. */
  readonly checked: number;
  /** The projects that moved from onboarding to submitted this run. */
  readonly started: number;
  /** The ones that could not be moved because of an error (each is logged). */
  readonly failed: number;
}

/**
 * Starts the website build for every kickoff that is over: staff marked it held, or its end time passed more than
 * KICKOFF_SETTLE_HOURS ago (so staff who write notes straight after the call get there first). The first preview is due 48
 * hours after the call. Safe to run as often as wanted: a project that has already moved is not touched. Staff connection,
 * for system work only (the exceptions in lib/server/db.ts): it takes no input but the clock, and writes only the project
 * status and one "What we did" line for the customer.
 */
export async function startBuildsAfterKickoff(now: Date = new Date()): Promise<KickoffSyncReport> {
  const db = getStaffDb();
  const due = await listKickoffsToStart(db, { endedBefore: new Date(now.getTime() - KICKOFF_SETTLE_HOURS * 3_600_000) });
  let started = 0;
  let failed = 0;
  for (const kickoff of due) {
    try {
      const moved = await markProjectReadyAfterKickoff(db, { businessId: kickoff.businessId, dueAt: firstPreviewDueAfterKickoff({ ...kickoff, now }), now });
      if (!moved) continue;
      started += 1;
      await addActivityEvent(db, { businessId: kickoff.businessId, service: "website", title: "Kickoff call completed", occurredAt: now, staffId: null });
    } catch (error) {
      failed += 1;
      console.error("[kickoff-sync] could not start a build", { businessId: kickoff.businessId, error: errorLogInfo(error) });
    }
  }
  return { checked: due.length, started, failed };
}
