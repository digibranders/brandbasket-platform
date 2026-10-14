import "server-only";
import { getStaffDb } from "@/lib/server/db";
import { readDirectoryDealsFeed } from "@/lib/server/directory-deals-feed";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";

/** A new deal shows on the website within about a minute; a taken-down one leaves just as fast. */
const CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=120";

/**
 * `GET /api/directory/deals` - every offer on show today whose business's claim is approved, for the website. Public:
 * everything in it is shown publicly on the directory anyway.
 */
export async function GET(): Promise<Response> {
  try {
    const feed = await readDirectoryDealsFeed(getStaffDb(), new Date());
    return Response.json(feed, { status: 200, headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    console.error("[fynix:directory] GET /api/directory/deals failed", errorLogInfo(error));
    return Response.json({ error: "Deals are unavailable right now." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
