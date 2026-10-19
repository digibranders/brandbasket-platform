import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { allowsAnyLocalHost } from "@/lib/surfaces";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS, hasDecodeCapacity } from "@/lib/server/media-upload";
import { consumeUploadAllowance, isOnboardingOpen, storeOnboardingImage } from "@/lib/server/onboarding-media";
import { handleUploadRequest } from "@/lib/server/upload-request";

/**
 * Onboarding logo and photo uploads: `POST /api/uploads?purpose=logo|photo`. It lives under /api/ because proxy.ts
 * skips that prefix, so Next never copies the body for the proxy before this handler runs. That also means the proxy
 * does not keep it to the app host, so handleUploadRequest checks the Host itself. A route handler rather than a
 * server action, so the upload's body limit applies here alone and every action keeps the default 1 MB. See
 * handleUploadRequest for the checks and their order.
 */
export async function POST(request: Request): Promise<Response> {
  return handleUploadRequest(request, {
    getTenant: getCustomerTenant,
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    isOnboardingOpen: (tenant) => isOnboardingOpen(getAppDb(), tenant),
    decodeBusy: () =>
      hasDecodeCapacity() ? null : { message: BUSY_MESSAGE, retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS },
    consumeAllowance: (tenant) => consumeUploadAllowance(getAppDb(), tenant),
    store: (tenant, purpose, upload) =>
      storeOnboardingImage({ appDb: getAppDb(), storage: getMediaStorage() }, tenant, purpose, upload),
  });
}
