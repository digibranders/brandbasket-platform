import {
  audienceLabel,
  changeOf,
  channelState,
  daysWithData,
  headlineOf,
  safeLink,
  sumOver,
  totalOver,
  windowsOf,
  ANALYTICS_CHANNELS,
  type AccountDay,
  type Analytics,
  type AnalyticsChannel,
  type ChannelState,
  type PostTotals,
  type Range,
} from "./rules";

/** What the page says about each network: the posting service's state, or that no account of it is connected. */
export type Standing = ChannelState | "not_connected";

export function standingOf(analytics: Analytics, channel: AnalyticsChannel): Standing {
  return analytics.channels.some((one) => one.platform === channel) ? channelState(analytics, channel) : "not_connected";
}

/** The networks in view whose numbers need a new permission, and those still waiting for the first daily check. */
export function noticesFor(analytics: Analytics, scope: readonly AnalyticsChannel[]): { readonly reconnect: readonly AnalyticsChannel[]; readonly waiting: readonly AnalyticsChannel[] } {
  const stand = scope.map((channel) => [channel, standingOf(analytics, channel)] as const);
  return { reconnect: stand.filter(([, s]) => s === "reconnect").map(([c]) => c), waiting: stand.filter(([, s]) => s === "waiting").map(([c]) => c) };
}

export interface Figure {
  readonly label: string;
  readonly value: number;
  /** Whole percent on the period before, or null when that period was not mostly counted. */
  readonly change: number | null;
  readonly note?: string;
}

type Pick = (day: AccountDay) => number | undefined;

/** The days of one account series, summed across the accounts of the networks in view. */
function accountSum(analytics: Analytics, channels: readonly AnalyticsChannel[], days: readonly string[], pick: Pick): number | undefined {
  let total: number | undefined;
  for (const account of analytics.accounts) {
    if (!channels.some((channel) => channel === account.platform)) continue;
    const part = sumOver(account.series, days, pick);
    if (part !== undefined) total = (total ?? 0) + part;
  }
  return total;
}

/** True when at least half the days of the window have a reading on some account in view: only then is a change drawn against it. */
function mostlyCounted(analytics: Analytics, channels: readonly AnalyticsChannel[], days: readonly string[], pick: Pick): boolean {
  return analytics.accounts.some((account) => channels.some((channel) => channel === account.platform) && daysWithData(account.series, days, pick) * 2 >= days.length);
}

function figure(label: string, current: number | undefined, previous: number | undefined, note?: string): Figure[] {
  if (current === undefined) return [];
  const change = changeOf(current, previous);
  return [{ label, value: current, change, ...(note === undefined ? {} : { note }) }];
}

export interface Overview {
  /** Reach, views, likes and comments, shares and saves: each left out when no network in view gives it. */
  readonly figures: readonly Figure[];
  /** Reach by day, only the days that have a reading, so a day with none is not drawn as a drop to zero. */
  readonly reach: { readonly days: readonly string[]; readonly values: readonly number[] };
  readonly google: {
    readonly figures: readonly Figure[];
    readonly views: { readonly days: readonly string[]; readonly values: readonly number[] };
    readonly terms: ReadonlyArray<{ readonly label: string; readonly value: number }>;
  } | null;
}

/** A line of one account number per day, summed over the accounts, for the days that have it. */
function dailyLine(analytics: Analytics, channels: readonly AnalyticsChannel[], days: readonly string[], pick: Pick): { days: string[]; values: number[] } {
  const out = { days: [] as string[], values: [] as number[] };
  for (const day of days) {
    const value = accountSum(analytics, channels, [day], pick);
    if (value !== undefined) {
      out.days.push(day);
      out.values.push(value);
    }
  }
  return out;
}

export function overviewOf(analytics: Analytics, scope: readonly AnalyticsChannel[], range: Range, today: string): Overview {
  const { current, previous } = windowsOf(range, today);
  const social = scope.filter((channel) => channel !== "google" && standingOf(analytics, channel) !== "not_connected" && standingOf(analytics, channel) !== "waiting");
  const posts = analytics.posts.filter((post) => social.some((channel) => channel === post.platform));
  const before = (pick: Pick): boolean => mostlyCounted(analytics, social, previous, pick);
  const reach: Pick = (day) => day.reach;
  const views: Pick = (day) => day.views;
  const figures = [
    ...figure("Reach", accountSum(analytics, social, current, reach), before(reach) ? accountSum(analytics, social, previous, reach) : undefined, "People who saw your posts"),
    ...figure("Views", accountSum(analytics, social, current, views), before(views) ? accountSum(analytics, social, previous, views) : undefined),
    ...figure("Likes and comments", totalOver(posts, current, ["likes", "comments"]), totalOver(posts, previous, ["likes", "comments"])),
    ...figure("Shares and saves", totalOver(posts, current, ["shares", "saves"]), totalOver(posts, previous, ["shares", "saves"])),
  ];
  const googleOn = scope.includes("google") && standingOf(analytics, "google") === "ok";
  const googleAccounts = analytics.accounts.filter((account) => account.platform === "google");
  const gSeries = googleAccounts.flatMap((account) => account.series);
  const gSum = (pick: Pick, window: readonly string[]): number | undefined => (window === previous && daysWithData(gSeries, window, pick) * 2 < window.length ? undefined : sumOver(gSeries, window, pick));
  const google = googleOn
    ? {
        figures: [
          ...figure("Views on Maps and Search", gSum((d) => d.views, current), gSum((d) => d.views, previous)),
          ...figure("Calls", gSum((d) => d.calls, current), gSum((d) => d.calls, previous)),
          ...figure("Directions asked", gSum((d) => d.directions, current), gSum((d) => d.directions, previous)),
          ...figure("Website clicks", gSum((d) => d.websiteClicks, current), gSum((d) => d.websiteClicks, previous)),
        ],
        views: dailyLine(analytics, ["google"], current, views),
        terms: googleAccounts
          .flatMap((account) => account.searchTerms)
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 8)
          .map((term) => ({ label: term.term, value: term.impressions })),
      }
    : null;
  return { figures, reach: dailyLine(analytics, social, current, reach), google };
}

export interface PostRow {
  readonly key: string;
  readonly title: string;
  readonly platform: AnalyticsChannel;
  /** The day it went out, `YYYY-MM-DD`, or null. */
  readonly day: string | null;
  readonly link: string | null;
  readonly totals: PostTotals;
}

/** The posts of the networks in view that give numbers, the most seen first. Google gives none for a post. */
export function postRows(analytics: Analytics, scope: readonly AnalyticsChannel[]): readonly PostRow[] {
  return analytics.posts
    .flatMap((post): PostRow[] => {
      if (post.platform === "google" || post.platform === "linkedin" || !scope.includes(post.platform)) return [];
      const state = standingOf(analytics, post.platform);
      if (state === "unsupported" || state === "not_connected") return [];
      return [{ key: `${post.channel}:${post.postId}`, title: headlineOf(post.caption), platform: post.platform, day: post.postedAt?.slice(0, 10) ?? null, link: safeLink(post.permalink), totals: post.total }];
    })
    .sort((a, b) => (b.totals.reach ?? 0) - (a.totals.reach ?? 0));
}

/** Hashtags worked out from the customer's own posts, the best average reach first. */
export function hashtagRows(analytics: Analytics) {
  return [...analytics.hashtags].sort((a, b) => b.avgReach - a.avgReach);
}

export interface AudienceView {
  readonly status: "ok" | "too_few_followers" | "reconnect" | "none";
  readonly followers: number | null;
  readonly groups: ReadonlyArray<{ readonly title: string; readonly rows: ReadonlyArray<{ readonly label: string; readonly value: number }> }>;
}

export function audienceOf(analytics: Analytics): AudienceView {
  const audience = analytics.audience;
  const groups = [
    ["Age", audience?.age],
    ["Gender", audience?.gender],
    ["Top cities", audience?.city],
    ["Top countries", audience?.country],
  ] as const;
  return {
    status: audience?.status ?? "none",
    followers: audience?.followers ?? null,
    groups: groups.flatMap(([title, rows]) => (rows === undefined || rows.length === 0 ? [] : [{ title, rows: rows.map((row) => ({ label: audienceLabel(row.label), value: row.value })) }])),
  };
}

export const SCOPE_ALL: readonly AnalyticsChannel[] = ANALYTICS_CHANNELS;
