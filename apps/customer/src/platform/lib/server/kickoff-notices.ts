import "server-only";
import { KICKOFF_REMINDER_PUSH_AFTER_MS, listKickoffsStartingSoon, listPendingKickoffPrompts, markKickoffFirstNotified, markKickoffReminderPushed } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { kickoffClockTime } from "@brandbasket/shared/lib/kickoff-time";
import { getStaffDb } from "./db";
import { notify } from "./notifier";

const HOUR_MS = 3_600_000;
/** How far back an unanswered call is still chased: the Calls page's "Just finished" uses the same window. */
const LOOK_BACK_DAYS = 14;

export interface KickoffNoticeReport {
  /** Staff told a call had ended. */
  readonly ended: number;
  /** The 2 hour reminder pushes sent. */
  readonly reminders: number;
  /** Customers told their call is about to start. */
  readonly soon: number;
}

/**
 * The kickoff notices that come from the clock rather than from a person pressing something, run by the same 15 minute sweep
 * that starts builds: staff once when a call has ended and nobody answered, staff one more push if it is still open 2 hours
 * later, and the customer an hour before the call. Each is deduped by call and time in notify(), so running twice, or a call
 * whose time moves (it gets a new key), notices once per time. A step that fails is logged and does not stop the others.
 * Staff connection, for system work only: it takes no input but the clock.
 */
export async function sendKickoffNotices(now: Date = new Date()): Promise<KickoffNoticeReport> {
  const db = getStaffDb();
  const report = { ended: 0, reminders: 0, soon: 0 };

  try {
    for (const call of await listPendingKickoffPrompts(db, { now, lookBackDays: LOOK_BACK_DAYS })) {
      const audience = { kind: "staff", businessId: call.businessId } as const;
      const dedupeKey = `${call.callId}:${call.endsAt.toISOString()}`;
      if (call.firstNotifiedAt === null) {
        const result = await notify({ event: "kickoff.ended", audience, dedupeKey, data: { businessName: call.businessName } });
        if (!result.failed) {
          await markKickoffFirstNotified(db, call.callId, now);
          report.ended += 1;
        }
      }
      if (call.reminderPushedAt === null && now.getTime() - call.endsAt.getTime() >= KICKOFF_REMINDER_PUSH_AFTER_MS) {
        const result = await notify({ event: "kickoff.ended.reminder", audience, dedupeKey, data: {} });
        if (!result.failed) {
          await markKickoffReminderPushed(db, call.callId, now);
          report.reminders += 1;
        }
      }
    }
  } catch (error) {
    console.error("[kickoff-notices] could not send the call-ended notices", errorLogInfo(error));
  }

  try {
    for (const call of await listKickoffsStartingSoon(db, { now, withinMs: HOUR_MS })) {
      const result = await notify({
        event: "kickoff.soon",
        audience: { kind: "customer", businessId: call.businessId },
        dedupeKey: `${call.callId}:${call.startsAt.toISOString()}`,
        data: { when: kickoffClockTime(call.startsAt) },
      });
      if (!result.failed) report.soon += 1;
    }
  } catch (error) {
    console.error("[kickoff-notices] could not send the one-hour notices", errorLogInfo(error));
  }

  return report;
}
