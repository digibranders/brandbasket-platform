import "server-only";
import { businessUrlCode } from "@brandbasket/db";
import { siteConfig } from "@brandbasket/shared/lib/site-config";
import { LEADS_API_TOKEN_MIN_LENGTH } from "@/lib/leads-api";
import { previewOrigins } from "@/lib/preview-origins";
import { previewLink } from "@/lib/preview-link";

/**
 * Where the live preview is drawn: its address on the website, and the origins the frame may end up on (the website's
 * address, and its www twin when the address redirects to it): the only windows the dashboard exchanges messages with.
 */
export interface LivePreviewSource {
  readonly src: string;
  readonly origins: readonly string[];
}

/**
 * The live preview for a business, or null when there is nothing to show it for: the business has no page yet (no
 * place id), or the secret shared with the website isn't set, so the website could not tell the link is ours.
 */
export function livePreviewSource(placeId: string | null, now: Date): LivePreviewSource | null {
  const secret = process.env.LEADS_API_TOKEN?.trim() ?? "";
  if (placeId === null || secret.length < LEADS_API_TOKEN_MIN_LENGTH) return null;
  const origin = new URL(siteConfig.url).origin;
  return { src: previewLink({ websiteOrigin: origin, code: businessUrlCode(placeId), secret, now }), origins: previewOrigins(origin) };
}
