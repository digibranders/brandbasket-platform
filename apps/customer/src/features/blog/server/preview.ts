import "server-only";
import { createHmac } from "node:crypto";

/**
 * "Preview on my website": a short-lived pass that lets the business's own website show one draft post. Ported from
 * apps/platform lib/server/blog-preview-token.ts and blog-preview-link.ts (signing only: the platform's
 * /api/site/posts/preview verifies it, with the same secret and key context, so the format here must not change).
 *
 * Stateless: `<claims>.<signature>`, both base64url. The claims name the business, the post and the expiry; the signature
 * is an HMAC over them with a key derived from the auth secret. A leaked link shows one post, for minutes.
 */

/** How long a preview link keeps working after the customer clicks Preview. */
const BLOG_PREVIEW_TTL_MS = 30 * 60 * 1000;

/** Separates this key from every other use of the same secret. The platform verifies with the same context. */
const KEY_CONTEXT = "brandbasket:blog-preview:v1";

/** The page on a client site that renders a draft. Every client site made from our template has it. */
const CLIENT_SITE_PREVIEW_PATH = "/blog/preview";

export interface BlogPreviewClaims {
  readonly businessId: string;
  readonly postId: string;
}

export function signBlogPreviewToken(secret: string, claims: BlogPreviewClaims, now: Date): string {
  const wire = { b: claims.businessId, p: claims.postId, e: now.getTime() + BLOG_PREVIEW_TTL_MS };
  const encoded = Buffer.from(JSON.stringify(wire)).toString("base64url");
  const key = createHmac("sha256", secret).update(KEY_CONTEXT).digest();
  return `${encoded}.${createHmac("sha256", key).update(encoded).digest("base64url")}`;
}

/** The link that opens one of this business's posts, as a draft, on its own website. */
export function blogPreviewUrl(secret: string, websiteUrl: string, claims: BlogPreviewClaims, now: Date): string {
  const url = new URL(CLIENT_SITE_PREVIEW_PATH, websiteUrl);
  url.searchParams.set("token", signBlogPreviewToken(secret, claims, now));
  return url.toString();
}
