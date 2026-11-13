import { addDays } from "@brandbasket/shared/lib/calendar/local-date";
import { CHANNEL_PLATFORMS, type ChannelPlatform } from "./auto";

/**
 * What a new post must be before it is sent to social-auto. The rules are social-auto's own (it checks them again): a caption
 * Instagram accepts, a square JPG, a day and a time still ahead, and only channels the business has connected. Pure, so the dialog
 * (in the browser) and the action (on the server) read the same rules.
 */

/** A post with no time of its own goes out at this time (India), as the daily run always did. */
export const DEFAULT_TIME = "10:00";

export const MAX_CAPTION_LENGTH = 2200;
export const MAX_HASHTAGS = 30;
export const MAX_PICTURE_BYTES = 4 * 1024 * 1024;
export const MIN_PICTURE_PIXELS = 320;
export const MAX_PICTURE_PIXELS = 4096;
/** How far ahead a post can be set: social-auto allows 90 days from now, so the last whole day is the 89th from today. */
export const MAX_DAYS_AHEAD = 89;

const HASHTAG = /(^|\s)#[\p{L}\p{N}_]+/gu;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PICTURE_ID = /^[0-9a-f]{32}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export const isTime = (value: unknown): value is string => typeof value === "string" && TIME.test(value);

/** Whether this moment (a `YYYY-MM-DD` day and an `HH:MM` time in India) is not ahead of `now`. */
export const momentHasPassed = (day: string, time: string, now: Date): boolean => Date.parse(`${day}T${time}:00+05:30`) <= now.getTime();

/** The first day a post can be set for: today, as long as the time chosen is still ahead. */
export const earliestDay = (today: string): string => today;
export const latestDay = (today: string): string => addDays(today, MAX_DAYS_AHEAD);

/** Whether a day on the calendar can take a new post. */
export function canAddOn(day: string, today: string): boolean {
  return day >= earliestDay(today) && day <= latestDay(today);
}

/** Why a picture cannot be used, or null when it can. `width` and `height` are read from the picture itself. */
export function pictureProblem(picture: { readonly type: string; readonly bytes: number; readonly width: number; readonly height: number }): string | null {
  if (picture.type !== "image/jpeg") return "The picture must be a JPG.";
  if (picture.bytes > MAX_PICTURE_BYTES) return "The picture is over 4 MB. Choose a smaller one.";
  if (picture.width !== picture.height) return "The picture must be square, as wide as it is tall.";
  if (picture.width < MIN_PICTURE_PIXELS || picture.width > MAX_PICTURE_PIXELS) return `The picture must be between ${MIN_PICTURE_PIXELS} and ${MAX_PICTURE_PIXELS} pixels on each side.`;
  return null;
}

/** Whether these bytes start like a JPG. The server's quick look before it passes a picture on; social-auto checks it fully. */
export const looksLikeJpeg = (bytes: Uint8Array): boolean => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

export interface NewPostInput {
  readonly day: unknown;
  readonly time: unknown;
  readonly caption: unknown;
  readonly pictureId: unknown;
  readonly channels: unknown;
  /** Captions of their own for single networks, as `{ linkedin: "..." }`; left out means every network posts the caption. */
  readonly variants?: unknown;
}

/** A post's id in social-auto: the ones a business makes, which are the ones it can change. */
export const isChangeablePostId = (value: unknown): value is string => typeof value === "string" && /^manual-[0-9a-f]{12}$/.test(value);

/** The id of a post we wrote and released for the business: letters, digits and dashes, such as `w01-d1`. social-auto decides whether it can be moved. */
export const isWrittenPostId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(value);

export interface NewPost {
  readonly day: string;
  readonly time: string;
  readonly caption: string;
  readonly pictureId: string;
  readonly channels: readonly string[];
  /** Only the networks that have a caption of their own. */
  readonly variants?: Readonly<Partial<Record<ChannelPlatform, string>>>;
}

/** A post's changes: the same, except that the picture can be left as it is. */
export interface PostEdit {
  readonly day: string;
  readonly time: string;
  readonly caption: string;
  readonly pictureId?: string;
  readonly channels: readonly string[];
  /** For every network: its own caption, or null to go back to the main one. */
  readonly variants: Readonly<Record<ChannelPlatform, string | null>>;
}

export type PostEditCheck = { readonly ok: true; readonly edit: PostEdit } | { readonly ok: false; readonly message: string };

export type NewPostCheck = { readonly ok: true; readonly post: NewPost } | { readonly ok: false; readonly message: string };

type Part<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };
const refused = (message: string): { readonly ok: false; readonly message: string } => ({ ok: false, message });

function captionOf(raw: unknown): Part<string> {
  if (typeof raw !== "string") return refused("Write what the post should say.");
  const caption = raw.replace(/\r\n/g, "\n").trim();
  if (caption === "") return refused("Write what the post should say.");
  if (caption.length > MAX_CAPTION_LENGTH) return refused(`The caption is ${caption.length} characters. Instagram allows ${MAX_CAPTION_LENGTH}.`);
  const hashtags = caption.match(HASHTAG)?.length ?? 0;
  if (hashtags > MAX_HASHTAGS) return refused(`The caption has ${hashtags} hashtags. Instagram allows ${MAX_HASHTAGS}.`);
  return { ok: true, value: caption };
}

/**
 * The captions networks have of their own. A network whose text is empty or the same as the main caption has none of its own,
 * so it follows the main caption. Each caption is held to the same rules as the main one.
 */
function variantsOf(raw: unknown, main: string): Part<Partial<Record<ChannelPlatform, string>>> {
  const given = typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const own: Partial<Record<ChannelPlatform, string>> = {};
  for (const platform of CHANNEL_PLATFORMS) {
    const text = given[platform];
    if (typeof text !== "string" || text.trim() === "") continue;
    const caption = captionOf(text);
    if (!caption.ok) return caption;
    if (caption.value !== main) own[platform] = caption.value;
  }
  return { ok: true, value: own };
}

function channelsOf(raw: unknown, connected: readonly string[]): Part<string[]> {
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) return refused("Choose where to post.");
  const channels = [...new Set(raw as string[])];
  if (channels.length === 0) return refused("Choose at least one account.");
  if (channels.some((id) => !connected.includes(id))) return refused("One of the accounts is not connected. Reload the page and try again.");
  return { ok: true, value: channels };
}

/** The day, which must be one a post can be set for; `ownDay`, a post's present day, is also accepted as it is. */
function dayOf(raw: unknown, today: string, ownDay?: string): Part<string> {
  if (typeof raw !== "string" || !DAY.test(raw)) return refused("Choose a day.");
  if (raw !== ownDay && !canAddOn(raw, today)) return refused(`Choose a day from ${earliestDay(today)} to ${latestDay(today)}.`);
  return { ok: true, value: raw };
}

/** The time, which must read like 14:30, and (unless it is the post's own) must still be ahead on that day. */
function timeOf(raw: unknown, day: string, now: Date, own?: { readonly day: string; readonly time: string }): Part<string> {
  if (!isTime(raw)) return refused("Choose a time, like 14:30.");
  if (!(own?.day === day && own.time === raw) && momentHasPassed(day, raw, now)) return refused("That time has already passed. Choose a later time.");
  return { ok: true, value: raw };
}

const pictureIdOf = (raw: unknown): string | null => (typeof raw === "string" && PICTURE_ID.test(raw) ? raw : null);

/** Checks a new post against the rules and the channels the business has connected. */
export function checkNewPost(input: NewPostInput, today: string, connected: readonly string[], now: Date = new Date()): NewPostCheck {
  const day = dayOf(input.day, today);
  if (!day.ok) return day;
  const time = timeOf(input.time, day.value, now);
  if (!time.ok) return time;
  const caption = captionOf(input.caption);
  if (!caption.ok) return caption;
  const pictureId = pictureIdOf(input.pictureId);
  if (pictureId === null) return refused("Add a picture first.");
  const channels = channelsOf(input.channels, connected);
  if (!channels.ok) return channels;
  const variants = variantsOf(input.variants, caption.value);
  if (!variants.ok) return variants;
  return { ok: true, post: { day: day.value, time: time.value, caption: caption.value, pictureId, channels: channels.value, ...(Object.keys(variants.value).length === 0 ? {} : { variants: variants.value }) } };
}

/**
 * Checks the changes to a post. The rules are the new post's, except that a picture is optional (none keeps the old one) and that
 * the post's own day and time are always accepted as they are.
 */
export function checkPostEdit(input: NewPostInput, today: string, connected: readonly string[], own: { readonly day: string; readonly time: string }, now: Date = new Date()): PostEditCheck {
  const day = dayOf(input.day, today, own.day);
  if (!day.ok) return day;
  const time = timeOf(input.time, day.value, now, own);
  if (!time.ok) return time;
  const caption = captionOf(input.caption);
  if (!caption.ok) return caption;
  const picture = input.pictureId === null || input.pictureId === "" ? null : pictureIdOf(input.pictureId);
  if (input.pictureId !== null && input.pictureId !== "" && picture === null) return refused("Add the picture again.");
  const channels = channelsOf(input.channels, connected);
  if (!channels.ok) return channels;
  const written = variantsOf(input.variants, caption.value);
  if (!written.ok) return written;
  // Every network is named: one with a caption of its own gets it, the others are put back on the main caption.
  const variants = Object.fromEntries(CHANNEL_PLATFORMS.map((platform) => [platform, written.value[platform] ?? null])) as Record<ChannelPlatform, string | null>;
  return { ok: true, edit: { day: day.value, time: time.value, caption: caption.value, channels: channels.value, variants, ...(picture === null ? {} : { pictureId: picture }) } };
}

const POST_CODE_WORDS: Readonly<Record<string, string>> = {
  TIME_PASSED: "That time has already passed. Choose a later time.",
  DAY_PASSED: "That day has already passed. Choose a later day.",
  POST_NOT_EDITABLE: "This post is already going out or has gone out, so it can no longer be changed.",
  POST_NOT_FOUND: "That post could not be found. Reload the page.",
  INVALID_DAY: "Choose a day from today to 89 days ahead.",
  INVALID_TIME: "Write the time like 10:30.",
};

/** What to tell the customer when social-auto refuses a change to a post: our own sentence for a code we know, else the service's plain sentence, else null. */
export const wordsForPostRefusal = (code: string | null, detail: string | null): string | null => (code !== null ? (POST_CODE_WORDS[code] ?? detail) : detail);

/** What the new-post form hands back to the dialog. */
export type NewPostState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | { readonly status: "error"; readonly message: string }
  /** The post went out, but not to every account: the message says which, and that the next run tries again. */
  | { readonly status: "partial"; readonly message: string };
