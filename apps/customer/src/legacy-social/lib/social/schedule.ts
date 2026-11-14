import { CHANNEL_PLATFORMS, type ChannelPlatform } from "./auto";

/*
 * The days of the week a customer lets each channel post on. The posting service keeps them per channel (`/api/v1/schedule`): the days
 * chosen are the posts a week for that channel, and a channel with none of its own posts on the usual spread.
 */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const WEEKDAY_SHORT: Readonly<Record<Weekday, string>> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
export const WEEKDAY_LONG: Readonly<Record<Weekday, string>> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };

/** The channels that have days of their own; a channel not listed posts on the usual spread. */
export type PostingDays = Partial<Record<ChannelPlatform, readonly Weekday[]>>;

const isWeekday = (value: unknown): value is Weekday => typeof value === "string" && (WEEKDAYS as readonly string[]).includes(value);

/** Days in week order, each once. Null when anything in the list is not a day or the list is empty. */
export function tidyDays(days: readonly unknown[]): Weekday[] | null {
  if (days.length === 0 || !days.every(isWeekday)) return null;
  return WEEKDAYS.filter((day) => days.includes(day));
}

/** The days a form sends as one text, `mon,tue,sat`. Null for anything that is not a list of days; an empty text is `[]` (the usual spread). */
export function parseDays(text: string): Weekday[] | null {
  const trimmed = text.trim();
  if (trimmed === "") return [];
  return tidyDays(trimmed.split(",").map((part) => part.trim().toLowerCase()));
}

/** What the posting service answers for the schedule (`{schedule: {channels: {instagram: {days: [...]}}}}`), keeping only channels with valid days. */
export function readSchedule(body: unknown): PostingDays {
  const channels = (body as { schedule?: { channels?: unknown } } | null)?.schedule?.channels;
  if (typeof channels !== "object" || channels === null) return {};
  const out: Partial<Record<ChannelPlatform, readonly Weekday[]>> = {};
  for (const platform of CHANNEL_PLATFORMS) {
    const days = (channels as Record<string, { days?: unknown } | undefined>)[platform]?.days;
    const tidy = Array.isArray(days) ? tidyDays(days) : null;
    if (tidy !== null) out[platform] = tidy;
  }
  return out;
}

/** "Mon, Tue, Sat", or "Usual spread" for a channel with no days of its own. */
export function daysWords(days: readonly Weekday[] | undefined): string {
  return days === undefined || days.length === 0 ? "Usual spread" : days.map((day) => WEEKDAY_SHORT[day]).join(", ");
}

/** The whole setting as the posting service wants it (`PUT` replaces everything): the saved days with one channel changed or, for `[]`, taken back to the usual spread. */
export function withChannelDays(current: PostingDays, platform: ChannelPlatform, days: readonly Weekday[]): Record<string, readonly Weekday[]> {
  const next: Record<string, readonly Weekday[]> = {};
  for (const channel of CHANNEL_PLATFORMS) {
    const chosen = channel === platform ? days : current[channel];
    if (chosen !== undefined && chosen.length > 0) next[channel] = chosen;
  }
  return next;
}
