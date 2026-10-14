import { findLiveDirectoryPictureFile, findLiveStaffAdPictureFile, findPreviewDirectoryPictureFile } from "@fynix/db";
import { storedPictureResponse } from "@fynix/shared/server/media-serving";
import { getMediaStorage } from "@fynix/shared/server/media-storage";
import { getStaffDb } from "@/lib/server/db";
import { handlePictureRequest } from "@/lib/server/directory-intake";
import { previewCodeOf, privately } from "@/lib/server/preview-picture";
import { leadsApiToken } from "@/lib/server/website-api-auth";

/** A picture that is not approved, was removed or never existed: nothing to tell them apart by. */
function notFound(): Response {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

/**
 * `GET /api/directory/pictures/<id>` — one approved listing picture, for the marketing website to pass on to its
 * visitors from its own origin. `?w=320` or `?w=640` asks for the smaller copy made at upload (the picture itself when
 * there is none). Server-to-server only, with LEADS_API_TOKEN (see lib/server/directory-intake.ts);
 * lives under /api/, which proxy.ts skips, so it answers on either dashboard host. Only a picture that is approved,
 * not removed and whose business's claim is approved is served, except for the owner's live preview of a page that is
 * not live yet: with `?previewFor=<the page's address code>` a picture of that business is served whatever its page's
 * state, and never cached (lib/server/preview-picture.ts).
 */
export async function GET(request: Request, context: RouteContext<"/api/directory/pictures/[pictureId]">): Promise<Response> {
  const { pictureId } = await context.params;
  return handlePictureRequest(request, pictureId, {
    token: leadsApiToken(),
    servePicture: async (id, ifNoneMatch, width) => {
      const db = getStaffDb();
      const code = previewCodeOf(request);
      if (code !== null) {
        const previewed = await findPreviewDirectoryPictureFile(db, id, code);
        return previewed === null ? notFound() : privately(await storedPictureResponse(getMediaStorage(), previewed, null, width));
      }
      // A listing owner's approved picture, or else one staff uploaded for an ad that is still up.
      const picture = (await findLiveDirectoryPictureFile(db, id)) ?? (await findLiveStaffAdPictureFile(db, id));
      return picture === null ? notFound() : storedPictureResponse(getMediaStorage(), picture, ifNoneMatch, width);
    },
  });
}
