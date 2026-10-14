import { DIRECTORY_AD_MAX_PAISE, DIRECTORY_AD_MIN_PAISE } from "./schema/directory-ads";

/*
 * The weekly ad auction's rules as pure functions of the bids and the clock (docs/superpowers/specs/2026-09-30-
 * directory-ads-auction-design.md), shared by settlement, the advertiser's page and the staff console. Weeks run
 * Monday 00:00 to Monday 00:00 in Asia/Kolkata, which has no daylight saving, so a fixed offset is exact. A week is
 * named by its Monday as `YYYY-MM-DD`, the `week_start` column's form.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
/** India Standard Time is UTC+05:30 all year. */
const IST_OFFSET_MS = 330 * MINUTE_MS;
const WEEK_START_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A winner pays the bid below it plus this much (₹10). */
export const AD_INCREMENT_PAISE = 1_000;
/** How many upcoming weeks take bids at once. */
export const BIDDING_WEEKS_AHEAD = 2;
/** Bidding closes this long before the week starts: the Saturday before at 20:00 IST. */
const CLOSE_BEFORE_START_MS = 28 * HOUR_MS;
/** A bid may be lowered or withdrawn until this long before the close. */
const LOWER_BEFORE_CLOSE_MS = DAY_MS;
/** Winners have this long to pay, from the close, and a spot passed on gets as long again. */
export const PAY_WINDOW_MS = DAY_MS;

function assertValidDate(date: Date, what: string): void {
  if (Number.isNaN(date.getTime())) throw new RangeError(`${what} must be a valid Date`);
}

/** Midnight UTC of a `YYYY-MM-DD` Monday, refusing anything else. */
function mondayUtcMs(weekStart: string): number {
  if (!WEEK_START_PATTERN.test(weekStart)) throw new RangeError(`"${weekStart}" is not a YYYY-MM-DD date`);
  const ms = Date.parse(`${weekStart}T00:00:00.000Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== weekStart) {
    throw new RangeError(`"${weekStart}" is not a real date`);
  }
  if (new Date(ms).getUTCDay() !== 1) throw new RangeError(`"${weekStart}" is not a Monday`);
  return ms;
}

function isoDay(utcMidnightMs: number): string {
  return new Date(utcMidnightMs).toISOString().slice(0, 10);
}

/** The Monday `weeks` weeks after `weekStart` (negative for before). */
export function addWeeks(weekStart: string, weeks: number): string {
  return isoDay(mondayUtcMs(weekStart) + weeks * 7 * DAY_MS);
}

/** The Monday of the Indian week `now` falls in. */
export function weekStartOf(now: Date): string {
  assertValidDate(now, "now");
  const local = now.getTime() + IST_OFFSET_MS;
  const localMidnight = local - (((local % DAY_MS) + DAY_MS) % DAY_MS);
  // getUTCDay on the shifted instant is the Indian weekday: 0 Sunday … 6 Saturday.
  const weekday = new Date(localMidnight).getUTCDay();
  const sinceMonday = (weekday + 6) % 7;
  return isoDay(localMidnight - sinceMonday * DAY_MS);
}

/** When the week starts: Monday 00:00 IST. */
export function weekStartsAt(weekStart: string): Date {
  return new Date(mondayUtcMs(weekStart) - IST_OFFSET_MS);
}

/** When the week ends: the next Monday 00:00 IST. */
export function weekEndsAt(weekStart: string): Date {
  return new Date(weekStartsAt(weekStart).getTime() + 7 * DAY_MS);
}

/** When bidding for the week closes: the Saturday before, 20:00 IST. */
export function biddingClosesAt(weekStart: string): Date {
  return new Date(weekStartsAt(weekStart).getTime() - CLOSE_BEFORE_START_MS);
}

/** Until when a bid for the week may be lowered or withdrawn: 24 hours before the close. */
export function lowerDeadline(weekStart: string): Date {
  return new Date(biddingClosesAt(weekStart).getTime() - LOWER_BEFORE_CLOSE_MS);
}

/** When the week's first winners must have paid by: 24 hours after the close. */
export function firstPayBy(weekStart: string): Date {
  return new Date(biddingClosesAt(weekStart).getTime() + PAY_WINDOW_MS);
}

/** The weeks taking bids at `now`, soonest first: the next BIDDING_WEEKS_AHEAD whose bidding has not closed. */
export function openBiddingWeeks(now: Date): string[] {
  assertValidDate(now, "now");
  const current = weekStartOf(now);
  const weeks: string[] = [];
  for (let ahead = 1; weeks.length < BIDDING_WEEKS_AHEAD; ahead += 1) {
    const week = addWeeks(current, ahead);
    if (biddingClosesAt(week).getTime() > now.getTime()) weeks.push(week);
  }
  return weeks;
}

/** The latest week whose bidding has closed by `now`: every auction up to it can be settled. */
export function latestClosedWeekStart(now: Date): string {
  const next = addWeeks(weekStartOf(now), 1);
  return biddingClosesAt(next).getTime() <= now.getTime() ? next : weekStartOf(now);
}

export interface RankableBid {
  readonly id: string;
  readonly amountPaise: number;
  readonly amountSetAt: Date;
}

/** Highest bid first; of two equal bids the one that reached that amount first; then by id, so the order is total. */
export function rankBids<T extends RankableBid>(bids: readonly T[]): T[] {
  return [...bids].sort(
    (a, b) =>
      b.amountPaise - a.amountPaise ||
      a.amountSetAt.getTime() - b.amountSetAt.getTime() ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export interface AuctionWinner {
  readonly bidId: string;
  /** 1 is the top spot of its placement. */
  readonly spot: number;
  /** Net, before GST. */
  readonly pricePaise: number;
}

/**
 * The winners of `spots` spots among `ranked` (already rankBids-ordered and limited to eligible bids), each paying the
 * bid ranked just below it plus AD_INCREMENT_PAISE, never less than the reserve and never more than its own bid. The
 * last winner with nobody below pays the reserve.
 */
export function secondPriceWinners(ranked: readonly RankableBid[], spots: number, reservePaise: number): AuctionWinner[] {
  const winners: AuctionWinner[] = [];
  for (let index = 0; index < Math.min(spots, ranked.length); index += 1) {
    const own = ranked[index];
    if (own === undefined) break;
    const below = ranked[index + 1];
    const competing = below === undefined ? reservePaise : below.amountPaise + AD_INCREMENT_PAISE;
    const pricePaise = Math.min(own.amountPaise, Math.max(reservePaise, competing));
    winners.push({ bidId: own.id, spot: index + 1, pricePaise });
  }
  return winners;
}

/** Why a bid cannot be placed, changed or (with a null amount) withdrawn. */
export type BidChangeRefusal =
  /** The week is not one of openBiddingWeeks: closed, or too far ahead. */
  | "closed"
  | "below-price"
  | "above-max"
  | "not-whole-rupees"
  /** Lowering or withdrawing is allowed only until lowerDeadline. */
  | "too-late-to-lower";

export interface BidChange {
  readonly weekStart: string;
  /** The category's price for the placement: the lowest bid. */
  readonly reservePaise: number;
  /** The business's active bid now, or null. */
  readonly currentPaise: number | null;
  /** The new amount, or null to withdraw. */
  readonly amountPaise: number | null;
  readonly now: Date;
}

export function bidChangeRefusal(change: BidChange): BidChangeRefusal | null {
  if (!openBiddingWeeks(change.now).includes(change.weekStart)) return "closed";
  const { amountPaise, currentPaise } = change;
  if (amountPaise !== null) {
    if (!Number.isSafeInteger(amountPaise) || amountPaise % 100 !== 0) return "not-whole-rupees";
    if (amountPaise < Math.max(change.reservePaise, DIRECTORY_AD_MIN_PAISE)) return "below-price";
    if (amountPaise > DIRECTORY_AD_MAX_PAISE) return "above-max";
  }
  const lowering = currentPaise !== null && (amountPaise === null || amountPaise < currentPaise);
  if (lowering && change.now.getTime() >= lowerDeadline(change.weekStart).getTime()) return "too-late-to-lower";
  return null;
}
