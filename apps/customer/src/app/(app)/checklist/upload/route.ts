import { getSessionUser } from "@/lib/session";
import { requireWebsite } from "@/lib/guards";
import { getAppDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS, hasDecodeCapacity } from "@brandbasket/shared/server/media-upload";
import { consumeUploadAllowance, isOnboardingOpen, storeOnboardingImage } from "@/features/checklist/server/media";
import { handleUploadRequest, refuseUpload, UPLOAD_RELOAD_MESSAGE, UPLOAD_SIGNED_OUT_MESSAGE } from "@/features/checklist/server/upload-request";
import type { TenantContext } from "@brandbasket/shared/lib/access";

/** A guard's redirect (unpaid, lapsed, no website) reaches a route handler as a thrown error with this digest. */
function isRedirect(error: unknown): boolean {
  return typeof error === "object" && error !== null && "digest" in error && String(error.digest).startsWith("NEXT_REDIRECT");
}

/**
 * The tenant the upload is for: the guard runs here, in the handler, because a layout never protects a route. A guard's
 * redirect is no use to a script that posts an image, so it becomes a refusal. A viewer may look but not add.
 */
async function uploadTenant(): Promise<TenantContext | Response> {
  if ((await getSessionUser()) === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);
  try {
    const customer = await requireWebsite({ write: true });
    return customer.role === "viewer" ? refuseUpload(403, "Only the owner or an editor can add images.") : customer.tenant;
  } catch (error) {
    if (isRedirect(error)) return refuseUpload(403, UPLOAD_RELOAD_MESSAGE);
    throw error;
  }
}

/**
 * Logo and photo uploads: `POST /checklist/upload?purpose=logo|photo`, the raw image bytes in the body. A route handler
 * rather than a server action, so the 4 MB image body is not held to an action's 1 MB limit. handleUploadRequest has the
 * checks and their order.
 */
export async function POST(request: Request): Promise<Response> {
  return handleUploadRequest(request, {
    getTenant: uploadTenant,
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: process.env.NODE_ENV === "development",
    isOnboardingOpen: (who) => isOnboardingOpen(getAppDb(), who),
    decodeBusy: () => (hasDecodeCapacity() ? null : { message: BUSY_MESSAGE, retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS }),
    consumeAllowance: (who) => consumeUploadAllowance(getAppDb(), who),
    store: (who, purpose, upload) => storeOnboardingImage({ appDb: getAppDb(), storage: getMediaStorage() }, who, purpose, upload),
  });
}
