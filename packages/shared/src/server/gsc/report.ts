import { addDays } from "../../lib/calendar/local-date";
import type { DailyRow, ListRow } from "../ga4/report";
import type { SearchAnalyticsRequest, SearchAnalyticsRows } from "./client";

/*
 * What we ask Search Console for and how its answer becomes our own rows. Pure. Daily clicks, impressions and average position
 * land in metric_daily as `gsc.*`; the month's top searches and pages land in metric_breakdowns with source `gsc`, in the same
 * shapes as `own` and `ga4`.
 */

/** shortcut: a fixed lag, upgrade: read the first incomplete date from a dataState "all" answer. Google finishes a day within about 3 days. */
export const FINAL_LAG_DAYS = 3;

export const dailyRequest = (startDate: string, endDate: string): SearchAnalyticsRequest => ({ startDate, endDate, dimensions: ["date"], dataState: "final", rowLimit: 1000, type: "web" });
export const listRequest = (dimension: "query" | "page", startDate: string, endDate: string): SearchAnalyticsRequest => ({ startDate, endDate, dimensions: [dimension], dataState: "final", rowLimit: 10, type: "web" });

/**
 * One row per day asked for. Search Console leaves out a day with no impressions, so inside the window a missing day is a
 * measured zero for clicks and impressions, and has no position (there was nothing to rank).
 */
export function dailyRows(answer: SearchAnalyticsRows, days: readonly string[]): DailyRow[] {
  const byDay = new Map(answer.rows.map((row) => [row.keys[0], row] as const));
  return days.flatMap((day) => {
    const row = byDay.get(day);
    return [
      { metric: "gsc.clicks", day, value: row?.clicks ?? 0 },
      { metric: "gsc.impressions", day, value: row?.impressions ?? 0 },
      ...(row === undefined ? [] : [{ metric: "gsc.position", day, value: row.position }]),
    ];
  });
}

/** The top rows by clicks, as `{ key, count }`. A row with no clicks is not a top search. */
export function topList(answer: SearchAnalyticsRows): ListRow[] {
  return answer.rows.flatMap((row) => {
    const key = row.keys[0]?.trim();
    return key === undefined || key === "" || row.clicks <= 0 ? [] : [{ key, count: Math.round(row.clicks) }];
  });
}

/** The last day Google has finished counting. */
export const finalDay = (today: string): string => addDays(today, -FINAL_LAG_DAYS);
