import "server-only";
import { getStaffDb } from "@/lib/server/db";
import { readDirectoryFeed } from "@/lib/server/directory-feed";
import { errorLogInfo } from "@firstfold/shared/server/error-log-info";

/** Edits show on the directory within about a minute. */
const CACHE_CONTROL = "public, max-age=60, s-maxage=60, stale-while-revalidate=300";

/**
 * `GET /api/directory/listings` - every live Featured listing, for the /in directory on the marketing website.
 * Public: everything in it is shown publicly on the directory anyway (the phone only when the client turned Call or
 * WhatsApp on). Hidden listings are left out entirely.
 */
export async function GET(): Promise<Response> {
  try {
    const feed = await readDirectoryFeed(getStaffDb(), new Date());
    return Response.json(feed, { status: 200, headers: { "Cache-Control": CACHE_CONTROL } });
  } catch (error) {
    console.error("[firstfold:directory] GET /api/directory/listings failed", errorLogInfo(error));
    return Response.json(
      { error: "Listings are unavailable right now." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
