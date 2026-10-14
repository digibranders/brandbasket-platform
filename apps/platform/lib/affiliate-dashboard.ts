import type { AffiliateCashOut, AffiliateMonthlyActivity, BillingCurrency, ListedReferralCode } from "@firstfold/db";
import { formatMoney } from "@firstfold/shared/lib/money";

/** What an affiliate's code is doing, in one word and one tone. Colour never stands alone: the word says the same. */
export interface CodeStatus {
  readonly tone: "done" | "waiting" | "quiet";
  readonly label: string;
}

/**
 * Whether new members can use a code right now. An affiliate who is switched off pauses every code of theirs; after
 * that a code can be switched off, lapse, or be used up, in that order of what an affiliate should be told first.
 */
export function codeStatus(
  code: Pick<ListedReferralCode, "active" | "expiresAt" | "maxRedemptions" | "redemptions">,
  affiliateActive: boolean,
  now: Date,
): CodeStatus {
  if (!affiliateActive || !code.active) return { tone: "quiet", label: "Paused" };
  if (code.expiresAt !== null && code.expiresAt <= now) return { tone: "quiet", label: "Expired" };
  if (code.maxRedemptions !== null && code.redemptions >= code.maxRedemptions) return { tone: "waiting", label: "Fully used" };
  return { tone: "done", label: "Live" };
}

/** Money in each currency joined as one figure: "₹4,200" or "₹4,200 + $12". "₹0" when there is none. */
export function moneyFigure(amounts: readonly { readonly currency: BillingCurrency; readonly cents: number }[]): string {
  const present = amounts.filter((amount) => amount.cents > 0);
  if (present.length === 0) return "₹0";
  return present.map((amount) => formatMoney(amount.cents, amount.currency)).join(" + ");
}

/** "Month 2" or, for an affiliate with a month limit, "Month 2 of 12". */
export function monthLabel(cycleNumber: number, rewardCycles: number | null): string {
  return rewardCycles === null ? `Month ${cycleNumber}` : `Month ${cycleNumber} of ${rewardCycles}`;
}

/** One of the dashboard's figures, summed over each currency the affiliate has money in: "₹8,000" or "₹8,000 + $12". */
export function cashOutFigure(rows: readonly AffiliateCashOut[], field: Exclude<keyof AffiliateCashOut, "currency">): string {
  return moneyFigure(rows.map((row) => ({ currency: row.currency, cents: row[field] })));
}

/** The currency with the most earned: the one the bar and the monthly strip are drawn in when there is more than one. */
export function primaryCashOut(rows: readonly AffiliateCashOut[]): AffiliateCashOut | null {
  return rows.reduce<AffiliateCashOut | null>((best, row) => (best === null || row.earnedCents > best.earnedCents ? row : best), null);
}

/** How what was earned divides, as whole percentages that add to 100: what reached them, what was withheld, what is pending. */
export interface CashOutShares {
  readonly received: number;
  readonly withheld: number;
  readonly pending: number;
}

/**
 * The bar's proportions for one currency. Each part that is not zero keeps at least 2% so it stays visible, and the
 * largest part gives up whatever that costs, so the three always add to exactly 100. All zero when nothing is earned.
 */
export function cashOutShares(row: Pick<AffiliateCashOut, "earnedCents" | "receivedCents" | "withheldCents" | "pendingCents">): CashOutShares {
  if (row.earnedCents <= 0) return { received: 0, withheld: 0, pending: 0 };
  const parts = {
    received: row.receivedCents,
    withheld: row.withheldCents,
    pending: row.pendingCents,
  };
  const keys = ["received", "withheld", "pending"] as const;
  const shares = { received: 0, withheld: 0, pending: 0 };
  for (const key of keys) {
    const exact = (parts[key] / row.earnedCents) * 100;
    shares[key] = parts[key] > 0 ? Math.max(2, Math.round(exact)) : 0;
  }
  const largest = keys.reduce((best, key) => (shares[key] > shares[best] ? key : best), "received" as (typeof keys)[number]);
  shares[largest] += 100 - keys.reduce((total, key) => total + shares[key], 0);
  return shares;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
/** India is UTC+5:30 with no daylight saving: the calendar an affiliate and staff both read dates in. */
const INDIA_OFFSET_MINUTES = 330;

function indiaYearMonth(instant: Date): { readonly year: number; readonly month: number } {
  const shifted = new Date(instant.getTime() + INDIA_OFFSET_MINUTES * 60_000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() };
}

/** The instant the first of the month `count - 1` months before this one begins in India: where the monthly query starts. */
export function monthsWindowStart(now: Date, count: number): Date {
  const { year, month } = indiaYearMonth(now);
  return new Date(Date.UTC(year, month - (count - 1), 1) - INDIA_OFFSET_MINUTES * 60_000);
}

/** One month on the dashboard: who paid, what it earned, and what was refunded. */
export interface MonthRow {
  /** `YYYY-MM`. */
  readonly month: string;
  /** "Oct". */
  readonly label: string;
  /** Members who paid that month and kept it. */
  readonly payingMembers: number;
  /** What it earned the affiliate. */
  readonly cents: number;
  /** Payments refunded that month, which count in neither of the above. */
  readonly refunded: number;
  /** Its commission against the best month shown, 0 to 100: the length of its bar. */
  readonly widthPercent: number;
}

export interface MonthRows {
  readonly currency: BillingCurrency;
  /** The last months, newest first, with months nothing happened in kept as rows of zeros so the list reads as time. */
  readonly rows: readonly MonthRow[];
  /** This month, which is always the first row. */
  readonly current: MonthRow;
}

/**
 * The last `count` months of an affiliate's activity in one currency, newest first. In the currency with the most
 * earned when there are several; null when nothing at all happened in the window, because a list of empty months says
 * nothing.
 */
export function monthRows(activity: readonly AffiliateMonthlyActivity[], now: Date, count: number): MonthRows | null {
  if (activity.length === 0) return null;
  const totals = new Map<BillingCurrency, number>();
  for (const row of activity) totals.set(row.currency, (totals.get(row.currency) ?? 0) + row.cents);
  const [currency] = [...totals].reduce((best, entry) => (entry[1] > best[1] ? entry : best));
  if (currency === undefined) return null;

  const { year, month } = indiaYearMonth(now);
  const byMonth = new Map(activity.filter((row) => row.currency === currency).map((row) => [row.month, row]));
  const months = Array.from({ length: count }, (_, index) => {
    const at = new Date(Date.UTC(year, month - index, 1));
    return { key: `${String(at.getUTCFullYear())}-${String(at.getUTCMonth() + 1).padStart(2, "0")}`, label: MONTH_NAMES[at.getUTCMonth()] ?? "" };
  });
  const best = Math.max(1, ...months.map(({ key }) => byMonth.get(key)?.cents ?? 0));
  const rows = months.map(({ key, label }): MonthRow => {
    const found = byMonth.get(key);
    const cents = found?.cents ?? 0;
    return { month: key, label, payingMembers: found?.payingMembers ?? 0, cents, refunded: found?.refunded ?? 0, widthPercent: Math.round((cents / best) * 100) };
  });
  const current = rows[0];
  return current === undefined ? null : { currency, rows, current };
}

/** "2 paying", "1 paying", "None paying": how many members paid in a month. */
export function payingLine(count: number): string {
  return count === 0 ? "None paying" : `${String(count)} paying`;
}
