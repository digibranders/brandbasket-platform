/*
 * The featured video on the Business profile's Photos tab (docs/superpowers/specs/2026-10-01-business-profile-
 * design.md): a YouTube link, kept as its 11-character video id. We store and serve no video ourselves. Browser-safe.
 */

export type YoutubeLinkResult = { readonly ok: true; readonly videoId: string } | { readonly ok: false; readonly message: string };

/** The image host the dashboard's content security policy allows for the thumbnail (lib/security-headers.ts). */
export const YOUTUBE_THUMBNAIL_ORIGIN = "https://i.ytimg.com";

const INVALID = "Paste the link to one YouTube video, like youtube.com/watch?v=… or youtu.be/….";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);
/** The paths that carry the id as their second part: /shorts/<id>, /embed/<id>, /live/<id>. */
const ID_PATHS = new Set(["shorts", "embed", "live"]);

function idOf(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split("/").filter((part) => part !== "");
  if (host === "youtu.be") return parts.length === 1 ? (parts[0] ?? null) : null;
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (parts.length === 1 && parts[0] === "watch") return url.searchParams.get("v");
  if (parts.length === 2 && ID_PATHS.has(parts[0] ?? "")) return parts[1] ?? null;
  return null;
}

export function parseYoutubeLink(typed: string): YoutubeLinkResult {
  const value = typed.trim();
  if (value === "" || /\s/.test(value)) return { ok: false, message: INVALID };
  let url: URL;
  try {
    url = new URL(HAS_SCHEME.test(value) ? value : `https://${value}`);
  } catch {
    return { ok: false, message: INVALID };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, message: INVALID };
  const videoId = idOf(url);
  return videoId !== null && VIDEO_ID.test(videoId) ? { ok: true, videoId } : { ok: false, message: INVALID };
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `${YOUTUBE_THUMBNAIL_ORIGIN}/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
