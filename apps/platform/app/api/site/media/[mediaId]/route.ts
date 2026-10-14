import "server-only";
import { blogPreviewSecret } from "@/lib/server/blog-preview-link";
import { MEDIA_PREVIEW_PARAM } from "@/lib/server/blog-preview-request";
import { verifyBlogPreviewToken } from "@/lib/server/blog-preview-token";
import { servePayloadMediaFile } from "@/lib/server/payload-media-serving";
import { isMediaPublished } from "@/lib/server/site-media";
import { siteCorsHeaders } from "@/lib/server/site-cors";

/**
 * `GET /api/site/media/{mediaId}`: an image that appears on a published blog post (its cover, or its author's photo),
 * for a client's own website to show. `/api/site/posts` points `coverImagePath` and `photoPath` here.
 *
 * A draft's images are not on a published post, so they are shown only to a request carrying the preview pass
 * (`?preview=<token>`, the same short-lived token as "Preview on my website"), and only for that pass's business.
 *
 * Public on purpose: a visitor's browser loads these straight into an `<img>`, and cannot send the bearer token the
 * rest of `/api/site/*` uses. Nothing else is reachable through it: a media id that is not on a published post gets
 * the same bare 404 as one that does not exist (see lib/server/site-media.ts).
 */
const CORS_HEADERS = siteCorsHeaders("GET, OPTIONS");

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  request: Request,
  context: RouteContext<"/api/site/media/[mediaId]">,
): Promise<Response> {
  const { mediaId } = await context.params;

  const previewToken = new URL(request.url).searchParams.get(MEDIA_PREVIEW_PARAM);
  if (previewToken !== null) {
    const claims = verifyBlogPreviewToken(blogPreviewSecret(), previewToken, new Date());
    // Scoped to the pass's business, so a preview link never reaches another business's files.
    if (claims === null) return notFound();
    return servePayloadMediaFile(mediaId, claims.businessId, { sharing: "preview" });
  }

  if (!(await isMediaPublished(mediaId))) return notFound();
  return servePayloadMediaFile(mediaId, null, { sharing: "public" });
}
