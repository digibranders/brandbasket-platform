import type { CallReason, CallStatus } from "@brandbasket/db/call-reasons";
import { slotLabel } from "@/lib/call-dates";
import { KIND_LABELS } from "@/lib/requests/form";

/** How many calls a business may have booked at once, so one account cannot fill the team's calendar. */
export const MAX_UPCOMING_CALLS = 3;

/** A call after the kickoff, as the rules need it (a row of `team_calls`). */
export interface CallInput {
  readonly id: string;
  readonly reason: CallReason;
  readonly note: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status: CallStatus;
  readonly summary: string | null;
}

/** The kickoff call (a row of `setup_call_bookings`), which stays where it is. */
export interface KickoffInput {
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly heldAt: Date | null;
  readonly summary: string | null;
}

/** One line of the Calls page. */
export interface CallRow {
  /** The call's id, or "kickoff". */
  readonly key: string;
  /** The `team_calls` id, or null for the kickoff, which is changed from the first look, not here. */
  readonly callId: string | null;
  /** "Kickoff", or the reason in the customer's words. */
  readonly about: string;
  /** What the call is about and what the customer wrote, kept so changing the call's time starts from them. Null for the kickoff. */
  readonly reason: CallReason | null;
  readonly note: string | null;
  /** "Wed 2 Dec, 14:00", in India. */
  readonly when: string;
  readonly startsAtIso: string;
  readonly endsAtIso: string;
  /** What staff wrote about what was agreed. Only a held call has it. */
  readonly agreed: string | null;
  readonly canChange: boolean;
  readonly canCancel: boolean;
}

function rowOf(
  parts: { key: string; callId: string | null; about: string; reason: CallReason | null; note: string | null; startsAt: Date; endsAt: Date; agreed: string | null; editable: boolean },
  now: Date,
): CallRow {
  const ahead = parts.editable && parts.startsAt > now;
  return {
    key: parts.key,
    callId: parts.callId,
    about: parts.about,
    reason: parts.reason,
    note: parts.note,
    when: slotLabel(parts.startsAt.toISOString()),
    startsAtIso: parts.startsAt.toISOString(),
    endsAtIso: parts.endsAt.toISOString(),
    agreed: parts.agreed,
    canChange: ahead,
    canCancel: ahead,
  };
}

/**
 * The Calls page's two lists. A call is upcoming until it has ended, unless staff marked it held; a cancelled call is not
 * shown. Upcoming is soonest first, past is newest first. The kickoff is one more row when it was booked here.
 */
export function callRows(input: { readonly calls: readonly CallInput[]; readonly kickoff: KickoffInput | null; readonly now: Date }): { readonly upcoming: readonly CallRow[]; readonly past: readonly CallRow[] } {
  const upcoming: CallRow[] = [];
  const past: CallRow[] = [];
  for (const call of input.calls) {
    if (call.status === "cancelled") continue;
    const row = rowOf(
      { key: call.id, callId: call.id, about: KIND_LABELS[call.reason], reason: call.reason, note: call.note, startsAt: call.startsAt, endsAt: call.endsAt, agreed: call.status === "held" ? call.summary : null, editable: call.status === "booked" },
      input.now,
    );
    (call.status === "booked" && call.endsAt > input.now ? upcoming : past).push(row);
  }
  const kickoff = input.kickoff;
  if (kickoff !== null && kickoff.startsAt !== null && kickoff.endsAt !== null) {
    const row = rowOf({ key: "kickoff", callId: null, about: "Kickoff", reason: null, note: null, startsAt: kickoff.startsAt, endsAt: kickoff.endsAt, agreed: kickoff.heldAt === null ? null : kickoff.summary, editable: false }, input.now);
    (kickoff.heldAt === null && kickoff.endsAt > input.now ? upcoming : past).push(row);
  }
  upcoming.sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso));
  past.sort((a, b) => b.startsAtIso.localeCompare(a.startsAtIso));
  return { upcoming, past };
}

/** Booked calls that have not ended, optionally leaving out the one being changed. The limit counts these. */
export function upcomingCount(calls: readonly CallInput[], now: Date, exceptId?: string): number {
  return calls.filter((call) => call.status === "booked" && call.endsAt > now && call.id !== exceptId).length;
}

/** The time of the soonest call still to come, for Overview, or null when none is booked. */
export function nextCallLine(upcoming: readonly CallRow[]): string | null {
  return upcoming[0]?.when ?? null;
}
