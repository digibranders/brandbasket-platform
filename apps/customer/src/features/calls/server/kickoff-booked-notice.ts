import "server-only";
import { clearKickoffPromptStateForBusiness } from "@brandbasket/db";
import { kickoffDayTime } from "@brandbasket/shared/lib/kickoff-time";
import { getStaffDb } from "@/lib/db";
import { reportError } from "@/lib/report";
import { notify } from "@/platform/lib/server/notifier";

/**
 * After a business books (or changes) its kickoff time: the call has a new time, so what the console noted for the old one is
 * forgotten (the booking keeps its row, and the booking runs under the customer role, which cannot touch that table), and the
 * person who booked gets "Your kickoff call is booked for <time>". Cal.com bookings made outside the dashboard are alerted by
 * the webhook package, not here. Never throws: the booking has already happened.
 */
export async function noticeKickoffBooked(booker: { readonly businessId: string; readonly userId: string }, startsAt: Date): Promise<void> {
  try {
    await clearKickoffPromptStateForBusiness(getStaffDb(), booker.businessId);
    await notify({
      event: "kickoff.booked",
      audience: { kind: "customer", businessId: booker.businessId, userIds: [booker.userId] },
      dedupeKey: `${booker.businessId}:${startsAt.toISOString()}`,
      data: { when: kickoffDayTime(startsAt) },
    });
  } catch (error) {
    reportError(error, { area: "calls.kickoff-booked-notice" });
  }
}
