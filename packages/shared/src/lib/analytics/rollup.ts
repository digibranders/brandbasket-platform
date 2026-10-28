import type { Channel } from "./classify-channel";
import type { Device } from "./device";
import type { HitKind } from "./payload";
import { sessionise } from "./sessionise";

/** One stored hit, as the roll-up reads it. */
export interface RollupHit {
  readonly at: Date;
  readonly kind: HitKind;
  readonly path: string;
  readonly referrerHost: string | null;
  readonly channel: Channel;
  readonly utmCampaign: string | null;
  readonly device: Device;
  readonly country: string | null;
  readonly label: string | null;
  readonly engagedMs: number | null;
  readonly visitorHash: string;
}

export const OWN_DAILY_METRICS = [
  "own.visits",
  "own.visitors",
  "own.pageviews",
  "own.engaged_seconds",
  "own.calls",
  "own.whatsapp",
  "own.emails",
  "own.directions",
  "own.social_taps",
  "own.form_sends",
] as const;
export type OwnDailyMetric = (typeof OWN_DAILY_METRICS)[number];

export interface DailyMetricRow {
  readonly metric: OwnDailyMetric;
  readonly value: number;
}

/**
 * One day's numbers from that day's hits, always every metric (a quiet day is a measured zero). Whether the site was
 * sending at all that day is the caller's to know: it writes these only for days the script was installed. A visit that
 * runs past midnight is counted as two, one on each day, because each day is rolled up from its own hits.
 */
export function dailyMetrics(hits: readonly RollupHit[]): DailyMetricRow[] {
  const count = (kind: HitKind): number => hits.filter((hit) => hit.kind === kind).length;
  const engagedMs = hits.reduce((sum, hit) => sum + (hit.engagedMs ?? 0), 0);
  const values: Record<OwnDailyMetric, number> = {
    "own.visits": sessionise(hits).length,
    "own.visitors": new Set(hits.map((hit) => hit.visitorHash)).size,
    "own.pageviews": count("pageview"),
    "own.engaged_seconds": Math.round(engagedMs / 1000),
    "own.calls": count("call"),
    "own.whatsapp": count("whatsapp"),
    "own.emails": count("email"),
    "own.directions": count("directions"),
    "own.social_taps": count("social"),
    "own.form_sends": count("form"),
  };
  return OWN_DAILY_METRICS.map((metric) => ({ metric, value: values[metric] }));
}

/** What an enquiry is on the website: a call, WhatsApp or email tap, or a form sent. Directions requests are not. */
const ENQUIRY_KINDS: ReadonlySet<HitKind> = new Set<HitKind>(["call", "whatsapp", "email", "form"]);
const TOP = 10;

export interface BreakdownRows {
  /** Visits for channel, referrer, device, country and campaign; page views for page; enquiries for the two enquiry lists. */
  readonly dimension: "channel" | "page" | "referrer" | "device" | "country" | "campaign" | "enquiry_page" | "enquiry_channel";
  readonly rows: readonly { readonly key: string; readonly count: number }[];
}

function top(keys: readonly (string | null)[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const key of keys) if (key !== null) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : 1))
    .slice(0, TOP);
}

/**
 * A month's ranked lists from that month's hits. A visit is described by its first hit (how it arrived, on what device,
 * from which country), and an enquiry by the channel of the visit it happened in. A list with nothing in it is left out,
 * so a missing source (no country headers, no campaigns) shows as absent, not as an empty list.
 */
export function monthlyBreakdowns(hits: readonly RollupHit[]): BreakdownRows[] {
  const visits = sessionise(hits);
  const firsts = visits.map((visit) => visit.hits[0]!);
  const enquiries = visits.flatMap((visit) => visit.hits.filter((hit) => ENQUIRY_KINDS.has(hit.kind)).map((hit) => ({ path: hit.path, channel: visit.hits[0]!.channel })));
  const lists: BreakdownRows[] = [
    { dimension: "channel", rows: top(firsts.map((hit) => hit.channel)) },
    { dimension: "page", rows: top(hits.filter((hit) => hit.kind === "pageview").map((hit) => hit.path)) },
    { dimension: "referrer", rows: top(firsts.map((hit) => hit.referrerHost)) },
    { dimension: "device", rows: top(firsts.map((hit) => hit.device)) },
    { dimension: "country", rows: top(firsts.map((hit) => hit.country)) },
    { dimension: "campaign", rows: top(firsts.map((hit) => hit.utmCampaign)) },
    { dimension: "enquiry_page", rows: top(enquiries.map((enquiry) => enquiry.path)) },
    { dimension: "enquiry_channel", rows: top(enquiries.map((enquiry) => enquiry.channel)) },
  ];
  return lists.filter((list) => list.rows.length > 0);
}

/** What the older server-side route (`site_events`) counted for a day: taps and form sends a site reported itself. */
export interface LegacyEnquiryCounts {
  readonly call: number;
  readonly whatsapp: number;
  readonly form: number;
}

const LEGACY_METRICS: readonly (readonly [OwnDailyMetric, keyof LegacyEnquiryCounts])[] = [
  ["own.calls", "call"],
  ["own.whatsapp", "whatsapp"],
  ["own.form_sends", "form"],
];

/**
 * A site that sends its own call, WhatsApp or form events to the older server route, and may also run the script. For
 * each of the three, the script's count is used when it saw any, and the older count only when it saw none. The two are
 * never added: a site that reports both ways would be counted twice. (Sites we build mark their forms as server-counted,
 * so the script sends none and the server's count is used.)
 */
export function mergeLegacyEvents(rows: readonly DailyMetricRow[], legacy: LegacyEnquiryCounts): DailyMetricRow[] {
  return rows.map((row) => {
    const source = LEGACY_METRICS.find(([metric]) => metric === row.metric)?.[1];
    return source !== undefined && row.value === 0 && legacy[source] > 0 ? { metric: row.metric, value: legacy[source] } : row;
  });
}

/**
 * For a day on a site that never ran the script: only the three enquiry numbers, and only when the older route counted
 * something. Without the script nothing else was measured, and a day with no events at all is unmeasured, not zero.
 */
export function legacyEnquiryMetrics(legacy: LegacyEnquiryCounts): DailyMetricRow[] {
  if (legacy.call + legacy.whatsapp + legacy.form === 0) return [];
  return LEGACY_METRICS.map(([metric, source]) => ({ metric, value: legacy[source] }));
}
