import { addWeeks, type DirectoryAdPlacement, type StaffHeldSpot } from "@brandbasket/db";

/*
 * How long a spot staff have booked stays closed to bidders: staff book a spot for weeks in a row (a month or two),
 * so an owner is told the last day of the unbroken run, not just this week. Pure, so it is tested without a database.
 */

/** The last week of the unbroken run that starts at `weekStart`, over weeks for which `held` says the spot is taken; null when `weekStart` itself is not. */
function lastHeldWeek(weekStart: string, held: (week: string) => boolean): string | null {
  if (!held(weekStart)) return null;
  let last = weekStart;
  // Staff book 12 weeks at most (MAX_STAFF_AD_WEEKS), one run after another at worst; this bound only guards the loop.
  for (let step = 1; step <= 104; step += 1) {
    const next = addWeeks(weekStart, step);
    if (!held(next)) break;
    last = next;
  }
  return last;
}

/**
 * The start of the last week of the unbroken run, from `weekStart` on, in which staff hold `spot` of `placement`; null
 * when staff do not hold it in `weekStart`.
 */
export function spotHeldThrough(held: readonly StaffHeldSpot[], placement: DirectoryAdPlacement, spot: number, weekStart: string): string | null {
  const weeks = new Set(held.filter((row) => row.placement === placement && row.spot === spot).map((row) => row.weekStart));
  return lastHeldWeek(weekStart, (week) => weeks.has(week));
}

/**
 * The start of the last week of the unbroken run, from `weekStart` on, in which staff hold every one of the
 * placement's `totalSpots`: the placement is closed to bidders until that week ends. Null when a spot is free in
 * `weekStart`.
 */
export function placementHeldThrough(held: readonly StaffHeldSpot[], placement: DirectoryAdPlacement, totalSpots: number, weekStart: string): string | null {
  const perWeek = new Map<string, Set<number>>();
  for (const row of held) {
    if (row.placement !== placement) continue;
    const spots = perWeek.get(row.weekStart) ?? new Set<number>();
    spots.add(row.spot);
    perWeek.set(row.weekStart, spots);
  }
  return lastHeldWeek(weekStart, (week) => (perWeek.get(week)?.size ?? 0) >= totalSpots);
}
