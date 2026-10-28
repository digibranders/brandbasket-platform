import type { RollupCandidate, SiteHit } from "@brandbasket/db";
import { istDay, istDayRange } from "@brandbasket/shared/lib/analytics/request";
import { dailyMetrics, legacyEnquiryMetrics, mergeLegacyEvents, monthlyBreakdowns, type DailyMetricRow, type LegacyEnquiryCounts } from "@brandbasket/shared/lib/analytics/rollup";
import { monthRange, type MonthKey } from "@brandbasket/shared/lib/reports/period";

/** How many Indian days a night rolls up, ending with yesterday. The earlier one is re-done so a late hit is never missed. */
const DAYS_ROLLED = 2;
/** Raw hits are kept this long; the roll-up has long since turned them into numbers. */
const HIT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything the roll-up needs from outside, so the whole night's work runs without a database or a clock. */
export interface RollupDeps {
  /** The businesses to look at between `from` and `to` (see listRollupCandidates). */
  readonly candidates: (from: Date, to: Date) => Promise<readonly RollupCandidate[]>;
  readonly hits: (businessId: string, from: Date, to: Date) => Promise<readonly SiteHit[]>;
  /** What the older server route counted between `from` and `to`. */
  readonly legacy: (businessId: string, from: Date, to: Date) => Promise<LegacyEnquiryCounts>;
  readonly writeDaily: (businessId: string, day: string, rows: readonly DailyMetricRow[], now: Date) => Promise<void>;
  readonly writeBreakdown: (businessId: string, month: string, dimension: string, rows: readonly { readonly key: string; readonly count: number }[], now: Date) => Promise<void>;
  readonly recordFailure: (businessId: string, windowStart: string, windowEnd: string, errorName: string, now: Date) => Promise<void>;
  readonly deleteOldHits: (cutoff: Date) => Promise<number>;
  readonly deleteOldSalts: (beforeDay: string) => Promise<number>;
}

export interface RollupReport {
  readonly dryRun: boolean;
  readonly days: readonly string[];
  readonly businesses: number;
  readonly daysWritten: number;
  /** Days with nothing to write: a site with no script and no older events that day. */
  readonly daysSkipped: number;
  readonly breakdownsWritten: number;
  readonly failures: readonly { readonly businessId: string; readonly errorName: string }[];
  /** Null on a dry run, which deletes nothing. */
  readonly hitsDeleted: number | null;
  readonly saltsDeleted: number | null;
}

function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The night's work for the first-party site analytics (plan 56): the last two Indian days into daily numbers and the
 * month so far into ranked lists, for every business that has sent a hit or used the older server route, then the
 * retention deletes. A business whose script is live gets every metric (a quiet day is a measured zero); one with no
 * script gets only the three enquiry numbers, and only on days the older route counted something. One business failing is
 * recorded and the rest carry on. Idempotent: running it twice writes the same numbers. A dry run writes and deletes nothing.
 */
export async function runSiteAnalyticsRollup(deps: RollupDeps, options: { readonly now: Date; readonly dryRun: boolean }): Promise<RollupReport> {
  const { now, dryRun } = options;
  const yesterday = shiftDay(istDay(now), -1);
  const days = Array.from({ length: DAYS_ROLLED }, (_, index) => shiftDay(yesterday, index - (DAYS_ROLLED - 1)));
  const months = [...new Set(days.map((day) => day.slice(0, 7)))] as MonthKey[];
  const windowFrom = istDayRange(days[0] ?? yesterday).from;
  const windowTo = istDayRange(yesterday).to;

  const candidates = await deps.candidates(windowFrom, windowTo);
  let daysWritten = 0;
  let daysSkipped = 0;
  let breakdownsWritten = 0;
  const failures: { businessId: string; errorName: string }[] = [];

  for (const candidate of candidates) {
    try {
      for (const day of days) {
        const range = istDayRange(day);
        const scriptLive = candidate.firstHitAt !== null && candidate.firstHitAt < range.to;
        const legacy = await deps.legacy(candidate.businessId, range.from, range.to);
        const rows = scriptLive
          ? mergeLegacyEvents(dailyMetrics(await deps.hits(candidate.businessId, range.from, range.to)), legacy)
          : legacyEnquiryMetrics(legacy);
        if (rows.length === 0) {
          daysSkipped++;
          continue;
        }
        if (!dryRun) await deps.writeDaily(candidate.businessId, day, rows, now);
        daysWritten++;
      }
      for (const month of months) {
        const { start, end } = monthRange(month);
        const from = istDayRange(start).from;
        const to = istDayRange(end < yesterday ? end : yesterday).to;
        if (candidate.firstHitAt === null || candidate.firstHitAt >= to) continue;
        for (const list of monthlyBreakdowns(await deps.hits(candidate.businessId, from, to))) {
          if (!dryRun) await deps.writeBreakdown(candidate.businessId, start, list.dimension, list.rows, now);
          breakdownsWritten++;
        }
      }
    } catch (error) {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      failures.push({ businessId: candidate.businessId, errorName });
      if (!dryRun) await deps.recordFailure(candidate.businessId, days[0] ?? yesterday, yesterday, errorName, now);
    }
  }

  const hitsDeleted = dryRun ? null : await deps.deleteOldHits(new Date(now.getTime() - HIT_RETENTION_DAYS * DAY_MS));
  const saltsDeleted = dryRun ? null : await deps.deleteOldSalts(istDay(new Date(now.getTime() - DAY_MS)));
  return { dryRun, days, businesses: candidates.length, daysWritten, daysSkipped, breakdownsWritten, failures, hitsDeleted, saltsDeleted };
}
