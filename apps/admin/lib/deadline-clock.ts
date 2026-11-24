const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * HOUR_MS;

export interface DeadlineClock {
  readonly text: string;
  /** True once the deadline has passed: the only state shown in red. */
  readonly late: boolean;
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** The 30 day privacy clock: "17d 08h remaining", or "02d 04h overdue". Whole units, rounded down. */
export function requestClock(dueAt: Date, now: Date): DeadlineClock {
  const left = dueAt.getTime() - now.getTime();
  const late = left <= 0;
  const span = Math.abs(left);
  const days = Math.floor(span / DAY_MS);
  const hours = Math.floor((span % DAY_MS) / HOUR_MS);
  return { text: `${pad(days)}d ${pad(hours)}h ${late ? "overdue" : "remaining"}`, late };
}

/** A clock this close to its deadline, and not yet late, is "soon". */
export const SOON_HOURS = 72;

export type ClockTone = "late" | "soon" | "ok";

/** Late once the deadline has passed, soon inside the last 72 hours, otherwise ok. Colours are chosen from this in one place. */
export function clockTone(deadline: Date, now: Date): ClockTone {
  const left = deadline.getTime() - now.getTime();
  if (left <= 0) return "late";
  return left < SOON_HOURS * HOUR_MS ? "soon" : "ok";
}

/** The 6 and 72 hour breach clocks: "5h 12m left", or "1h 05m overdue". */
export function breachClock(deadline: Date, now: Date): DeadlineClock {
  const left = deadline.getTime() - now.getTime();
  const late = left <= 0;
  const span = Math.abs(left);
  const hours = Math.floor(span / HOUR_MS);
  const minutes = Math.floor((span % HOUR_MS) / MINUTE_MS);
  return { text: `${hours}h ${pad(minutes)}m ${late ? "overdue" : "left"}`, late };
}
