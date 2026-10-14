import "server-only";
import { servePayloadMediaFile } from "@/lib/server/payload-media-serving";
import { isMediaPublished } from "@/lib/server/site-media";
import { siteCorsHeaders } from "@/lib/server/site-cors";

/**
 * `GET /api/site/media/{mediaId}`: an image that appears on a published blog post (its cover, or its author's photo),
 * for a client's own website to show. `/api/site/posts` points `coverImagePath` and `photoPath` here.
 *
 * Public on purpose: a visitor's browser loads these straight into an `<img>`, and cannot send the bearer token the
 * rest of `/api/site/*` uses. Nothing else is reachable through it: a media id that is not on a published post gets
 * the same bare 404 as one that does not exist (see lib/server/site-media.ts).
 */
const CORS_HEADERS = siteCorsHeaders("GET, OPTIONS");

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(
  _request: Request,
  context: RouteContext<"/api/site/media/[mediaId]">,
): Promise<Response> {
  const { mediaId } = await context.params;
  if (!(await isMediaPublished(mediaId))) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return servePayloadMediaFile(mediaId, null, { publicContent: true });
}
