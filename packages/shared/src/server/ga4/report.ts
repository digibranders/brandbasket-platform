import { z } from "zod";

/*
 * What we ask the Analytics Data API for and how its answer becomes our own rows. Pure: no network, no database. The numbers
 * land in metric_daily as `ga4.*` and the lists in metric_breakdowns with source `ga4`, in the same shapes the first-party
 * roll-up writes (plan 56), so the Website screen reads either one.
 */

/** The daily numbers, in the order the report asks for them. */
export const GA4_DAILY_METRICS = [
  { ga4: "sessions", metric: "ga4.visits" },
  { ga4: "activeUsers", metric: "ga4.visitors" },
  { ga4: "screenPageViews", metric: "ga4.pageviews" },
  { ga4: "userEngagementDuration", metric: "ga4.engaged_seconds" },
  { ga4: "keyEvents", metric: "ga4.key_events" },
] as const;

export interface DateRange {
  readonly startDate: string;
  readonly endDate: string;
}

export interface Ga4ReportRequest {
  readonly dateRanges: readonly DateRange[];
  readonly dimensions: readonly { readonly name: string }[];
  readonly metrics: readonly { readonly name: string }[];
  readonly orderBys?: readonly { readonly metric: { readonly metricName: string }; readonly desc: true }[];
  readonly limit: number;
}

export function dailyRequest(range: DateRange): Ga4ReportRequest {
  return { dateRanges: [range], dimensions: [{ name: "date" }], metrics: GA4_DAILY_METRICS.map((metric) => ({ name: metric.ga4 })), limit: 400 };
}

export function channelRequest(range: DateRange): Ga4ReportRequest {
  return { dateRanges: [range], dimensions: [{ name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], limit: 50 };
}

export function pageRequest(range: DateRange): Ga4ReportRequest {
  return {
    dateRanges: [range],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit: 10,
  };
}

const reportSchema = z.object({
  rows: z
    .array(z.object({ dimensionValues: z.array(z.object({ value: z.string() })), metricValues: z.array(z.object({ value: z.string() })) }))
    .default([]),
});
export type Ga4Report = z.output<typeof reportSchema>;

export function parseReport(json: unknown): Ga4Report {
  return reportSchema.parse(json);
}

export interface DailyRow {
  readonly metric: string;
  readonly day: string;
  readonly value: number;
}

const isoDay = (compact: string): string => `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;

/**
 * Every metric for every day from `start` to `end`. Google leaves out a day with no activity, and a successful run covers the
 * whole window, so a missing day is a measured zero, as in the first-party roll-up.
 */
export function dailyRows(report: Ga4Report, days: readonly string[]): DailyRow[] {
  const byDay = new Map<string, readonly { readonly value: string }[]>();
  for (const row of report.rows) {
    const compact = row.dimensionValues[0]?.value;
    if (compact !== undefined && /^\d{8}$/.test(compact)) byDay.set(isoDay(compact), row.metricValues);
  }
  return days.flatMap((day) =>
    GA4_DAILY_METRICS.map((metric, index) => {
      const value = Number(byDay.get(day)?.[index]?.value ?? 0);
      return { metric: metric.metric, day, value: Number.isFinite(value) && value >= 0 ? value : 0 };
    }),
  );
}

export type Ga4Channel = "direct" | "search" | "social" | "email" | "ai" | "paid" | "referral";

const CHANNEL_OF_GROUP: Readonly<Record<string, Ga4Channel>> = {
  Direct: "direct",
  "Organic Search": "search",
  "Organic Social": "social",
  "Organic Video": "social",
  "Organic Shopping": "social",
  Email: "email",
  "Paid Search": "paid",
  "Paid Social": "paid",
  "Paid Video": "paid",
  "Paid Shopping": "paid",
  "Paid Other": "paid",
  Display: "paid",
  "Cross-network": "paid",
};

/** A Google channel group in our own channel names. Anything not named here (Referral, Affiliate, SMS, Audio) is another website. */
export function channelOf(group: string): Ga4Channel {
  return CHANNEL_OF_GROUP[group] ?? "referral";
}

/** A type alias, not an interface, so a row is assignable to the `Record<string, unknown>` that metric_breakdowns stores. */
export type ListRow = { readonly key: string; readonly count: number };

const TOP = 10;

const ranked = (counts: Map<string, number>): ListRow[] =>
  [...counts]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP)
    .map(([key, count]) => ({ key, count }));

/** Visits per channel in our own names, biggest first. An empty list is returned empty: the caller leaves it out. */
export function channelList(report: Ga4Report): ListRow[] {
  const counts = new Map<string, number>();
  for (const row of report.rows) {
    const channel = channelOf(row.dimensionValues[0]?.value ?? "");
    counts.set(channel, (counts.get(channel) ?? 0) + (Number(row.metricValues[0]?.value) || 0));
  }
  return ranked(counts);
}

/** The most viewed pages, as paths. A path with a query or a fragment is cut to the path, and Google's "(not set)" is dropped. */
export function pageList(report: Ga4Report): ListRow[] {
  const counts = new Map<string, number>();
  for (const row of report.rows) {
    const raw = row.dimensionValues[0]?.value ?? "";
    const path = raw.split(/[?#]/)[0] ?? "";
    if (!path.startsWith("/") || path.length > 200) continue;
    counts.set(path, (counts.get(path) ?? 0) + (Number(row.metricValues[0]?.value) || 0));
  }
  return ranked(counts);
}
