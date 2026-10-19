import { findStaffAdPictureFileForStaff } from "@brandbasket/db";
import type { NextRequest } from "next/server";
import { storedMediaResponse } from "@brandbasket/shared/server/media-serving";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";

const BARE = { "Cache-Control": "no-store" } as const;

/**
 * The picture staff uploaded for an ad they placed, as the Ads page shows it: `/staff-ad-pictures/{pictureId}` on the
 * admin host. Like /directory-pictures/{pictureId}, anyone without staff access gets a bare 401, and a picture whose ads
 * were all taken down is a 404.
 */
export async function GET(request: NextRequest, context: RouteContext<"/staff-ad-pictures/[pictureId]">): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: BARE });
  const { pictureId } = await context.params;
  const picture = await findStaffAdPictureFileForStaff(getStaffDb(), pictureId);
  if (picture === null) return new Response(null, { status: 404, headers: BARE });
  return storedMediaResponse(getMediaStorage(), picture, request.headers.get("if-none-match"));
}
