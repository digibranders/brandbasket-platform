import "server-only";
import { isKickoffPromptDue, listPendingKickoffPrompts } from "@brandbasket/db";
import { getStaffDb } from "./db";

/** One unanswered kickoff call, as the console's popup shows it. */
export interface KickoffPromptItem {
  readonly callId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly endsAt: Date;
  /** The server's say: never shown, or last shown at least 15 minutes ago. The popup opens on this, not on browser memory. */
  readonly due: boolean;
}

/** How far back an unanswered call is still asked about: the Calls page's "Just finished" uses the same window. */
export const KICKOFF_PROMPT_LOOK_BACK_DAYS = 14;

/**
 * Every kickoff call that has ended and has no answer, oldest first, with whether the popup is due for it. The state lives in
 * `kickoff_prompt_state`, so a reload or a second tab sees the same thing. Staff connection.
 */
export async function loadKickoffPrompts(now: Date = new Date()): Promise<readonly KickoffPromptItem[]> {
  const pending = await listPendingKickoffPrompts(getStaffDb(), { now, lookBackDays: KICKOFF_PROMPT_LOOK_BACK_DAYS });
  return pending.map((call) => ({ callId: call.callId, businessId: call.businessId, businessName: call.businessName, endsAt: call.endsAt, due: isKickoffPromptDue(call, now) }));
}
