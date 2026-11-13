import "server-only";
import { findBusinessWebsiteUrl, withTenantScope } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { signBlogPreviewToken } from "./blog-preview-token";
import { getAppDb } from "./db";
import { serverEnv } from "./env";

/** The page on a client site that renders a draft. Every client site made from our template has it. */
const CLIENT_SITE_PREVIEW_PATH = "/blog/preview";

/**
 * The key preview links are signed with. The auth secret, not a new one: it is already on every deployment, and the
 * token module derives a separate key from it (see KEY_CONTEXT there), so no auth signature and no preview signature
 * can ever be swapped for one another.
 */
export function blogPreviewSecret(): string {
  return serverEnv().BETTER_AUTH_SECRET;
}

/** Where the signed-in business's own website lives, read on the customer's own connection. Null hides the button. */
export function getOwnWebsiteUrl(tenant: TenantContext): Promise<string | null> {
  return withTenantScope(getAppDb(), tenant, (tx) => findBusinessWebsiteUrl(tx, tenant.businessId));
}

/** The link that opens one of this business's posts, as a draft, on its own website. Valid for 30 minutes. */
export function blogPreviewUrl(websiteUrl: string, businessId: string, postId: string, now: Date): string {
  const url = new URL(CLIENT_SITE_PREVIEW_PATH, websiteUrl);
  url.searchParams.set("token", signBlogPreviewToken(blogPreviewSecret(), { businessId, postId }, now));
  return url.toString();
}
