import { z } from "zod";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "./auto";

/**
 * How the posts and accounts of one brand did, as social-auto gives it (`GET /api/v1/analytics`). A number a network does not give is
 * absent, never zero, and this page shows it as "not given". LinkedIn is not offered.
 */

const platformSchema = z.enum(CHANNEL_PLATFORMS);
const count = z.number().finite().nonnegative().optional();

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const postNumbers = { reach: count, views: count, likes: count, comments: count, shares: count, saves: count, clicks: count };
const totalSchema = z.object(postNumbers).default({});
const postDaySchema = z.object({ date: dateOnly, ...postNumbers });
const accountDaySchema = z.object({ date: dateOnly, reach: count, views: count, profileViews: count, followers: count, calls: count, directions: count, websiteClicks: count });
const labelled = z.array(z.object({ label: z.string().min(1), value: z.number().finite().nonnegative() }));

export const CHANNEL_STATES = ["ok", "waiting", "reconnect", "unsupported"] as const;
export type ChannelState = (typeof CHANNEL_STATES)[number];

/** A list that keeps the entries that read and drops the ones that do not, so one odd day cannot hide a whole post. */
const days = <T>(schema: z.ZodType<T>) =>
  z
    .array(z.unknown())
    .default([])
    .transform((items): T[] => items.flatMap((item) => { const one = schema.safeParse(item); return one.success ? [one.data] : []; }));

/** One row for each connected account: `channel` is the account's own id (such as `instagram:1`), `platform` the network. */
const channelItem = z.object({ channel: z.string().min(1), platform: platformSchema, label: z.string().nullish(), status: z.enum(CHANNEL_STATES), lastCheckedAt: z.string().nullish() });
const postItem = z.object({ postId: z.string().min(1), channel: z.string().min(1), platform: platformSchema, permalink: z.string().nullish(), postedAt: z.string().nullish(), caption: z.string().nullish(), total: totalSchema, series: days(postDaySchema) });
const termItem = z.object({ term: z.string().min(1), impressions: z.number().finite().nonnegative() });
const accountItem = z.object({ channel: z.string().min(1), platform: platformSchema, label: z.string().nullish(), series: days(accountDaySchema), searchTerms: days(termItem), needs: z.array(z.string()).default([]) });
const hashtagItem = z.object({ tag: z.string().min(1), posts: z.number().int().nonnegative(), avgReach: z.number().finite().nonnegative() });
/** Who follows the first Instagram account: the numbers, or why there are none. */
const audienceSchema = z.object({
  status: z.enum(["ok", "too_few_followers", "reconnect", "none"]),
  followers: z.number().finite().nonnegative().nullish(),
  age: labelled.optional(),
  gender: labelled.optional(),
  country: labelled.optional(),
  city: labelled.optional(),
});

const rawSchema = z.object({
  checkedAt: z.string().nullish(),
  channels: z.array(channelItem),
  posts: z.array(postItem),
  accounts: z.array(accountItem),
  audience: audienceSchema.optional(),
  hashtags: z.array(hashtagItem),
});

export type PostDay = z.output<typeof postDaySchema>;
export type AccountDay = z.output<typeof accountDaySchema>;
export type Analytics = z.output<typeof rawSchema>;

/** The numbers of an analytics answer, or null when it is not one. Entries that do not read are dropped, so one odd post cannot hide the rest. */
export function readAnalytics(body: unknown): Analytics | null {
  const raw = body as Record<string, unknown> | null;
  if (typeof raw !== "object" || raw === null) return null;
  const list = <T>(key: string, schema: z.ZodType<T>): T[] => (Array.isArray(raw[key]) ? (raw[key] as unknown[]).flatMap((item) => { const one = schema.safeParse(item); return one.success ? [one.data] : []; }) : []);
  const audienceBody = raw["audience"];
  const audience = audienceSchema.safeParse(typeof audienceBody === "object" && audienceBody !== null ? (audienceBody as Record<string, unknown>)["instagram"] : undefined);
  const parsed = rawSchema.safeParse({
    checkedAt: raw["checkedAt"],
    channels: list("channels", channelItem),
    posts: list("posts", postItem),
    accounts: list("accounts", accountItem),
    ...(audience.success ? { audience: audience.data } : {}),
    hashtags: list("hashtags", hashtagItem),
  });
  return parsed.success ? parsed.data : null;
}

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const isRange = (value: unknown): value is Range => RANGES.some((range) => range === value);

/** The channels analytics is offered for. LinkedIn is not. */
export const ANALYTICS_CHANNELS = ["instagram", "facebook", "google"] as const satisfies readonly ChannelPlatform[];
export type AnalyticsChannel = (typeof ANALYTICS_CHANNELS)[number];
export const isAnalyticsChannel = (value: unknown): value is AnalyticsChannel => ANALYTICS_CHANNELS.some((channel) => channel === value);

export const ANALYTICS_TABS = ["overview", "posts", "hashtags", "audience", "reports"] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];
export const isAnalyticsTab = (value: unknown): value is AnalyticsTab => ANALYTICS_TABS.some((tab) => tab === value);

const MS_DAY = 86_400_000;
const dayOf = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The days of the range ending `today` (oldest first), and of the range just before it, for the change on the period before. */
export function windowsOf(range: Range, today: string): { readonly from: string; readonly current: readonly string[]; readonly previous: readonly string[] } {
  const end = dayOf(today);
  const days = (offset: number): string[] => Array.from({ length: range }, (_, index) => isoOf(end - (offset + range - 1 - index) * MS_DAY));
  const previous = days(range);
  return { from: previous[0] ?? today, current: days(0), previous };
}

/** The sum of one number over the days given. Undefined when no day has it, since the network does not give it. */
export function sumOver<T extends { readonly date: string }>(series: readonly T[], days: readonly string[], pick: (day: T) => number | undefined): number | undefined {
  const wanted = new Set(days);
  let total: number | undefined;
  for (const day of series) {
    if (!wanted.has(day.date)) continue;
    const value = pick(day);
    if (value !== undefined) total = (total ?? 0) + value;
  }
  return total;
}

/** One value for each day. A day the network gave nothing for is null, so a line shows a gap, not a drop to zero. */
export function perDay<T extends { readonly date: string }>(series: readonly T[], days: readonly string[], pick: (day: T) => number | undefined): Array<number | null> {
  const byDay = new Map<string, number>();
  for (const day of series) {
    const value = pick(day);
    if (value !== undefined) byDay.set(day.date, value);
  }
  return days.map((day) => byDay.get(day) ?? null);
}

/** How many of the days have a reading, so a change is only drawn against a period that was mostly counted. */
export function daysWithData<T extends { readonly date: string }>(series: readonly T[], days: readonly string[], pick: (day: T) => number | undefined): number {
  const wanted = new Set(days);
  return new Set(series.filter((day) => wanted.has(day.date) && pick(day) !== undefined).map((day) => day.date)).size;
}

/** Plain words for the labels Instagram gives: F and M become Women and Men, and an age band reads "25 to 34". */
export function audienceLabel(label: string): string {
  const map: Record<string, string> = { F: "Women", M: "Men", U: "Not said" };
  return map[label] ?? label.replace(/^(\d+)\s*[-\u2013]\s*(\d+)$/, "$1 to $2").replace(/^(\d+)\+$/, "$1 and over");
}

/** The change on the period before, as whole percent, or null when there is nothing to compare with. */
export function changeOf(current: number | undefined, previous: number | undefined): number | null {
  if (current === undefined || previous === undefined || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** What one post did since it went out, as the posting service totals it. A number the network does not give is absent. */
export type PostTotals = Readonly<Partial<Record<"reach" | "views" | "likes" | "comments" | "shares" | "saves" | "clicks", number>>>;

/** The sum of one total over the posts that went out on the days given (a post is counted on the day it went out), or undefined when none gives it. */
export function totalOver(posts: readonly Analytics["posts"][number][], days: readonly string[], keys: ReadonlyArray<keyof PostTotals>): number | undefined {
  const wanted = new Set(days);
  let sum: number | undefined;
  for (const post of posts) {
    if (post.postedAt === undefined || post.postedAt === null || !wanted.has(post.postedAt.slice(0, 10))) continue;
    for (const key of keys) {
      const value = post.total[key];
      if (value !== undefined) sum = (sum ?? 0) + value;
    }
  }
  return sum;
}

/** Where a network stands across the accounts connected on it: any needing permission first, then any giving numbers; one the answer does not list is waiting for its first check. */
export function channelState(analytics: Analytics, platform: AnalyticsChannel): ChannelState {
  const states = analytics.channels.filter((one) => one.platform === platform).map((one) => one.status);
  for (const state of ["reconnect", "ok", "waiting", "unsupported"] as const) if (states.includes(state)) return state;
  return "waiting";
}

type Param = string | readonly string[] | undefined;
const firstOf = (value: Param): string | undefined => (typeof value === "string" ? value : value?.[0]);

/** The range in the address when it is one we offer, else 30 days. */
export const rangeFrom = (value: Param): Range => RANGES.find((range) => String(range) === firstOf(value)) ?? 30;
/** The channel in the address when it is one we have numbers for, else all. */
export const channelFrom = (value: Param): "all" | AnalyticsChannel => ANALYTICS_CHANNELS.find((channel) => channel === firstOf(value)) ?? "all";
/** The tab in the address when it is one of ours, else the overview. */
export const tabFrom = (value: Param): AnalyticsTab => {
  const tab = firstOf(value);
  return isAnalyticsTab(tab) ? tab : "overview";
};
