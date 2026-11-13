import { getAppDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { requireCustomer } from "@/lib/guards";
import { allowsAnyLocalHost } from "@/lib/server-media/app-origin";
import { consumeUploadAllowance, isOnboardingOpen, storeOnboardingImage } from "@/lib/server-media/onboarding-media";
import { guardOrNull, tenantForUpload } from "@/lib/server-media/route-guard";
import { handleUploadRequest } from "@/lib/server-media/upload-request";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS, hasDecodeCapacity } from "@brandbasket/shared/server/media-upload";

/**
 * Onboarding logo and photo uploads: `POST /api/uploads?purpose=logo|photo`, the raw image bytes. A route handler rather than
 * a server action, so the 4 MB image body is not held to an action's 1 MB limit. A route handler gets no host filtering, so
 * handleUploadRequest checks the Host and Origin itself, and runs the checks in a fixed order (see it). The guard runs here:
 * a member of a business, billing not read, as before.
 */
export async function POST(request: Request): Promise<Response> {
  return handleUploadRequest(request, {
    getTenant: async () => tenantForUpload(await guardOrNull(requireCustomer)),
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    isOnboardingOpen: (tenant) => isOnboardingOpen(getAppDb(), tenant),
    decodeBusy: () => (hasDecodeCapacity() ? null : { message: BUSY_MESSAGE, retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS }),
    consumeAllowance: (tenant) => consumeUploadAllowance(getAppDb(), tenant),
    store: (tenant, purpose, upload) => storeOnboardingImage({ appDb: getAppDb(), storage: getMediaStorage() }, tenant, purpose, upload),
  });
}
