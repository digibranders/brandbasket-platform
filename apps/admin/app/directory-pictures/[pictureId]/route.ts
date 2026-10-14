import { findDirectoryPictureFileForStaff } from "@firstfold/db";
import type { NextRequest } from "next/server";
import { storedMediaResponse } from "@firstfold/shared/server/media-serving";
import { getMediaStorage } from "@firstfold/shared/server/media-storage";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";

const BARE = { "Cache-Control": "no-store" } as const;

/**
 * A listing owner's picture as staff see it on the Ads page, approved or not: `/directory-pictures/{pictureId}` on the
 * admin host. Like /media/{mediaId}, anyone without staff access gets a bare 401, and a removed picture is a 404.
 */
export async function GET(request: NextRequest, context: RouteContext<"/directory-pictures/[pictureId]">): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: BARE });
  const { pictureId } = await context.params;
  const picture = await findDirectoryPictureFileForStaff(getStaffDb(), pictureId);
  if (picture === null) return new Response(null, { status: 404, headers: BARE });
  return storedMediaResponse(getMediaStorage(), picture, request.headers.get("if-none-match"));
}
