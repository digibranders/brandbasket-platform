import { findLiveProductPhotoFile, findPreviewProductPhotoFile } from "@brandbasket/db";
import { storedPictureResponse } from "@brandbasket/shared/server/media-serving";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { getStaffDb } from "@/lib/server/db";
import { handlePictureRequest } from "@/lib/server/directory-intake";
import { previewCodeOf, privately } from "@/lib/server/preview-picture";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/** A photo its product no longer has, or whose business has no approved listing: nothing to tell them apart by. */
function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/**
 * `GET /api/directory/product-pictures/<id>` — one product's photo, for the marketing website to pass on to its visitors
 * from its own origin. `?w=320` or `?w=640` asks for the smaller copy made at upload. Server-to-server only, with
 * LEADS_API_TOKEN (see lib/server/directory-intake.ts); lives under /api/, which proxy.ts skips, so it answers on
 * either dashboard host. Only a photo its product still has, for a business whose listing is approved, is served,
 * except for the owner's live preview of a page that is not live yet: with `?previewFor=<the page's address code>` a
 * photo of that business is served, and never cached (lib/server/preview-picture.ts).
 */
export async function GET(request: Request, context: RouteContext<"/api/directory/product-pictures/[photoId]">): Promise<Response> {
  const { photoId } = await context.params;
  return handlePictureRequest(request, photoId, {
    token: leadsApiToken(),
    servePicture: async (id, ifNoneMatch, width) => {
      const code = previewCodeOf(request);
      if (code !== null) {
        const previewed = await findPreviewProductPhotoFile(getStaffDb(), id, code);
        return previewed === null ? notFound() : privately(await storedPictureResponse(getMediaStorage(), previewed, null, width));
      }
      const photo = await findLiveProductPhotoFile(getStaffDb(), id);
      return photo === null ? notFound() : storedPictureResponse(getMediaStorage(), photo, ifNoneMatch, width);
    },
  });
}
