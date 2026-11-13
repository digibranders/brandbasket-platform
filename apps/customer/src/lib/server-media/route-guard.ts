import type { CustomerContext } from "@/lib/guards";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { refuseUpload } from "./upload-request";

/** What a script that posts an image is told when the signed-in person may look at the business but not change it. */
export const UPLOAD_VIEWER_MESSAGE = "Only the owner or an editor can add images.";

/** A guard's `redirect()` reaches a route handler as a thrown error with this digest. */
function isRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}

/**
 * Runs a guard from `@/lib/guards` inside a route handler. A guard answers a refused visitor with a redirect to a sign-in or
 * billing page, which an `<img>` or a `fetch()` cannot use, so here the redirect becomes `null` and the handler answers with
 * a bare status instead. Any other error is rethrown.
 */
export async function guardOrNull<T>(guard: () => Promise<T>): Promise<T | null> {
  try {
    return await guard();
  } catch (error) {
    if (isRedirect(error)) return null;
    throw error;
  }
}

/**
 * The tenant an image upload is for, from the context a guard returned (null when it redirected): null for no session or no
 * business, a 403 for a viewer, who may look but not add (the database refuses a viewer's write too, but only after the file
 * was stored).
 */
export function tenantForUpload(customer: Pick<CustomerContext, "role" | "tenant"> | null): TenantContext | Response | null {
  if (customer === null) return null;
  if (customer.role === "viewer") return refuseUpload(403, UPLOAD_VIEWER_MESSAGE);
  return customer.tenant;
}
