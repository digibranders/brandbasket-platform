/** Days a business is closed beyond its usual hours (holidays, one-off closures), shown on its own site. */
export const CLOSURE_NOTE_MAX_LENGTH = 80;

export interface Closure {
  readonly id: string;
  readonly startsOn: string;
  readonly endsOn: string;
  /** The reason, e.g. "Diwali". */
  readonly note: string | null;
  /** `HH:MM`, both or neither: the shorter hours kept on these days (a half day). Neither means shut all day. */
  readonly opensAt?: string | null;
  readonly closesAt?: string | null;
}

/** Closures that have not ended by `today`, soonest first. */
export function upcomingClosures<T extends Closure>(closures: readonly T[], today: string): T[] {
  return closures.filter((closure) => closure.endsOn >= today).sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0));
}

/**
 * The closure covering `date`, if any. Only needs the date range (plus whatever else the caller's own type
 * carries), so callers that don't have a full `Closure` -- e.g. appointments/slots.ts's `WeekAvailabilityClosure`,
 * which only knows a business's closed ranges and their notes -- can reuse it too.
 */
export function closureOn<T extends Pick<Closure, "startsOn" | "endsOn">>(closures: readonly T[], date: string): T | null {
  return closures.find((closure) => closure.startsOn <= date && date <= closure.endsOn) ?? null;
}
