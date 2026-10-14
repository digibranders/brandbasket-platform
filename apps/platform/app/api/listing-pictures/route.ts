import { getCustomerBilling, getCustomerBusinessEntry, isAwaitingMembership } from "@/lib/server/customer-access";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { serverEnv } from "@/lib/server/env";
import { allowsAnyLocalHost } from "@/lib/surfaces";
import { handleListingPictureRequest } from "@/lib/server/listing-picture-request";
import { canAddListingPictures, storeListingPicture } from "@/lib/server/listing-pictures";
import { BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS, hasDecodeCapacity } from "@/lib/server/media-upload";
import { consumeUploadAllowance } from "@/lib/server/onboarding-media";
import { getMediaStorage } from "@fynix/shared/server/media-storage";

/**
 * A free listing account's pictures: `POST /api/listing-pictures?slot=listing|ad_tall|ad_wide`, the raw bytes the
 * crop window made. Under /api/ for the same reasons as /api/uploads: proxy.ts skips the prefix, so Next never copies
 * the body for the proxy, and the handler checks the Host itself. The upload shares the business's hourly image
 * budget with every other upload. See handleListingPictureRequest for the checks and their order.
 */
export async function POST(request: Request): Promise<Response> {
  return handleListingPictureRequest(request, {
    getTenant: getCustomerTenant,
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    // An owner who chose a plan and has not paid has no Photos page yet (requireCustomerAccess), so no upload either;
    // and pictures for the listing are not part of the Care plan.
    canAddPictures: async (tenant) =>
      !isAwaitingMembership(await getCustomerBusinessEntry(tenant.userId, tenant.businessId)) &&
      (await getCustomerBilling(tenant.userId, tenant.businessId)).tier !== "care" &&
      (await canAddListingPictures(getAppDb(), tenant)),
    decodeBusy: () =>
      hasDecodeCapacity() ? null : { message: BUSY_MESSAGE, retryAfterSeconds: BUSY_RETRY_AFTER_SECONDS },
    consumeAllowance: (tenant) => consumeUploadAllowance(getAppDb(), tenant),
    store: (tenant, slot, bytes) =>
      storeListingPicture({ staffDb: getStaffDb(), storage: getMediaStorage() }, tenant, slot, bytes, new Date()),
  });
}
