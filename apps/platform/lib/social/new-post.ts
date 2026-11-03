import { addDays } from "@brandbasket/shared/lib/calendar/local-date";

/**
 * What a new post must be before it is sent to social-auto. The rules are social-auto's own (it checks them again): a caption
 * Instagram accepts, a square JPG, a day from tomorrow on, and only channels the business has connected. Pure, so the dialog
 * (in the browser) and the action (on the server) read the same rules.
 */

/** Every post goes out in the daily run at this time. */
export const POST_TIME_LABEL = "10:00 AM";

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

/** The first day a post can be set for: the day's run is at 10:00, so today's has gone. */
export const earliestDay = (today: string): string => addDays(today, 1);
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
  readonly caption: unknown;
  readonly pictureId: unknown;
  readonly channels: unknown;
}

/** A post's id in social-auto: the ones a business makes, which are the ones it can change. */
export const isChangeablePostId = (value: unknown): value is string => typeof value === "string" && /^manual-[0-9a-f]{12}$/.test(value);

export interface NewPost {
  readonly day: string;
  readonly caption: string;
  readonly pictureId: string;
  readonly channels: readonly string[];
}

/** A post's changes: the same, except that the picture can be left as it is. */
export interface PostEdit {
  readonly day: string;
  readonly caption: string;
  readonly pictureId?: string;
  readonly channels: readonly string[];
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
  if (raw !== ownDay && !canAddOn(raw, today)) return refused(`Choose a day from ${earliestDay(today)} to ${latestDay(today)}. Posts go out at ${POST_TIME_LABEL}.`);
  return { ok: true, value: raw };
}

const pictureIdOf = (raw: unknown): string | null => (typeof raw === "string" && PICTURE_ID.test(raw) ? raw : null);

/** Checks a new post against the rules and the channels the business has connected. */
export function checkNewPost(input: NewPostInput, today: string, connected: readonly string[]): NewPostCheck {
  const day = dayOf(input.day, today);
  if (!day.ok) return day;
  const caption = captionOf(input.caption);
  if (!caption.ok) return caption;
  const pictureId = pictureIdOf(input.pictureId);
  if (pictureId === null) return refused("Add a picture first.");
  const channels = channelsOf(input.channels, connected);
  if (!channels.ok) return channels;
  return { ok: true, post: { day: day.value, caption: caption.value, pictureId, channels: channels.value } };
}

/**
 * Checks the changes to a post. The rules are the new post's, except that a picture is optional (none keeps the old one) and that
 * the post's own day is always accepted as it is, even when it is today and the day's run is still ahead.
 */
export function checkPostEdit(input: NewPostInput, today: string, connected: readonly string[], ownDay: string): PostEditCheck {
  const day = dayOf(input.day, today, ownDay);
  if (!day.ok) return day;
  const caption = captionOf(input.caption);
  if (!caption.ok) return caption;
  const picture = input.pictureId === null || input.pictureId === "" ? null : pictureIdOf(input.pictureId);
  if (input.pictureId !== null && input.pictureId !== "" && picture === null) return refused("Add the picture again.");
  const channels = channelsOf(input.channels, connected);
  if (!channels.ok) return channels;
  return { ok: true, edit: { day: day.value, caption: caption.value, channels: channels.value, ...(picture === null ? {} : { pictureId: picture }) } };
}

/** What the new-post form hands back to the dialog. */
export type NewPostState =
  | { readonly status: "idle" }
  | { readonly status: "saved" }
  | { readonly status: "error"; readonly message: string }
  /** The post went out, but not to every account: the message says which, and that the next run tries again. */
  | { readonly status: "partial"; readonly message: string };
