import "server-only";
import { randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "@/payload.config";
import { toSitePost, type RawSitePost, type SitePost } from "@/lib/site-post";

export type { SitePost } from "@/lib/site-post";

/**
 * The read-only API a client's own website uses to fetch its blog posts.
 *
 * Each business gets its own bearer token, stored on its Payload `tenants` document. The token identifies the
 * business, so a request never names one: there is no business id to forge or enumerate, and a token can only
 * ever reach the posts of the business it belongs to.
 *
 * Everything here reads Payload's database only. The main database is not touched, which is why no Postgres role
 * is needed for this endpoint (see docs/superpowers/plans/2026-09-21-tenant-site-renderer.md for the read-only
 * role that the retired renderer used and why it is gone).
 */

/** 32 bytes of hex. Long enough that guessing is hopeless, short enough to paste into an env var. */
const TOKEN_BYTES = 32;

export function newSiteApiToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

interface RawTenant {
  readonly businessId?: unknown;
  readonly name?: unknown;
}

export interface SiteApiTenant {
  readonly businessId: string;
  readonly name: string;
}

/**
 * The business a bearer token belongs to, or null when the token is unknown or empty.
 *
 * A blank token must never match a tenant that has no token set, which is why the empty case is refused before
 * the query rather than relying on the `equals` filter.
 */
export async function findTenantBySiteToken(token: string): Promise<SiteApiTenant | null> {
  const trimmed = token.trim();
  if (trimmed === "") return null;

  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "tenants",
    where: { siteApiToken: { equals: trimmed } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  });

  const tenant = (result.docs as unknown as readonly RawTenant[])[0];
  if (tenant === undefined) return null;
  if (typeof tenant.businessId !== "string" || typeof tenant.name !== "string") return null;
  return { businessId: tenant.businessId, name: tenant.name };
}

/**
 * A business's published posts, newest first. Scheduled posts (a publish date still ahead) are left out. Drafts are never returned: `status` is filtered here rather than
 * after the fact, so an unpublished post cannot reach a public website even momentarily.
 */
export async function listPublishedPosts(businessId: string, now: Date = new Date()): Promise<readonly SitePost[]> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "blogPosts",
    where: {
      and: [
        { businessId: { equals: businessId } },
        { status: { equals: "published" } },
        // A publish date still ahead means scheduled: the post goes live on its own once that moment passes.
        { or: [{ publishedAt: { less_than_equal: now.toISOString() } }, { publishedAt: { exists: false } }] },
      ],
    },
    sort: "-publishedAt",
    depth: 1, // resolves coverImage to an object carrying its id
    limit: 200,
    overrideAccess: true,
  });

  return (result.docs as unknown as readonly RawSitePost[]).map(toSitePost);
}

/**
 * One of a business's posts, draft or published, for "Preview on my website". The business is part of the query, so
 * a post id belonging to another business finds nothing. Only ever called after the preview token's signature and
 * business have been checked (lib/server/blog-preview-request.ts).
 */
export async function findPreviewPost(businessId: string, postId: string): Promise<SitePost | null> {
  const payload = await getPayload({ config });
  const result = await payload.find({
    collection: "blogPosts",
    where: { and: [{ businessId: { equals: businessId } }, { id: { equals: postId } }] },
    depth: 1,
    limit: 1,
    overrideAccess: true,
  });
  const post = (result.docs as unknown as readonly RawSitePost[])[0];
  return post === undefined ? null : toSitePost(post);
}
