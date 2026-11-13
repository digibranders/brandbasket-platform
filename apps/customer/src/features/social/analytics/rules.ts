import { z } from "zod";

/*
 * How the posts and accounts of one brand did, as the posting service gives it (`GET /api/v1/analytics`). A number a network
 * does not give is absent, never zero, and the screen leaves it out or says "Not given". LinkedIn is not offered. Days are UTC
 * calendar days, which is how the networks count them.
 */

export const PLATFORMS = ["instagram", "facebook", "google", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];
const platformSchema = z.enum(PLATFORMS);
const count = z.number().finite().nonnegative().optional();

/** The networks analytics is offered for. LinkedIn gives almost nothing about personal profiles. */
export const ANALYTICS_CHANNELS = ["instagram", "facebook", "google"] as const;
export type AnalyticsChannel = (typeof ANALYTICS_CHANNELS)[number];
export const CHANNEL_NAMES: Readonly<Record<Platform, string>> = { instagram: "Instagram", facebook: "Facebook", google: "Google Business", linkedin: "LinkedIn" };

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
export const DEFAULT_RANGE: Range = 30;

export const CHANNEL_STATES = ["ok", "waiting", "reconnect", "unsupported"] as const;
export type ChannelState = (typeof CHANNEL_STATES)[number];

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const postNumbers = { reach: count, views: count, likes: count, comments: count, shares: count, saves: count, clicks: count };
const totalSchema = z.object(postNumbers).default({});
const postDaySchema = z.object({ date: dateOnly, ...postNumbers });
const accountDaySchema = z.object({ date: dateOnly, reach: count, views: count, profileViews: count, followers: count, calls: count, directions: count, websiteClicks: count });
const labelled = z.array(z.object({ label: z.string().min(1), value: z.number().finite().nonnegative() }));

/** A list that keeps the entries that read and drops the ones that do not, so one odd day cannot hide a whole post. */
const lenient = <T>(schema: z.ZodType<T>) =>
  z
    .array(z.unknown())
    .default([])
    .transform((items): T[] =>
      items.flatMap((item) => {
        const one = schema.safeParse(item);
        return one.success ? [one.data] : [];
      }),
    );

/** One row for each connected account: `channel` is the account's own id (such as `instagram:1`), `platform` the network. */
const channelItem = z.object({ channel: z.string().min(1), platform: platformSchema, label: z.string().nullish(), status: z.enum(CHANNEL_STATES), lastCheckedAt: z.string().nullish() });
const postItem = z.object({
  postId: z.string().min(1),
  channel: z.string().min(1),
  platform: platformSchema,
  permalink: z.string().nullish(),
  postedAt: z.string().nullish(),
  caption: z.string().nullish(),
  total: totalSchema,
  series: lenient(postDaySchema),
});
const termItem = z.object({ term: z.string().min(1), impressions: z.number().finite().nonnegative() });
const accountItem = z.object({ channel: z.string().min(1), platform: platformSchema, label: z.string().nullish(), series: lenient(accountDaySchema), searchTerms: lenient(termItem), needs: z.array(z.string()).default([]) });
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

const answerSchema = z.object({
  checkedAt: z.string().nullish(),
  channels: z.array(channelItem),
  posts: z.array(postItem),
  accounts: z.array(accountItem),
  audience: audienceSchema.optional(),
  hashtags: z.array(hashtagItem),
});

export type Analytics = z.output<typeof answerSchema>;
export type AnalyticsPost = Analytics["posts"][number];
export type AccountDay = Analytics["accounts"][number]["series"][number];
export type PostTotals = Readonly<Partial<Record<"reach" | "views" | "likes" | "comments" | "shares" | "saves" | "clicks", number>>>;

/** The numbers of an analytics answer, or null when it is not one. Entries that do not read are dropped. */
export function readAnalytics(body: unknown): Analytics | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  const list = <T>(key: string, schema: z.ZodType<T>): T[] =>
    Array.isArray(raw[key])
      ? (raw[key] as unknown[]).flatMap((item) => {
          const one = schema.safeParse(item);
          return one.success ? [one.data] : [];
        })
      : [];
  const audienceBody = raw["audience"];
  const audience = audienceSchema.safeParse(typeof audienceBody === "object" && audienceBody !== null ? (audienceBody as Record<string, unknown>)["instagram"] : undefined);
  const parsed = answerSchema.safeParse({
    checkedAt: raw["checkedAt"],
    channels: list("channels", channelItem),
    posts: list("posts", postItem),
    accounts: list("accounts", accountItem),
    ...(audience.success ? { audience: audience.data } : {}),
    hashtags: list("hashtags", hashtagItem),
  });
  return parsed.success ? parsed.data : null;
}

const MS_DAY = 86_400_000;
const dayMs = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const isoOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Today as a UTC day, `YYYY-MM-DD`. */
export const utcToday = (now: Date): string => now.toISOString().slice(0, 10);

/** The days of the range ending `today` (oldest first), and of the range just before it, for the change on the period before. */
export function windowsOf(range: Range, today: string): { readonly from: string; readonly current: readonly string[]; readonly previous: readonly string[] } {
  const end = dayMs(today);
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

/** How many of the days have a reading, so a change is only drawn against a period that was mostly counted. */
export function daysWithData<T extends { readonly date: string }>(series: readonly T[], days: readonly string[], pick: (day: T) => number | undefined): number {
  const wanted = new Set(days);
  return new Set(series.filter((day) => wanted.has(day.date) && pick(day) !== undefined).map((day) => day.date)).size;
}

/** The change on the period before, as whole percent, or null when there is nothing to compare with. */
export function changeOf(current: number | undefined, previous: number | undefined): number | null {
  if (current === undefined || previous === undefined || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** The sum of the totals of the posts that went out on the days given (a post is counted on the day it went out). */
export function totalOver(posts: readonly AnalyticsPost[], days: readonly string[], keys: ReadonlyArray<keyof PostTotals>): number | undefined {
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

/** Where a network stands across the accounts connected on it: any needing permission first, then any giving numbers. One not listed is waiting. */
export function channelState(analytics: Analytics, platform: Platform): ChannelState {
  const states = analytics.channels.filter((one) => one.platform === platform).map((one) => one.status);
  for (const state of ["reconnect", "ok", "waiting", "unsupported"] as const) if (states.includes(state)) return state;
  return "waiting";
}

/** Plain words for the labels Instagram gives: F and M become Women and Men, and an age band reads "25 to 34". */
export function audienceLabel(label: string): string {
  const words: Readonly<Record<string, string>> = { F: "Women", M: "Men", U: "Not said" };
  return words[label] ?? label.replace(/^(\d+)\s*[-\u2013]\s*(\d+)$/, "$1 to $2").replace(/^(\d+)\+$/, "$1 and over");
}

/** The first line of a caption, kept short, as the name of a post. */
export function headlineOf(caption: string | null | undefined): string {
  const line = (caption ?? "").split("\n")[0]?.trim() ?? "";
  if (line === "") return "Post";
  return line.length > 70 ? `${line.slice(0, 67)}...` : line;
}

/** Only a plain https address is a link to a post. */
export const safeLink = (value: string | null | undefined): string | null => (typeof value === "string" && value.startsWith("https://") ? value : null);

type Param = string | readonly string[] | undefined;
const firstOf = (value: Param): string | undefined => (typeof value === "string" ? value : value?.[0]);

/** The range in the address when it is one we offer, else 30 days. */
export const rangeFrom = (value: Param): Range => RANGES.find((range) => String(range) === firstOf(value)) ?? DEFAULT_RANGE;
/** The channel in the address when it is one we have numbers for, else all. */
export const channelFrom = (value: Param): "all" | AnalyticsChannel => ANALYTICS_CHANNELS.find((channel) => channel === firstOf(value)) ?? "all";

/** The posting service's address and key, or null when this server has none: the Analytics tab is then not drawn. Read straight from the environment so a page without them still renders. */
export function postingServiceSettings(env: Readonly<Record<string, string | undefined>>): { readonly url: string; readonly key: string } | null {
  const url = z.url({ protocol: /^https?$/ }).safeParse(env["SOCIAL_AUTO_URL"]);
  const key = env["SOCIAL_AUTO_KEY"];
  if (!url.success || key === undefined || key.trim() === "") return null;
  return { url: new URL(url.data).origin, key: key.trim() };
}
