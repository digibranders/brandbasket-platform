import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { allowsAnyLocalHost } from "@/lib/surfaces";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS, hasDecodeCapacity } from "@/lib/server/media-upload";
import { consumeUploadAllowance, storeBrandImage } from "@/lib/server/onboarding-media";
import { handleUploadRequest } from "@/lib/server/upload-request";

/**
 * Logo and photo uploads from the Business page, after the website is built: `POST /api/brand-assets?purpose=logo|photo`. The
 * same checks, limits and image processing as the onboarding route (`/api/uploads`), but there is no onboarding to be open, so
 * it never refuses for that. Under /api/ for the same reason: the proxy skips it, so the body is never copied. The business and
 * the person come from the session; the photo limit and the replacing of a logo are checked under a lock in the database.
 */
export async function POST(request: Request): Promise<Response> {
  return handleUploadRequest(request, {
    getTenant: getCustomerTenant,
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    isOnboardingOpen: async () => true,
    decodeBusy: () => (hasDecodeCapacity() ? null : { message: BUSY_MESSAGE, retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS }),
    consumeAllowance: (tenant) => consumeUploadAllowance(getAppDb(), tenant),
    store: (tenant, purpose, upload) => storeBrandImage({ appDb: getAppDb(), storage: getMediaStorage() }, tenant, purpose, upload),
  });
}
