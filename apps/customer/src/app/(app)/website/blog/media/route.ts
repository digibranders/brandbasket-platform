import { handleBlogUpload, ownsImageTarget, storeBlogImage } from "@/features/blog/server/media";
import { getBlogPayload } from "@/features/blog/server/payload";
import { canWriteBlog } from "@/features/blog/server/access";
import { refuseUpload, UPLOAD_RELOAD_MESSAGE } from "@/features/checklist/server/upload-request";
import { getAppDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { requireWebsite } from "@/lib/guards";
import { consumeUploadAllowance } from "@/lib/server-media/onboarding-media";
import { getSessionUser } from "@/lib/session";
import type { TenantContext } from "@brandbasket/shared/lib/access";

/** A guard's redirect (unpaid, lapsed, no website) reaches a route handler as a thrown error with this digest. */
function isRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}

/** The guard runs here, in the handler. A redirect is no use to a script that posts an image, so it becomes a refusal. */
async function uploadTenant(): Promise<TenantContext | Response | null> {
  if ((await getSessionUser()) === null) return null;
  try {
    const customer = await requireWebsite({ write: true });
    return canWriteBlog(customer) ? customer.tenant : refuseUpload(403, "Only the owner or an editor can add images.");
  } catch (error) {
    if (isRedirect(error)) return refuseUpload(403, UPLOAD_RELOAD_MESSAGE);
    throw error;
  }
}

/** A cover image (`?post=<id>`) or an author photo (`?author=<id>`): `handleBlogUpload` has the checks and their order. */
export async function POST(request: Request): Promise<Response> {
  return handleBlogUpload(request, {
    getTenant: uploadTenant,
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: process.env.NODE_ENV === "development",
    ownsTarget: async (tenant, target) => ownsImageTarget(await getBlogPayload(), tenant.businessId, target),
    consumeAllowance: (tenant) => consumeUploadAllowance(getAppDb(), tenant),
    store: async (tenant, target, image) => storeBlogImage(await getBlogPayload(), tenant.businessId, target, image),
  });
}
