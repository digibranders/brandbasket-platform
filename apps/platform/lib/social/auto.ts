import { addDays, localDateIn, mondayOf } from "@brandbasket/shared/lib/calendar/local-date";
import { z } from "zod";
import { BRAND_TIME_ZONE } from "@/lib/call-dates";

/**
 * What social-auto (the service that writes and publishes the posts) tells us, and how the Social media page reads it.
 * Pure: no network and no server-only code, so the page's client parts and the tests can use it.
 */

export const CHANNEL_PLATFORMS = ["instagram", "facebook", "linkedin", "google"] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

export const PLATFORM_NAMES: Readonly<Record<ChannelPlatform, string>> = { instagram: "Instagram", facebook: "Facebook", linkedin: "LinkedIn", google: "Google Business" };

/** What the person is asked for before they connect: the kind of account each network wants. */
export const PLATFORM_HINTS: Readonly<Record<ChannelPlatform, string>> = {
  instagram: "A Business or Creator account",
  facebook: "A Page you manage",
  linkedin: "Your own profile",
  google: "The Google account that manages your listing",
};

export const isChannelPlatform = (value: unknown): value is ChannelPlatform => CHANNEL_PLATFORMS.some((platform) => platform === value);

const platformSchema = z.enum(CHANNEL_PLATFORMS);
const postStateSchema = z.enum(["scheduled", "due", "published", "missed", "skipped", "paused"]);

const channelSchema = z.object({
  id: z.string().min(1),
  platform: platformSchema,
  account: z.string(),
  connectedAt: z.string(),
  /** Only LinkedIn and Instagram connections have an end date. */
  expiresAt: z.string().optional(),
});

const postSchema = z.object({
  id: z.string().min(1),
  /** ISO 8601 with an offset, e.g. 2026-11-04T10:00:00+05:30. */
  date: z.string(),
  caption: z.string(),
  imageUrl: z.string().optional(),
  manual: z.boolean(),
  state: postStateSchema,
  channels: z.array(z.object({ id: z.string().optional(), platform: platformSchema, account: z.string(), state: postStateSchema, permalink: z.string().nullable() })),
});

export type AutoChannel = z.output<typeof channelSchema>;
export type AutoPost = z.output<typeof postSchema>;
export type PostState = z.output<typeof postStateSchema>;

/**
 * Keeps the entries that read as `schema` and drops the rest: a network this page does not know yet (Google, say) must not
 * hide the ones it does.
 */
function readList<T>(schema: z.ZodType<T>, items: unknown): T[] {
  if (!Array.isArray(items)) return [];
  return items.flatMap((item): T[] => {
    const parsed = schema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

/** The channels of a workspace answer (`{"workspace": {"channels": [...]}}`); empty when the shape is not that. */
export function readChannels(body: unknown): AutoChannel[] {
  const channels = (body as { workspace?: { channels?: unknown } } | null)?.workspace?.channels;
  return readList(channelSchema, channels);
}

/** The posts of a posts answer (`{"posts": [...]}`); empty when the shape is not that. */
export function readPosts(body: unknown): AutoPost[] {
  return readList(postSchema, (body as { posts?: unknown } | null)?.posts);
}

/** The link of a connect-link answer, or null when it is not an https (or local http) address. */
export function readConnectLink(body: unknown): string | null {
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== "string") return null;
  try {
    const parsed = new URL(url);
    const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname.endsWith(".localhost");
    return parsed.protocol === "https:" || (parsed.protocol === "http:" && local) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** A post placed on the calendar: its day and time in India, where it goes and where it stands. */
export interface CalendarPost {
  readonly id: string;
  /** `YYYY-MM-DD` in India. */
  readonly day: string;
  /** `HH:MM` in India. */
  readonly time: string;
  readonly caption: string;
  readonly state: PostState;
  readonly channels: AutoPost["channels"];
  /** Made by the customer (not planned for them), so it can still be changed or removed. */
  readonly manual: boolean;
  readonly imageUrl?: string;
}

const timeFormat = new Intl.DateTimeFormat("en-GB", { timeZone: BRAND_TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function toCalendarPost(post: AutoPost): CalendarPost | null {
  const at = new Date(post.date);
  if (Number.isNaN(at.getTime())) return null;
  return { id: post.id, day: localDateIn(BRAND_TIME_ZONE, at), time: timeFormat.format(at), caption: post.caption, state: post.state, channels: post.channels, manual: post.manual, ...(post.imageUrl === undefined ? {} : { imageUrl: post.imageUrl }) };
}

/** How far back and ahead the page loads posts, so the calendar can be moved without asking again. */
export const WEEKS_BACK = 4;
export const WEEKS_AHEAD = 12;

/** The first and last day (`YYYY-MM-DD`) of the posts the page loads, around today in India. */
export function loadWindow(today: string): { readonly from: string; readonly to: string } {
  const monday = mondayOf(today);
  return { from: addDays(monday, -7 * WEEKS_BACK), to: addDays(monday, 7 * (WEEKS_AHEAD + 1) - 1) };
}

/** Whole days until a connection ends, or null when it has no end date. Negative once it has ended. */
export function daysUntilEnd(channel: Pick<AutoChannel, "expiresAt">, now: Date): number | null {
  if (channel.expiresAt === undefined) return null;
  const end = Date.parse(channel.expiresAt);
  return Number.isNaN(end) ? null : Math.floor((end - now.getTime()) / 86_400_000);
}

/** A connection is worth the customer's attention once it ends within this many days. */
export const ENDING_SOON_DAYS = 7;

export function endingSoon(channel: Pick<AutoChannel, "expiresAt">, now: Date): boolean {
  const days = daysUntilEnd(channel, now);
  return days !== null && days <= ENDING_SOON_DAYS;
}

export function endsInWords(days: number): string {
  if (days < 0) return "The connection has ended";
  if (days === 0) return "Ends today";
  return days === 1 ? "Ends in 1 day" : `Ends in ${days} days`;
}

export interface ConnectStatus {
  readonly title: string;
  readonly text: string;
  /** What the one dark button does: send the customer to connect a network, or to the channels. Null when there is nothing for them to do. */
  readonly action: { readonly kind: "connect"; readonly platform: ChannelPlatform } | { readonly kind: "channels" } | null;
  readonly actionLabel: string | null;
}

/** "Wednesday 4 November at 10:00". */
function dayAndTime(post: CalendarPost): string {
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${post.day}T12:00:00Z`));
  return `${label} at ${post.time}`;
}

/**
 * The status card's words: where things stand, what happens next, and the one thing to do. A connection that ends soon comes
 * first, then no channel at all, then the next post.
 */
export function connectStatus(channels: readonly AutoChannel[], posts: readonly CalendarPost[], now: Date): ConnectStatus {
  const ending = channels.find((channel) => endingSoon(channel, now));
  if (ending !== undefined) {
    const name = PLATFORM_NAMES[ending.platform];
    const days = daysUntilEnd(ending, now) ?? 0;
    return {
      title: days < 0 ? `${name} needs you again` : `${name} needs you again soon`,
      text:
        days < 0
          ? `Your ${name} connection has ended, so posts are not reaching it. Press Allow once more and they will.`
          : `Your ${name} connection ends ${days === 0 ? "today" : days === 1 ? "in 1 day" : `in ${days} days`}. Press Allow once more and posts keep reaching it.`,
      action: { kind: "connect", platform: ending.platform },
      actionLabel: `Reconnect ${name}`,
    };
  }
  if (channels.length === 0) {
    return {
      title: "Let us start your social posts",
      text: "Connect your accounts and we write and post three times a week for you.",
      action: { kind: "channels" },
      actionLabel: "Connect your accounts",
    };
  }
  const today = localDateIn(BRAND_TIME_ZONE, now);
  const next = posts.filter((post) => post.state !== "published" && post.day >= today).sort((a, b) => `${a.day}${a.time}`.localeCompare(`${b.day}${b.time}`))[0];
  return {
    title: "Posting three times a week",
    text:
      next === undefined
        ? "Your accounts are connected. We are writing your next posts, and they will appear on the calendar."
        : `Your next post goes out on ${dayAndTime(next)}. Nothing is needed from you right now.`,
    action: null,
    actionLabel: null,
  };
}

/** The seven days (`YYYY-MM-DD`) of the week that holds `day`, Monday first. */
export function weekOf(day: string): string[] {
  const monday = mondayOf(day);
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

/** The days a month grid shows for the month that holds `day`: whole weeks, Monday first, as many as the month needs. */
export function monthGrid(day: string): string[] {
  const month = day.slice(0, 7);
  const start = mondayOf(`${month}-01`);
  const cells: string[] = [];
  for (let week = 0; week < 6; week += 1) {
    const monday = addDays(start, week * 7);
    if (week > 0 && monday.slice(0, 7) > month) break;
    for (let index = 0; index < 7; index += 1) cells.push(addDays(monday, index));
  }
  return cells;
}

/** The first day of the month before or after the one that holds `day`. */
export function shiftMonth(day: string, by: number): string {
  const [year, month] = day.split("-").map(Number) as [number, number];
  const moved = new Date(Date.UTC(year, month - 1 + by, 1));
  return moved.toISOString().slice(0, 10);
}

export interface PostStatus {
  readonly tone: "ok" | "info" | "warn";
  /** The word beside the colour: a status is never colour alone. */
  readonly word: string;
  /** Which of the four states it is, for the edge colour and mark on the calendar: due is the one that shares a tone with scheduled. */
  readonly state: PostState;
}

/**
 * Where a post stands on the channels being looked at, in one word: Posted when every one has it, Not sent when one missed
 * its day, Going out when its day has come and it is on its way, otherwise Scheduled. Null when none of its channels is shown.
 */
export function postStatus(post: CalendarPost, shown: ReadonlySet<ChannelPlatform>): PostStatus | null {
  if (post.channels.length === 0) {
    if (post.state === "missed") return { tone: "warn", word: "Not sent", state: "missed" };
    if (post.state === "skipped") return { tone: "info", word: "Skipped", state: "skipped" };
    if (post.state === "paused") return { tone: "info", word: "Paused", state: "paused" };
    return { tone: "info", word: "Scheduled", state: "scheduled" };
  }
  const relevant = post.channels.filter((channel) => shown.has(channel.platform));
  if (relevant.length === 0) return null;
  const missed = relevant.filter((channel) => channel.state === "missed");
  if (missed.length > 0) {
    const names = [...new Set(missed.map((channel) => PLATFORM_NAMES[channel.platform]))];
    return { tone: "warn", word: missed.length === relevant.length ? "Not sent" : `Not sent to ${names.join(" and ")}`, state: "missed" };
  }
  // A channel the post was skipped on is not one it was meant for: Posted when every other channel has it.
  const meant = relevant.filter((channel) => channel.state !== "skipped");
  if (meant.length === 0) return { tone: "info", word: "Skipped", state: "skipped" };
  if (meant.every((channel) => channel.state === "published")) return { tone: "ok", word: "Posted", state: "published" };
  if (meant.some((channel) => channel.state === "due")) return { tone: "info", word: "Going out", state: "due" };
  if (meant.some((channel) => channel.state === "paused")) return { tone: "info", word: "Paused", state: "paused" };
  return { tone: "info", word: "Scheduled", state: "scheduled" };
}

/** The platforms a post goes to, each once, in the order the page lists them. */
export function platformsOf(post: CalendarPost): ChannelPlatform[] {
  return CHANNEL_PLATFORMS.filter((platform) => post.channels.some((channel) => channel.platform === platform));
}

/** The last day (`YYYY-MM-DD`) that has a post from today on, or null when nothing is booked. */
export function bookedUntil(posts: readonly CalendarPost[], today: string): string | null {
  const days = posts.filter((post) => post.day >= today).map((post) => post.day).sort();
  return days[days.length - 1] ?? null;
}

/** "Tuesday 3 Nov", from a `YYYY-MM-DD` day. */
export function dayLabel(day: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(new Date(`${day}T12:00:00Z`));
}

/** "10:00 AM", from an `HH:MM` time. */
export function time12(time: string): string {
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
}

/** "8 AM", "12 PM", from an hour of the day (0 to 23). */
export function hourLabel(hour: number): string {
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? "AM" : "PM"}`;
}

/** The first letter of the account a post goes to, for the round mark on the calendar. */
export function initialOf(post: CalendarPost, fallback: string): string {
  const account = post.channels[0]?.account.trim() ?? "";
  return (account === "" ? fallback : account).charAt(0).toUpperCase();
}

/** The first day from today on that has a post, or today when none is booked: the day the calendar opens on. */
export function nextPostDay(posts: readonly CalendarPost[], today: string): string {
  const days = posts.map((post) => post.day).filter((day) => day >= today).sort();
  return days[0] ?? today;
}

/**
 * The post the calendar should bring into view: the earliest one at or after `now` (`YYYY-MM-DDTHH:MM` in India), else the
 * earliest one shown, else null. Read for the posts on screen, so Day and Week each find their own.
 */
export function postToShow<T extends { readonly post: Pick<CalendarPost, "day" | "time"> }>(entries: readonly T[], now: string | null): T | null {
  const ordered = [...entries].sort((a, b) => `${a.post.day}T${a.post.time}`.localeCompare(`${b.post.day}T${b.post.time}`));
  return (now === null ? undefined : ordered.find((entry) => `${entry.post.day}T${entry.post.time}` >= now)) ?? ordered[0] ?? null;
}

/** Whether the customer can still change or remove a post: one they made, that has not started going out (a paused one can still be edited), and whose accounts are known. */
export const canChange = (post: CalendarPost): boolean => post.manual && (post.state === "scheduled" || post.state === "paused") && post.channels.every((channel) => channel.id !== undefined);

/** The ids of the accounts a post goes to. */
export const channelIdsOf = (post: CalendarPost): string[] => post.channels.flatMap((channel) => (channel.id === undefined ? [] : [channel.id]));
