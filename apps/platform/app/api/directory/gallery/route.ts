import { getStaffDb } from "@/lib/server/db";
import { galleryDeps, readGalleries } from "@/lib/server/directory-gallery";
import { handleGalleryRequest } from "@/lib/server/directory-intake";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/**
 * `GET /api/directory/gallery?ids=i1,i2,…` and/or `?keys=k1,k2,…`: the gallery photos and live videos of up to 50
 * directory businesses, keyed by what was asked, for the marketing website's business pages. Server-to-server only,
 * with LEADS_API_TOKEN (see lib/server/directory-intake.ts); lives under /api/, which proxy.ts skips, so it answers on
 * either dashboard host. The photos are picture ids, read through GET /api/directory/pictures/<id>; a video comes as
 * the address of Vimeo's player for it and its poster.
 */
export function GET(request: Request): Promise<Response> {
  const deps = galleryDeps(getStaffDb());
  return handleGalleryRequest(request, { token: leadsApiToken(), readGalleries: (ask) => readGalleries(ask, deps) });
}
