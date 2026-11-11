import { loadActiveServices } from "@/lib/server/active-services";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { serverEnv } from "@/lib/server/env";
import { socialAutoSettings, uploadPicture } from "@/lib/server/social-auto";
import { handleSocialPictureRequest } from "@/lib/server/social-picture-request";
import { allowsAnyLocalHost } from "@/lib/surfaces";

/**
 * A new post's picture: `POST /api/social-posts/picture`, the raw JPG bytes. Under /api/ for the same reasons as the other
 * upload routes (proxy.ts skips the prefix, so Next never copies the body), so the handler checks the Host itself. See
 * handleSocialPictureRequest for the checks and their order.
 */
export async function POST(request: Request): Promise<Response> {
  return handleSocialPictureRequest(request, {
    getTenant: getCustomerTenant,
    appOrigin: serverEnv().APP_ORIGIN,
    anyLocalHost: allowsAnyLocalHost(process.env),
    hasSocial: async (tenant) => (await loadActiveServices(tenant)).includes("social"),
    store: async (picture) => {
      const settings = socialAutoSettings();
      return settings === null ? null : uploadPicture(settings, picture);
    },
  });
}
