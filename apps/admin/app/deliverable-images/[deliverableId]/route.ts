import { findDeliverableForStaff } from "@brandbasket/db";
import { storedMediaResponse } from "@brandbasket/shared/server/media-serving";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { getStaffAccess } from "@/lib/server/staff-access";

const BARE = { "Cache-Control": "no-store" } as const;
const idSchema = z.uuid();

/**
 * The picture of any business's post, as the console shows it: `/deliverable-images/{deliverableId}` on the admin host.
 * Anyone without staff access gets a bare 401; an unknown id, an id that is not an id and a post with no picture are a
 * bare 404.
 */
export async function GET(request: NextRequest, context: RouteContext<"/deliverable-images/[deliverableId]">): Promise<Response> {
  const access = await getStaffAccess();
  if (access.kind !== "granted") return new Response(null, { status: 401, headers: BARE });
  const id = idSchema.safeParse((await context.params).deliverableId);
  if (!id.success) return new Response(null, { status: 404, headers: BARE });
  const row = await findDeliverableForStaff(getStaffDb(), id.data);
  if (row === null || row.imageKey === null || row.imageMime === null || row.imageSha256 === null) return new Response(null, { status: 404, headers: BARE });
  return storedMediaResponse(getMediaStorage(), { storageKey: row.imageKey, mimeType: row.imageMime, sha256: row.imageSha256 }, request.headers.get("if-none-match"));
}
