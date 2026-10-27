import "server-only";
import type { RateLimitRule } from "@brandbasket/db";

/** One business's website may report this many events a minute: far above a real site's traffic, low enough to stop a flood. */
export const SITE_EVENT_RATE_RULE: RateLimitRule = { limit: 120, windowSeconds: 60 };

/** The rate limit key for a business: its id only, nothing about the visitor. */
export function siteEventRateKey(businessId: string): string {
  return `site-event:${businessId}`;
}

/** The request body as text, or null once it goes over `limit` bytes. Counts the bytes as they arrive, so a missing or false Content-Length cannot get past it. */
export async function readBodyWithin(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > limit) return null;
  const reader = request.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
