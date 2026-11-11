import { z } from "zod";

/*
 * Visitors and Google search figures for a month, read from the stored metrics (`metric_daily`, `metric_breakdowns`,
 * `report_source_runs`) that the collectors fill: `ga4.*` from Google Analytics, `own.*` from our own site script, `gsc.*` from
 * Search Console. Pure: the database reads are in packages/db/src/queries/report-facts.ts. A month is shown only when the source
 * ran successfully over at least 90 percent of its days, so a source connected on the 20th never reports a "month" of 11 days.
 */

export type MetricSource = "own" | "ga4" | "gsc";

export interface DailyValue {
  readonly metric: string;
  /** `YYYY-MM-DD`. */
  readonly day: string;
  readonly value: number;
}

export interface RunWindow {
  readonly source: MetricSource;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly ok: boolean;
}

export interface ListRow {
  readonly key: string;
  readonly count: number;
}

/** Everything stored for one business and one month. `lists` is keyed `source.dimension`, e.g. `ga4.channel`. */
export interface MonthData {
  readonly start: string;
  readonly end: string;
  readonly daily: readonly DailyValue[];
  readonly runs: readonly RunWindow[];
  readonly lists: Readonly<Record<string, readonly unknown[]>>;
}

/** The share of a month's days that must be covered by successful runs before the month is reported. */
export const COMPLETE_SHARE = 0.9;
const DAY_MS = 86_400_000;

const dayNumber = (day: string): number => Date.parse(`${day}T00:00:00Z`) / DAY_MS;

/** Days of the month that a successful run of `source` covers. */
export function coveredDays(month: MonthData, source: MetricSource): number {
  const first = dayNumber(month.start);
  const last = dayNumber(month.end);
  const covered = new Set<number>();
  for (const run of month.runs) {
    if (run.source !== source || !run.ok) continue;
    for (let day = Math.max(first, dayNumber(run.windowStart)); day <= Math.min(last, dayNumber(run.windowEnd)); day += 1) covered.add(day);
  }
  return covered.size;
}

export function isComplete(month: MonthData, source: MetricSource): boolean {
  const days = dayNumber(month.end) - dayNumber(month.start) + 1;
  return coveredDays(month, source) / days >= COMPLETE_SHARE;
}

const sum = (month: MonthData, metric: string): number => month.daily.filter((row) => row.metric === metric).reduce((total, row) => total + row.value, 0);

const rowSchema = z.object({ key: z.string().trim().min(1).max(300), count: z.number().int().nonnegative() });

/** A stored list as ranked rows. A row that is not `{ key, count }` is dropped, never guessed at. */
export function listRows(month: MonthData, name: string, limit = 10): ListRow[] {
  const rows = month.lists[name] ?? [];
  return rows.flatMap((row) => {
    const parsed = rowSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  }).slice(0, limit);
}

export interface VisitorFigures {
  readonly source: "ga4" | "own";
  readonly visitors: number;
  readonly pageviews: number;
  /** The month before, only when the same source measured it completely. */
  readonly previous: { readonly visitors: number; readonly pageviews: number } | null;
  readonly channels: readonly ListRow[];
  readonly pages: readonly ListRow[];
}

/** Google Analytics when it measured the whole month, else our own site script when it did, else nothing. */
export function visitorFigures(month: MonthData, previous: MonthData): VisitorFigures | null {
  for (const source of ["ga4", "own"] as const) {
    if (!isComplete(month, source)) continue;
    return {
      source,
      visitors: sum(month, `${source}.visitors`),
      pageviews: sum(month, `${source}.pageviews`),
      previous: isComplete(previous, source) ? { visitors: sum(previous, `${source}.visitors`), pageviews: sum(previous, `${source}.pageviews`) } : null,
      channels: listRows(month, `${source}.channel`),
      pages: listRows(month, `${source}.page`),
    };
  }
  return null;
}

export interface SearchConsoleFigures {
  readonly clicks: number;
  readonly impressions: number;
  /** Where the business appeared on average, weighted by impressions; null when there were none. */
  readonly position: number | null;
  readonly previous: { readonly clicks: number; readonly impressions: number } | null;
  readonly queries: readonly ListRow[];
  readonly pages: readonly ListRow[];
}

/** Position cannot be summed or averaged across days: each day counts in proportion to its impressions. */
export function weightedPosition(month: MonthData): number | null {
  const impressions = new Map(month.daily.filter((row) => row.metric === "gsc.impressions").map((row) => [row.day, row.value]));
  let weight = 0;
  let total = 0;
  for (const row of month.daily) {
    if (row.metric !== "gsc.position") continue;
    const shown = impressions.get(row.day) ?? 0;
    weight += shown;
    total += row.value * shown;
  }
  return weight === 0 ? null : total / weight;
}

export function searchConsoleFigures(month: MonthData, previous: MonthData): SearchConsoleFigures | null {
  if (!isComplete(month, "gsc")) return null;
  return {
    clicks: sum(month, "gsc.clicks"),
    impressions: sum(month, "gsc.impressions"),
    position: weightedPosition(month),
    previous: isComplete(previous, "gsc") ? { clicks: sum(previous, "gsc.clicks"), impressions: sum(previous, "gsc.impressions") } : null,
    queries: listRows(month, "gsc.query"),
    pages: listRows(month, "gsc.page"),
  };
}
