/*
 * A Premium member's short videos on its business page (docs/superpowers/specs/2026-10-07-business-videos-design.md):
 * up to three clips of at most 16 seconds, hosted on Vimeo. Browser-safe and free of the database: the dashboard page,
 * the upload routes and the staff console all read the same limits from here.
 */

/** A business has three places for a video; the owner's newest upload takes the place it is sent to. */
export const VIDEO_SLOTS = [1, 2, 3] as const;
export type VideoSlot = (typeof VIDEO_SLOTS)[number];

/** The longest clip a member may add, in seconds. */
export const VIDEO_MAX_SECONDS = 16;
/** The server measures a clip and lets this much over the limit through, so a 16.1-second clip is not refused. */
export const VIDEO_SECONDS_TOLERANCE = 0.5;
/** The most bytes one upload may be as sent. A 16-second phone clip is 10 to 40 MB. */
export const VIDEO_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const VIDEO_MAX_UPLOAD_LABEL = "50 MB";
/** What the owner may pick: MP4, MOV (iPhone) and WebM. Vimeo reads the real type from the file itself. */
export const VIDEO_UPLOAD_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;

export const VIDEO_PREMIUM_MESSAGE = "Videos are part of Premium. Upgrade to add yours.";
export const VIDEO_TOO_LARGE_MESSAGE = `That video is larger than ${VIDEO_MAX_UPLOAD_LABEL}. Try a shorter or lower-quality clip.`;

/** The slot a request names, from a number or its digits, or null. */
export function parseVideoSlot(value: unknown): VideoSlot | null {
  const slot = typeof value === "string" && /^[0-9]$/.test(value) ? Number(value) : value;
  return VIDEO_SLOTS.find((candidate) => candidate === slot) ?? null;
}

/** Whether a clip of this many seconds may be stored: positive, finite, and within the limit and its margin. */
export function isVideoLengthAllowed(seconds: number): boolean {
  return Number.isFinite(seconds) && seconds > 0 && seconds <= VIDEO_MAX_SECONDS + VIDEO_SECONDS_TOLERANCE;
}

/**
 * Said to an owner whose clip is too long. Only lengths past the limit and its margin are refused, and those round to
 * at least one second over the limit, so the message never reads as a clip within it.
 */
export function videoTooLongMessage(seconds: number): string {
  return `That video is ${String(Math.round(seconds))} seconds. The limit is ${String(VIDEO_MAX_SECONDS)} seconds.`;
}

const VIMEO_VIDEO_ID = /^[0-9]{1,20}$/;
const VIMEO_HASH = /^[0-9a-f]{6,32}$/;

/**
 * The address of a video in Vimeo's player, for an `<iframe>`: its privacy hash (an unlisted video does not play
 * without it), and no tracking, title, byline or portrait. Throws for an id or hash that is not exactly digits or hex,
 * so nothing stored in the database can change where the address points.
 */
export function vimeoEmbedUrl(vimeoId: string, hash: string): string {
  if (!VIMEO_VIDEO_ID.test(vimeoId)) throw new Error(`Not a Vimeo video id: "${vimeoId}"`);
  if (!VIMEO_HASH.test(hash)) throw new Error(`Not a Vimeo privacy hash: "${hash}"`);
  const url = new URL(`https://player.vimeo.com/video/${vimeoId}`);
  url.searchParams.set("h", hash);
  url.searchParams.set("dnt", "1");
  url.searchParams.set("title", "0");
  url.searchParams.set("byline", "0");
  url.searchParams.set("portrait", "0");
  return url.toString();
}
