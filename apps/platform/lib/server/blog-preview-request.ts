import "server-only";
import { verifyBlogPreviewToken } from "./blog-preview-token";
import type { SiteApiTenant, SitePost } from "./site-api";

/**
 * `GET /api/site/posts/preview?token=…`: one draft post, for a client site's "Preview on my website" page.
 *
 * Two keys must agree. The bearer token proves which website is asking (the same site token `/api/site/posts` takes);
 * the preview token, signed by the platform when the customer clicked the button, names the post and expires. The
 * post is returned only when both belong to the same business, so a site token alone reads no drafts, and a preview
 * link alone works on no other business's website.
 */

export interface BlogPreviewDeps {
  readonly secret: string;
  readonly now: () => Date;
  readonly findTenantBySiteToken: (token: string) => Promise<SiteApiTenant | null>;
  readonly findPreviewPost: (businessId: string, postId: string) => Promise<SitePost | null>;
}

const BASE_HEADERS = {
  // Drafts must never sit in a cache, and a preview page must never be indexed.
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  // The client site calls this from its server, but a browser-side call would still need to be allowed.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization",
} as const;

function reply(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: BASE_HEADERS });
}

/** One message for every way a preview link can fail, so nothing reveals which posts or businesses exist. */
const NOT_AVAILABLE = { error: "This preview link has expired or is not valid." } as const;

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

export async function handleBlogPreviewRequest(request: Request, deps: BlogPreviewDeps): Promise<Response> {
  const siteToken = bearerToken(request);
  const tenant = siteToken === null ? null : await deps.findTenantBySiteToken(siteToken);
  if (tenant === null) return reply(401, { error: "A valid site API token is required." });

  const previewToken = new URL(request.url).searchParams.get("token");
  const claims = previewToken === null ? null : verifyBlogPreviewToken(deps.secret, previewToken, deps.now());
  if (claims === null || claims.businessId !== tenant.businessId) return reply(404, NOT_AVAILABLE);

  const post = await deps.findPreviewPost(tenant.businessId, claims.postId);
  if (post === null) return reply(404, NOT_AVAILABLE);
  return reply(200, { business: tenant.name, post });
}
