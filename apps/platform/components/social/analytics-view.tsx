import { ChartLineUp, Clock, Hash, Images, UsersThree, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactElement } from "react";
import { connectChannelAction } from "@/app/app-host/(protected)/social/actions";
import { PageFrame } from "@/components/v2/page";
import { LIFT, SECTION_TITLE } from "@/components/v2/classes";
import { cn } from "@brandbasket/shared/lib/cn";
import type { SocialAnalytics } from "@/lib/server/social-analytics";
import { ANALYTICS_CHANNELS, ANALYTICS_TABS, isAnalyticsChannel, changeOf, channelState, daysWithData, perDay, audienceLabel, RANGES, sumOver, totalOver, type AnalyticsChannel, type AnalyticsTab, type Analytics, type ChannelState, type PostTotals, type Range } from "@/lib/social/analytics";
import { dayLabel, PLATFORM_NAMES, type ChannelPlatform } from "@/lib/social/auto";
import { AnalyticsChart, type ChartLine } from "./analytics-chart";
import { BrandSwitcher } from "./brand-switcher";
import { AnalyticsChannels, type AnalyticsChannelRow } from "./analytics-channels";
import { ChannelLogo } from "./channel-logo";
import { SMALL_DARK, SMALL_SOFT } from "./small-buttons";
import { SocialTabs } from "./social-tabs";

const NUMBER = new Intl.NumberFormat("en-IN");
const fmt = (value: number): string => NUMBER.format(Math.round(value));
const TAB_NAMES: Readonly<Record<AnalyticsTab, string>> = { overview: "Overview", posts: "Posts", hashtags: "Hashtags", audience: "Audience", reports: "Reports" };
const COLORS: Readonly<Record<AnalyticsChannel, string>> = { instagram: "#d62976", facebook: "#1877f2", google: "#2d69ea" };

interface Params {
  readonly base: string;
  readonly range: Range;
  readonly channel: "all" | AnalyticsChannel;
  readonly tab: AnalyticsTab;
}

const href = (current: Params, change: Partial<Params>): string => {
  const next = { ...current, ...change };
  return `${current.base}?${new URLSearchParams({ range: String(next.range), channel: next.channel, tab: next.tab })}`;
};

/** Where one channel stands for this brand: not connected, or what the posting service says. */
type Standing = ChannelState | "not_connected";

function standingOf(analytics: Analytics | null, connected: readonly ChannelPlatform[], channel: AnalyticsChannel): Standing {
  if (!connected.includes(channel)) return "not_connected";
  return analytics === null ? "waiting" : channelState(analytics, channel);
}

const STANDING_WORDS: Readonly<Record<Standing, string>> = { ok: "Numbers on", waiting: "Waiting for the first check", reconnect: "Reconnect to see numbers", unsupported: "No numbers for this network", not_connected: "Not connected" };

function Delta({ change }: { readonly change: number | null }): ReactElement {
  if (change === null) return <span className="text-xs font-semibold text-ink-3">Nothing to compare yet</span>;
  return <span className={cn("text-xs font-semibold", change > 1 ? "text-ok" : change < -1 ? "text-error" : "text-ink-3")}>{change > 1 || change < -1 ? `${change > 0 ? "+" : ""}${change}% on the period before` : "About the same as the period before"}</span>;
}

function Kpi({ label, value, change, note }: { readonly label: string; readonly value: number | undefined; readonly change: number | null; readonly note?: string }): ReactElement | null {
  if (value === undefined) return null;
  return (
    <div className={cn(LIFT, "grid gap-0.5 p-4")}>
      <span className="text-xs font-semibold text-ink-3">{label}</span>
      <span className="font-display text-[1.625rem] font-bold leading-tight tabular-nums text-ink">{fmt(value)}</span>
      <Delta change={change} />
      {note === undefined ? null : <span className="text-[0.6875rem] text-ink-3">{note}</span>}
    </div>
  );
}

function Notice({ children, action }: { readonly children: React.ReactNode; readonly action?: ReactElement | null }): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warn-wash px-4 py-3 text-[0.84375rem] font-semibold text-warn">
      <span className="min-w-0">{children}</span>
      {action ?? null}
    </div>
  );
}

function ReconnectButton({ channel }: { readonly channel: ChannelPlatform }): ReactElement {
  return (
    <form action={connectChannelAction}>
      <input type="hidden" name="channel" value={channel} />
      <button type="submit" className={SMALL_DARK}>
        Reconnect {PLATFORM_NAMES[channel]}
      </button>
    </form>
  );
}

function Empty({ title, children }: { readonly title: string; readonly children: React.ReactNode }): ReactElement {
  return (
    <div className={cn(LIFT, "grid gap-2 p-5")}>
      <h2 className={SECTION_TITLE}>{title}</h2>
      <div className="text-[0.84375rem] leading-relaxed text-ink-2">{children}</div>
    </div>
  );
}

const GHOST_TILES = ["Reach", "Views", "Likes and comments", "Shares and saves"] as const;

/** What the page shows before any number exists: what is coming and when, with the tiles drawn empty, so it never looks broken. */
function Waiting({ unavailable }: { readonly unavailable: boolean }): ReactElement {
  const Icon = unavailable ? WarningCircle : ChartLineUp;
  return (
    <div className="grid gap-4">
      <div className={cn(LIFT, "flex flex-wrap items-center gap-4 p-5")}>
        <span aria-hidden="true" className={cn("grid size-12 shrink-0 place-items-center rounded-full", unavailable ? "bg-warn-wash text-warn" : "bg-ok-wash text-ok")}>
          <Icon size={24} weight="duotone" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-display text-[1rem] font-semibold text-ink">{unavailable ? "The numbers are not available just now" : "Your numbers start tomorrow morning"}</h2>
          <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">{unavailable ? "We could not reach the posting service. Try again in a few minutes." : "We ask each network once a day how your posts did. Your first numbers show here after the first daily check."}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]" aria-hidden="true">
        {GHOST_TILES.map((label) => (
          <div key={label} className="grid gap-1 rounded-2xl border border-dashed border-line bg-surface/60 p-4">
            <span className="text-xs font-semibold text-ink-3">{label}</span>
            <span className="font-display text-[1.625rem] font-bold leading-tight text-ink-3/50">--</span>
            <span className="h-2 w-24 rounded-full bg-sunken" />
          </div>
        ))}
      </div>
      <div className="grid gap-3 rounded-2xl border border-dashed border-line bg-surface/60 p-5" aria-hidden="true">
        <span className="text-[0.84375rem] font-semibold text-ink-3">Reach by day</span>
        <svg viewBox="0 0 600 120" role="presentation" className="h-28 w-full">
          {[20, 50, 80, 110].map((y) => (
            <line key={y} x1="0" x2="600" y1={y} y2={y} stroke="currentColor" strokeOpacity="0.12" strokeDasharray="4 6" className="text-ink" />
          ))}
          <path d="M0 90 C80 80 120 40 200 55 S330 100 400 60 S520 30 600 45" fill="none" stroke="currentColor" strokeOpacity="0.18" strokeWidth="3" strokeLinecap="round" className="text-ink" />
        </svg>
      </div>
    </div>
  );
}

const UNAVAILABLE_TEXT = "We could not reach the posting service. Try again in a few minutes.";

/** A tab with nothing to show yet: an icon, what is coming and when, and the shape of what will fill it drawn empty, so it never looks broken. */
function Placeholder({ icon: Icon, title, children, unavailable = false, ghost = "rows", note }: { readonly icon: typeof Clock; readonly title: string; readonly children: React.ReactNode; readonly unavailable?: boolean; readonly ghost?: "rows" | "bars" | "none"; readonly note?: ReactElement | null }): ReactElement {
  const Shown = unavailable ? WarningCircle : Icon;
  return (
    <div className={cn(LIFT, "grid gap-5 p-6")}>
      <div className="flex flex-wrap items-center gap-4">
        <span aria-hidden="true" className={cn("grid size-12 shrink-0 place-items-center rounded-full", unavailable ? "bg-warn-wash text-warn" : "bg-ok-wash text-ok")}>
          <Shown size={24} weight="duotone" />
        </span>
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="font-display text-[1rem] font-semibold text-ink">{unavailable ? "The numbers are not available just now" : title}</h2>
          <p className="mt-1 text-[0.84375rem] leading-relaxed text-ink-2">{unavailable ? UNAVAILABLE_TEXT : children}</p>
        </div>
      </div>
      {note ?? null}
      {ghost === "none" ? null : (
        <div aria-hidden="true" className="grid gap-2.5 rounded-xl border border-dashed border-line p-4">
          {[88, 64, 46, 30].map((width, index) =>
            ghost === "bars" ? (
              <div key={width} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
                <span className="h-2.5 w-16 rounded-full bg-sunken" />
                <span className="h-2.5 rounded-full bg-sunken" style={{ width: `${width}%` }} />
              </div>
            ) : (
              <div key={width} className="grid grid-cols-[minmax(0,1fr)_3rem_3rem_3rem] items-center gap-3">
                <span className="h-2.5 rounded-full bg-sunken" style={{ width: `${width + (index % 2) * 8}%` }} />
                <span className="h-2.5 rounded-full bg-sunken" />
                <span className="h-2.5 rounded-full bg-sunken" />
                <span className="h-2.5 rounded-full bg-sunken" />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** What each channel in view needs from the customer or from time, as notices. Channels that are fine say nothing. */
function Notices({ standings, scope }: { readonly standings: Readonly<Record<AnalyticsChannel, Standing>>; readonly scope: readonly AnalyticsChannel[] }): ReactElement | null {
  const reconnect = scope.filter((channel) => standings[channel] === "reconnect");
  const waiting = scope.filter((channel) => standings[channel] === "waiting");
  if (reconnect.length === 0 && waiting.length === 0) return null;
  return (
    <div className="grid gap-2">
      {reconnect.length === 0 ? null : (
        <Notice
          action={
            <div className="flex flex-wrap gap-2">
              {reconnect.map((channel) => (
                <ReconnectButton key={channel} channel={channel} />
              ))}
            </div>
          }
        >
          Reconnect your {reconnect.map((channel) => PLATFORM_NAMES[channel]).join(" and ")} {reconnect.length > 1 ? "accounts" : "account"} to see numbers. We now ask the network for permission to read how your posts did, so please press Allow once more.
        </Notice>
      )}
      {waiting.length === 0 ? null : (
        <div className="rounded-xl bg-info-wash px-4 py-3 text-[0.84375rem] font-semibold text-info">
          Numbers for {waiting.map((channel) => PLATFORM_NAMES[channel]).join(" and ")} appear after the first daily check. We ask each network once a day, so your first numbers show tomorrow morning.
        </div>
      )}
    </div>
  );
}

function pointsOf(analytics: Analytics, channel: AnalyticsChannel, days: readonly string[], pick: (day: Analytics["accounts"][number]["series"][number]) => number | undefined): Array<number | null> {
  const series = analytics.accounts.find((account) => account.platform === channel)?.series ?? [];
  return perDay(series, days, pick);
}

function accountSum(analytics: Analytics, channels: readonly AnalyticsChannel[], days: readonly string[], pick: (day: Analytics["accounts"][number]["series"][number]) => number | undefined): number | undefined {
  let total: number | undefined;
  for (const channel of channels) {
    for (const account of analytics.accounts.filter((one) => one.platform === channel)) {
      const part = sumOver(account.series, days, pick);
      if (part !== undefined) total = (total ?? 0) + part;
    }
  }
  return total;
}

function postSum(analytics: Analytics, channels: readonly AnalyticsChannel[], days: readonly string[], keys: ReadonlyArray<keyof PostTotals>): number | undefined {
  return totalOver(analytics.posts.filter((post) => channels.some((channel) => channel === post.platform)), days, keys);
}

function Overview({ social, scope, standings }: { readonly social: SocialAnalytics; readonly scope: readonly AnalyticsChannel[]; readonly standings: Readonly<Record<AnalyticsChannel, Standing>> }): ReactElement {
  const analytics = social.analytics;
  if (analytics === null) return <Waiting unavailable={social.unavailable} />;
  const { current: days, previous } = social.days;
  const social2 = scope.filter((channel) => channel !== "google" && standings[channel] === "ok");
  const showGoogle = scope.includes("google") && standings.google === "ok";
  const nothing = social2.length === 0 && !showGoogle;
  const lines: ChartLine[] = social2.map((channel) => ({ key: channel, label: PLATFORM_NAMES[channel], color: COLORS[channel], data: pointsOf(analytics, channel, days, (day) => day.reach) }));
  const reach = accountSum(analytics, social2, days, (day) => day.reach);
  const counted = (window: readonly string[], pick: (day: Analytics["accounts"][number]["series"][number]) => number | undefined): boolean => social2.some((channel) => analytics.accounts.some((account) => account.platform === channel && daysWithData(account.series, window, pick) * 2 >= window.length));
  const reachBefore = counted(previous, (day) => day.reach) ? accountSum(analytics, social2, previous, (day) => day.reach) : undefined;
  const views = accountSum(analytics, social2, days, (day) => day.views);
  const viewsBefore = counted(previous, (day) => day.views) ? accountSum(analytics, social2, previous, (day) => day.views) : undefined;
  const talk = postSum(analytics, social2, days, ["likes", "comments"]);
  const talkBefore = postSum(analytics, social2, previous, ["likes", "comments"]);
  const spread = postSum(analytics, social2, days, ["shares", "saves"]);
  const spreadBefore = postSum(analytics, social2, previous, ["shares", "saves"]);
  const googleAccounts = analytics.accounts.filter((account) => account.platform === "google");
  const gSeries = googleAccounts.flatMap((account) => account.series);
  const searchTerms = googleAccounts.flatMap((account) => account.searchTerms).sort((a, b) => b.impressions - a.impressions).slice(0, 8);
  const gViews = sumOver(gSeries, days, (day) => day.views);
  const gSum = (pick: (day: (typeof gSeries)[number]) => number | undefined, window: readonly string[]): number | undefined => (window === previous && daysWithData(gSeries, window, pick) * 2 < window.length ? undefined : sumOver(gSeries, window, pick));
  return (
    <div className="grid gap-4">
      <Notices standings={standings} scope={scope} />
      {nothing ? <Waiting unavailable={false} /> : null}
      {social2.length === 0 ? null : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            <Kpi label="Reach" value={reach} change={changeOf(reach, reachBefore)} note="People who saw your posts" />
            <Kpi label="Views" value={views} change={changeOf(views, viewsBefore)} note="Instagram gives views" />
            <Kpi label="Likes and comments" value={talk} change={changeOf(talk, talkBefore)} />
            <Kpi label="Shares and saves" value={spread} change={changeOf(spread, spreadBefore)} note="Saves are Instagram only" />
          </div>
          <div className={cn(LIFT, "grid gap-3 p-5")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className={SECTION_TITLE}>Reach by day</h2>
              <ul className="flex flex-wrap gap-3 text-xs text-ink-2">
                {lines.map((line) => (
                  <li key={line.key} className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: line.color }} />
                    {line.label}
                  </li>
                ))}
              </ul>
            </div>
            <AnalyticsChart lines={lines} days={days} label="Reach by day" />
          </div>
        </>
      )}
      {!showGoogle ? null : (
        <div className={cn(LIFT, "grid gap-3 p-5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={SECTION_TITLE}>Your Google listing</h2>
            <span className="text-xs text-ink-3">Numbers for the whole listing. Google does not give numbers for each post or about who looks.</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
            <Kpi label="Views on Maps and Search" value={gViews} change={changeOf(gViews, gSum((day) => day.views, previous))} />
            <Kpi label="Calls" value={gSum((day) => day.calls, days)} change={changeOf(gSum((day) => day.calls, days), gSum((day) => day.calls, previous))} />
            <Kpi label="Directions asked" value={gSum((day) => day.directions, days)} change={changeOf(gSum((day) => day.directions, days), gSum((day) => day.directions, previous))} />
            <Kpi label="Website clicks" value={gSum((day) => day.websiteClicks, days)} change={changeOf(gSum((day) => day.websiteClicks, days), gSum((day) => day.websiteClicks, previous))} />
          </div>
          <AnalyticsChart lines={[{ key: "google", label: "Google Business", color: COLORS.google, data: pointsOf(analytics, "google", days, (day) => day.views) }]} days={days} label="Views of your Google listing by day" />
          {searchTerms.length === 0 ? null : (
            <div className="grid gap-2">
              <h3 className="font-display text-[0.84375rem] font-semibold text-ink">What people searched to find you</h3>
              <Bars rows={searchTerms.map((term) => ({ label: term.term, value: term.impressions }))} unit="" wide />
              <p className="text-xs text-ink-3">Google shows search terms month by month.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Bars({ rows, unit = "%", wide = false }: { readonly rows: ReadonlyArray<{ readonly label: string; readonly value: number }>; readonly unit?: string; readonly wide?: boolean }): ReactElement {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.label} className={cn("grid items-center gap-3 text-[0.8125rem]", wide ? "grid-cols-[8.5rem_minmax(0,1fr)_3rem]" : "grid-cols-[5.5rem_minmax(0,1fr)_3rem]")}>
          <span className="truncate text-ink">{row.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-sunken">
            <span className="block h-full rounded-full bg-ink-3/70" style={{ width: `${Math.max(2, (row.value / max) * 100)}%` }} />
          </span>
          <b className="text-right font-semibold tabular-nums text-ink">
            {fmt(row.value)}
            {unit}
          </b>
        </li>
      ))}
    </ul>
  );
}

/** The first line of a caption, kept short, as the name of a post. */
const headlineOf = (caption: string | null | undefined): string => {
  const line = (caption ?? "").split("\n")[0]?.trim() ?? "";
  return line === "" ? "Post" : line.length > 70 ? `${line.slice(0, 67)}...` : line;
};

const METRICS = [
  ["reach", "Reach"],
  ["views", "Views"],
  ["likes", "Likes"],
  ["comments", "Comments"],
  ["shares", "Shares"],
  ["saves", "Saves"],
  ["clicks", "Clicks"],
] as const satisfies ReadonlyArray<readonly [keyof PostTotals, string]>;

/** A post's logo, its first line, and where and when it went out, with a link to it. */
function PostTitle({ post }: { readonly post: Analytics["posts"][number] }): ReactElement {
  return (
    <div className="flex items-center gap-2.5">
      <ChannelLogo platform={post.platform} small />
      <span className="min-w-0">
        <span className="block break-words font-semibold text-ink">{headlineOf(post.caption)}</span>
        <span className="block text-xs text-ink-3">
          {PLATFORM_NAMES[post.platform]}
          {post.postedAt === undefined || post.postedAt === null ? "" : `, ${dayLabel(post.postedAt.slice(0, 10), { day: "numeric", month: "short" })}`}
          {post.permalink === undefined || post.permalink === null || !post.permalink.startsWith("https://") ? null : (
            <>
              {", "}
              <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="underline">
                View post
              </a>
            </>
          )}
        </span>
      </span>
    </div>
  );
}

function Posts({ social, scope, standings }: { readonly social: SocialAnalytics; readonly scope: readonly AnalyticsChannel[]; readonly standings: Readonly<Record<AnalyticsChannel, Standing>> }): ReactElement {
  const analytics = social.analytics;
  if (analytics === null) return <Placeholder icon={Images} title="" unavailable>{null}</Placeholder>;
  if (scope.length === 1 && scope[0] === "google") return <Placeholder icon={Images} title="Google does not give numbers for each post" ghost="none">For your Google listing we show views, calls, directions and website clicks for the whole listing, on the overview.</Placeholder>;
  const rows = analytics.posts
    .flatMap((post) => (post.platform === "google" || post.platform === "linkedin" || !scope.includes(post.platform) || standings[post.platform] === "unsupported" ? [] : [{ post: { ...post, platform: post.platform }, totals: post.total }]))
    .sort((a, b) => (b.totals.reach ?? 0) - (a.totals.reach ?? 0));
  return (
    <div className="grid gap-4">
      <Notices standings={standings} scope={scope.filter((channel) => channel !== "google")} />
      {rows.length === 0 ? (
        <Placeholder icon={Images} title="No numbers for posts yet">Once a post has been out for a day, how it did shows here: reach, views, likes, comments, shares and saves for each one.</Placeholder>
      ) : (
        <div className={cn(LIFT, "grid gap-3 p-5")}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className={SECTION_TITLE}>How each post did</h2>
            <span className="text-xs text-ink-3">Numbers since each post went out. Instagram gives views and saves, Facebook gives clicks.</span>
          </div>
          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[40rem] border-collapse text-[0.8125rem]">
              <thead>
                <tr className="text-[0.6875rem] uppercase tracking-wide text-ink-3">
                  <th className="px-2 py-2 text-left font-semibold">Post</th>
                  {METRICS.map(([, name]) => (
                    <th key={name} className="px-2 py-2 text-right font-semibold">
                      {name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ post, totals }) => (
                  <tr key={`${post.channel}:${post.postId}`} className="border-t border-line">
                    <td className="px-2 py-2.5 text-left">
                      <PostTitle post={post} />
                    </td>
                    {METRICS.map(([key]) => (
                      <td key={key} className="px-2 py-2.5 text-right tabular-nums">
                        {totals[key] === undefined ? <span className="text-xs text-ink-3">not given</span> : fmt(totals[key] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* On a phone each post is a card with the numbers it has, since a seven-column table does not fit. */}
          <ul className="grid gap-3 sm:hidden">
            {rows.map(({ post, totals }) => {
              const given = METRICS.flatMap(([key, name]) => (totals[key] === undefined ? [] : [[name, totals[key] ?? 0] as const]));
              return (
                <li key={`${post.channel}:${post.postId}`} className="grid gap-3 rounded-xl border border-line p-3.5">
                  <PostTitle post={post} />
                  {given.length === 0 ? (
                    <p className="text-xs text-ink-3">No numbers given yet.</p>
                  ) : (
                    <dl className="grid grid-cols-3 gap-x-3 gap-y-2">
                      {given.map(([name, value]) => (
                        <div key={name}>
                          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wide text-ink-3">{name}</dt>
                          <dd className="text-[0.9375rem] font-semibold tabular-nums text-ink">{fmt(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function Hashtags({ social }: { readonly social: SocialAnalytics }): ReactElement {
  const analytics = social.analytics;
  if (analytics === null) return <Placeholder icon={Hash} title="" unavailable>{null}</Placeholder>;
  if (analytics.hashtags.length === 0) return <Placeholder icon={Hash} title="No hashtags to compare yet">Once your posts have been out for a few days, we show which hashtags did best, worked out from your own posts.</Placeholder>;
  const rows = [...analytics.hashtags].sort((a, b) => b.avgReach - a.avgReach);
  return (
    <div className={cn(LIFT, "grid gap-3 p-5")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className={SECTION_TITLE}>Which hashtags worked</h2>
        <span className="text-xs text-ink-3">Worked out from your own posts. The networks do not report hashtags.</span>
      </div>
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead>
          <tr className="text-[0.6875rem] uppercase tracking-wide text-ink-3">
            <th className="px-2 py-2 text-left font-semibold">Hashtag</th>
            <th className="px-2 py-2 text-right font-semibold">Posts</th>
            <th className="px-2 py-2 text-right font-semibold">Average reach</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tag} className="border-t border-line">
              <td className="px-2 py-2.5 font-semibold text-ink">{row.tag}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{row.posts}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{fmt(row.avgReach)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Instagram gives who follows you from 100 followers: how far along the account is, or what to expect when it is not known. */
function FollowerProgress({ followers }: { readonly followers: number | null }): ReactElement {
  const percent = followers === null ? 0 : Math.min(100, Math.round((followers / 100) * 100));
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <h3 className="font-display text-[0.9375rem] font-semibold text-ink">{followers === null ? "Nothing to show yet" : "Not enough followers yet"}</h3>
        <p className="text-[0.84375rem] leading-relaxed text-ink-2">Instagram shows who follows you once the account has 100 followers.{followers === null ? "" : ` You have ${fmt(followers)}.`} We show it here as soon as Instagram does.</p>
      </div>
      {followers === null ? null : (
        <div className="grid gap-1.5" role="img" aria-label={`${followers} of 100 followers`}>
          <span className="h-2.5 overflow-hidden rounded-full bg-sunken">
            <span className="block h-full rounded-full bg-ok" style={{ width: `${Math.max(3, percent)}%` }} />
          </span>
          <span className="text-xs text-ink-3">{fmt(followers)} of 100</span>
        </div>
      )}
      <div aria-hidden="true" className="grid gap-5 rounded-xl border border-dashed border-line p-4 sm:grid-cols-2">
        {["Age", "Gender"].map((title) => (
          <div key={title} className="grid gap-2">
            <span className="text-[0.8125rem] font-semibold text-ink-3">{title}</span>
            {[80, 55, 35].map((width) => (
              <span key={width} className="h-2.5 rounded-full bg-sunken" style={{ width: `${width}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Audience({ social, standings }: { readonly social: SocialAnalytics; readonly standings: Readonly<Record<AnalyticsChannel, Standing>> }): ReactElement {
  const analytics = social.analytics;
  if (analytics === null) return <Placeholder icon={UsersThree} title="" unavailable>{null}</Placeholder>;
  const audience = analytics.audience;
  const groups: ReadonlyArray<readonly [string, ReadonlyArray<{ readonly label: string; readonly value: number }> | undefined]> = [
    ["Age", audience?.age],
    ["Gender", audience?.gender],
    ["Top cities", audience?.city],
    ["Top countries", audience?.country],
  ];
  const any = groups.some(([, rows]) => rows !== undefined && rows.length > 0);
  return (
    <div className="grid gap-4">
      <Notices standings={standings} scope={["instagram"]} />
      <div className={cn(LIFT, "grid gap-3 p-5")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={SECTION_TITLE}>Who follows you on Instagram</h2>
          <span className="text-xs text-ink-3">Instagram only, about two days behind.</span>
        </div>
        {audience?.status === "too_few_followers" || !any ? (
          <FollowerProgress followers={audience?.status === "too_few_followers" ? audience.followers ?? null : null} />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {groups.map(([title, rows]) =>
              rows === undefined || rows.length === 0 ? null : (
                <div key={title} className="grid gap-2">
                  <h3 className="font-display text-[0.84375rem] font-semibold text-ink">{title}</h3>
                  <Bars rows={rows.map((row) => ({ ...row, label: audienceLabel(row.label) }))} />
                </div>
              ),
            )}
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Empty title="Facebook">Facebook now gives only limited details about who follows a Page, so we show none rather than guess.</Empty>
        <Empty title="Google Business">Google does not tell us anything about who looks at your listing.</Empty>
      </div>
    </div>
  );
}

const COVERAGE: ReadonlyArray<readonly [string, string, string, string]> = [
  ["Overview of the account", "Yes", "Yes", "Yes"],
  ["Numbers for each post", "Yes", "Yes", "No"],
  ["Hashtags, worked out by us", "Yes", "Some", "No"],
  ["Who follows or looks", "100 or more followers", "Limited", "No"],
  ["Calls, directions, website clicks", "No", "No", "Yes"],
];

function Reports({ report }: { readonly report: string | null }): ReactElement {
  const link = report !== null && report.startsWith("https://") ? report : null;
  return (
    <div className="grid gap-4">
      <div className={cn(LIFT, "grid gap-3 p-5")}>
        <h2 className={SECTION_TITLE}>Monthly report</h2>
        {link === null ? (
          <p className="text-[0.84375rem] text-ink-2">Our team adds your report here each month. There is none yet.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <a href={link} target="_blank" rel="noopener noreferrer" className={SMALL_SOFT}>
              Open the latest report
            </a>
            <span className="text-xs text-ink-3">The report our team writes for you each month.</span>
          </div>
        )}
      </div>
      <div className={cn(LIFT, "grid gap-3 p-5")}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className={SECTION_TITLE}>What each network can tell us</h2>
          <span className="text-xs text-ink-3">So you know what to expect.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="text-[0.6875rem] uppercase tracking-wide text-ink-3">
                <th className="px-2 py-2 text-left font-semibold">Numbers</th>
                <th className="px-2 py-2 text-center font-semibold">Instagram</th>
                <th className="px-2 py-2 text-center font-semibold">Facebook</th>
                <th className="px-2 py-2 text-center font-semibold">Google</th>
              </tr>
            </thead>
            <tbody>
              {COVERAGE.map(([name, ...cells]) => (
                <tr key={name} className="border-t border-line">
                  <td className="px-2 py-2.5">{name}</td>
                  {cells.map((cell, index) => (
                    <td key={ANALYTICS_CHANNELS[index]} className={cn("px-2 py-2.5 text-center font-semibold", cell === "No" ? "text-ink-3" : cell === "Yes" ? "text-ok" : "text-warn")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-3">LinkedIn is not offered: it gives almost nothing about personal profiles.</p>
      </div>
    </div>
  );
}

export interface AnalyticsViewProps {
  readonly social: SocialAnalytics;
  /** The networks the brand has an account on. */
  readonly connected: readonly ChannelPlatform[];
  /** The latest monthly report our team added, or null. */
  readonly report: string | null;
  /** The business's connected accounts, for the channels column. */
  readonly accounts: ReadonlyArray<{ readonly id: string; readonly platform: ChannelPlatform; readonly account: string }>;
  readonly channel: "all" | AnalyticsChannel;
  readonly tab: AnalyticsTab;
  /** The address of this page, which the tabs, channels and ranges link back to. */
  readonly basePath?: string;
}

/** How the brand's posts and accounts did: overview, posts, hashtags, audience, and the reports. Each channel says plainly what it can and cannot give. */
export function AnalyticsView({ social, connected, report, accounts, channel, tab, basePath = "/social/analytics" }: AnalyticsViewProps): ReactElement {
  const params: Params = { base: basePath, range: social.range, channel, tab };
  const standings = Object.fromEntries(ANALYTICS_CHANNELS.map((one) => [one, standingOf(social.analytics, connected, one)])) as Record<AnalyticsChannel, Standing>;
  const scope: readonly AnalyticsChannel[] = channel === "all" ? ANALYTICS_CHANNELS : [channel];
  const showTools = tab !== "reports";
  const rows: AnalyticsChannelRow[] = accounts.map((one) => ({ id: one.id, platform: one.platform, account: one.account, status: isAnalyticsChannel(one.platform) ? (one.platform === "google" && standings.google === "ok" ? "Account numbers only" : STANDING_WORDS[standings[one.platform]]) : "Not offered", href: isAnalyticsChannel(one.platform) ? href(params, { channel: one.platform }) : null }));
  const frame = (
    <PageFrame
      title="Analytics"
      lede="How your posts did, and what each network can tell us."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {social.brand.view === null ? null : <BrandSwitcher view={social.brand.view} current={social.brand.externalId} />}
        </div>
      }
    >
      <SocialTabs current="analytics" hasNumbers />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* On a phone the pills scroll sideways on one line, out to the screen's edge, instead of wrapping. */}
        <nav aria-label="Analytics" className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
          {ANALYTICS_TABS.map((one) => (
            <Link key={one} href={href(params, { tab: one })} aria-current={tab === one ? "page" : undefined} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-[0.8125rem] font-semibold", tab === one ? "bg-ink text-surface" : "bg-sunken text-ink-2")}>
              {TAB_NAMES[one]}
            </Link>
          ))}
        </nav>
        {!showTools ? null : (
          <div className="grid grid-cols-3 rounded-full bg-sunken p-0.5 sm:inline-grid" role="group" aria-label="Date range, in days">
            {RANGES.map((one) => (
              <Link key={one} href={href(params, { range: one })} aria-current={social.range === one ? "true" : undefined} className={cn("rounded-full px-3 py-1 text-center text-[0.8125rem] font-semibold", social.range === one ? "bg-surface text-ink shadow-sm" : "text-ink-2")}>
                {one} days
              </Link>
            ))}
          </div>
        )}
      </div>
      {/* The channels column is a sidebar on a wide screen; on a phone the same choice is a row of chips here, so it is not left at the foot of the page. */}
      {rows.length === 0 ? null : (
        <ul aria-label="Channels" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
          <li className="shrink-0">
            <Link href={href(params, { channel: "all" })} aria-current={channel === "all" ? "true" : undefined} className={cn("block rounded-full bg-surface px-3 py-1.5 text-[0.8125rem] font-semibold shadow-sm", channel === "all" && "ring-2 ring-ok")}>
              All channels
            </Link>
          </li>
          {rows.map((row) =>
            row.href === null ? null : (
              <li key={row.id} className="shrink-0">
                <Link href={row.href} aria-current={channel === row.platform ? "true" : undefined} className={cn("flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 text-[0.8125rem] font-semibold shadow-sm", channel === row.platform && "ring-2 ring-ok")}>
                  <ChannelLogo platform={row.platform} small />
                  {PLATFORM_NAMES[row.platform]}
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
      {tab === "overview" ? <Overview social={social} scope={scope} standings={standings} /> : null}
      {tab === "posts" ? <Posts social={social} scope={scope} standings={standings} /> : null}
      {tab === "hashtags" ? <Hashtags social={social} /> : null}
      {tab === "audience" ? <Audience social={social} standings={standings} /> : null}
      {tab === "reports" ? <Reports report={report} /> : null}
    </PageFrame>
  );
  // The channels column sits flush against the rail exactly as on the Social media page, so the two pages feel like one place.
  return (
    <div className="-mx-4 -mb-28 -mt-6 flex flex-col md:-mx-8 lg:-mb-16 lg:-mt-10 lg:flex-row xl:-mx-10">
      <AnalyticsChannels rows={rows} allHref={href(params, { channel: "all" })} selected={channel} />
      <div className="order-first min-w-0 flex-1 px-4 pb-8 pt-6 md:px-8 lg:order-none lg:pb-16 lg:pt-10 xl:px-10">{frame}</div>
    </div>
  );
}
