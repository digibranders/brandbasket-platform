import "server-only";
import { kickoffDayTime } from "@brandbasket/shared/lib/kickoff-time";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { notify } from "./notifier";

export interface KickoffAnswerNotice {
  readonly answer: "completed" | "not_joined" | "reschedule";
  readonly businessId: string;
  /** The booked call's start; null when the call had no time (a phone call). */
  readonly startsAt: Date | null;
}

/**
 * Tells the customer what staff answered about their kickoff call: thanks (Call completed), "we missed each other" with the
 * time (They did not join, skipped when there is no time to name) or a request for a new time (Reschedule). Each is deduped by
 * business and call time, so a double press says it once. Never throws: the answer is already saved.
 */
export async function noticeKickoffAnswered(input: KickoffAnswerNotice): Promise<void> {
  const audience = { kind: "customer", businessId: input.businessId } as const;
  const key = `${input.businessId}:${input.startsAt?.toISOString() ?? "none"}`;
  try {
    if (input.answer === "completed") await notify({ event: "kickoff.completed", audience, dedupeKey: input.businessId, data: {} });
    else if (input.answer === "reschedule") await notify({ event: "kickoff.reschedule", audience, dedupeKey: key, data: {} });
    else if (input.startsAt !== null) await notify({ event: "kickoff.not_joined", audience, dedupeKey: key, data: { when: kickoffDayTime(input.startsAt) } });
  } catch (error) {
    console.error("[kickoff-notices] could not tell the customer about the answer", { answer: input.answer, ...errorLogInfo(error) });
  }
}
