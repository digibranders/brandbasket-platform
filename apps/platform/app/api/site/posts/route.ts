import "server-only";
import { findTenantBySiteToken, listPublishedPosts, siteHasAccess } from "@/lib/server/site-api";
import { bearerToken, siteCorsHeaders, siteOffline, unauthorized } from "@/lib/server/site-cors";

/**
 * `GET /api/site/posts` — the published blog posts belonging to whichever business owns the bearer token.
 *
 * This is the one thing a client's own website reads from the platform. It is deliberately the same shape as
 * `/api/leads`, which the marketing site already uses: a shared secret in a header, no session, no cookies.
 *
 * The token identifies the business, so the request never names one. There is no business id to tamper with and
 * nothing to enumerate; a leaked token exposes only that business's already-public posts.
 *
 * Lives under `/api/`, which proxy.ts's matcher skips entirely, so it is reachable on any host this app serves
 * and does its own authentication rather than relying on host routing.
 */

/** Client sites are on other origins, and these posts are public content, so any origin may read them. */
const CORS_HEADERS = siteCorsHeaders("GET, OPTIONS");

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (token === null) return unauthorized(CORS_HEADERS);

  const tenant = await findTenantBySiteToken(token);
  if (tenant === null) return unauthorized(CORS_HEADERS);
  if (!(await siteHasAccess(tenant.businessId))) return siteOffline(CORS_HEADERS);

  const posts = await listPublishedPosts(tenant.businessId);
  return Response.json(
    { business: tenant.name, posts },
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        // Short cache: a customer publishing a post expects to see it on their site promptly, but a client site
        // rebuilding or a crawler should not hammer this on every request.
        "Cache-Control": "public, max-age=60",
      },
    },
  );
}
