import { getCustomerBilling, getCustomerBusinessEntry, isAwaitingMembership } from "@/lib/server/customer-access";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { canAddListingPictures } from "@/lib/server/listing-pictures";
import { BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS, hasDecodeCapacity } from "@/lib/server/media-upload";
import { consumeUploadAllowance } from "@/lib/server/onboarding-media";
import { handleProductPhotoRequest } from "@/lib/server/product-photo-request";
import { storeProductPhoto } from "@/lib/server/product-photos";
import { allowsAnyLocalHost } from "@/lib/surfaces";
import { getMediaStorage } from "@firstfold/shared/server/media-storage";

/**
 * A product's photo: `POST /api/product-photos?product=<id>`, the raw image bytes. Under /api/ for the same reasons as
 * /api/listing-pictures: proxy.ts skips the prefix, so Next never copies the body for the proxy, and the handler
 * checks the Host itself. The upload shares the business's hourly image budget with every other upload. See
 * handleProductPhotoRequest for the checks and their order.
 */
export async function POST(request: Request): Promise<Response> {
  return handleProductPhotoRequest(request, {
    getTenant: getCustomerTenant,
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    // The same rule as the listing's pictures: a paid-up member with a listing; the Care plan has none.
    canAddPhotos: async (tenant) =>
      !isAwaitingMembership(await getCustomerBusinessEntry(tenant.userId, tenant.businessId)) &&
      (await getCustomerBilling(tenant.userId, tenant.businessId)).tier !== "care" &&
      (await canAddListingPictures(getAppDb(), tenant)),
    decodeBusy: () => (hasDecodeCapacity() ? null : { message: BUSY_MESSAGE, retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS }),
    consumeAllowance: (tenant) => consumeUploadAllowance(getAppDb(), tenant),
    store: (tenant, productId, bytes) => storeProductPhoto({ staffDb: getStaffDb(), storage: getMediaStorage() }, tenant, productId, bytes),
  });
}
