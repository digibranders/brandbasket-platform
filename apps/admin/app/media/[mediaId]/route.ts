import type { NextRequest } from "next/server";
import { getStaffDb } from "@/lib/server/db";
import { serveStaffMedia } from "@firstfold/shared/server/media-serving";
import { getMediaStorage } from "@firstfold/shared/server/media-storage";
import { getStaffAccess } from "@/lib/server/staff-access";

/**
 * A customer's uploaded image, as staff see it on a client's page: `/media/{mediaId}` on the admin host. Image
 * requests can't follow a sign-in redirect usefully, so anyone without staff access gets a bare 401.
 */
export async function GET(request: NextRequest, context: RouteContext<"/media/[mediaId]">): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") {
    return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const { mediaId } = await context.params;
  const ifNoneMatch = request.headers.get("if-none-match");
  return serveStaffMedia(getStaffDb(), getMediaStorage(), mediaId, ifNoneMatch);
}
