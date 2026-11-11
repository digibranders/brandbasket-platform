import { getAppDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { requireCustomer } from "@/lib/guards";
import { allowsAnyLocalHost } from "@/lib/server-media/app-origin";
import { consumeUploadAllowance, storeBrandImage } from "@/lib/server-media/onboarding-media";
import { guardOrNull, tenantForUpload } from "@/lib/server-media/route-guard";
import { handleUploadRequest } from "@/lib/server-media/upload-request";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS, hasDecodeCapacity } from "@brandbasket/shared/server/media-upload";

/**
 * Logo and photo uploads from the Business page, after the website is built: `POST /api/brand-assets?purpose=logo|photo`. The
 * same checks, limits and image processing as `/api/uploads`, but there is no onboarding to be open, so it never refuses for
 * that. The business and the person come from the guard's session; the photo limit and the replacing of a logo are checked
 * under a lock in the database. A member of a business, billing not read, as before.
 */
export async function POST(request: Request): Promise<Response> {
  return handleUploadRequest(request, {
    getTenant: async () => tenantForUpload(await guardOrNull(requireCustomer)),
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    isOnboardingOpen: async () => true,
    decodeBusy: () => (hasDecodeCapacity() ? null : { message: BUSY_MESSAGE, retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS }),
    consumeAllowance: (tenant) => consumeUploadAllowance(getAppDb(), tenant),
    store: (tenant, purpose, upload) => storeBrandImage({ appDb: getAppDb(), storage: getMediaStorage() }, tenant, purpose, upload),
  });
}
