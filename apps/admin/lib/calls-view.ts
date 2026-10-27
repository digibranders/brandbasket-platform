import { SETUP_STEPS_TOTAL, type StaffCallRow } from "@brandbasket/db";
import { clock, todayRange, weekdayDate } from "./team-time";

export interface CallLine {
  readonly call: StaffCallRow;
  /** "14:00" today, "Tue 1 Dec, 14:00" on other days, "Time not reported" when the booking page gave none. */
  readonly when: string;
  /** "2 of 4": the website's answer steps done. */
  readonly setup: string;
}

export interface CallGroups {
  readonly today: readonly CallLine[];
  readonly upcoming: readonly CallLine[];
  readonly past: readonly CallLine[];
  readonly noTime: readonly CallLine[];
}

/** Calls by India day: today and upcoming earliest first, past most recent first, unknown times last. */
export function groupCalls(calls: readonly StaffCallRow[], now: Date): CallGroups {
  const { start, end } = todayRange(now);
  const line = (call: StaffCallRow, sameDay: boolean): CallLine => ({
    call,
    when: call.startsAt === null ? "Time not reported" : sameDay ? clock(call.startsAt) : `${weekdayDate(call.startsAt)}, ${clock(call.startsAt)}`,
    setup: `${call.setupDone} of ${SETUP_STEPS_TOTAL}`,
  });
  const timed = calls.filter((call): call is StaffCallRow & { startsAt: Date } => call.startsAt !== null);
  return {
    today: timed.filter((call) => call.startsAt >= start && call.startsAt < end).map((call) => line(call, true)),
    upcoming: timed.filter((call) => call.startsAt >= end).map((call) => line(call, false)),
    past: timed
      .filter((call) => call.startsAt < start)
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
      .map((call) => line(call, false)),
    noTime: calls.filter((call) => call.startsAt === null).map((call) => line(call, false)),
  };
}
