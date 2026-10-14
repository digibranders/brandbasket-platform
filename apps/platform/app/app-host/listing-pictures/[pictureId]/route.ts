import { findOwnDirectoryPictureFile, withTenantScope } from "@fynix/db";
import type { NextRequest } from "next/server";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";
import { storedMediaResponse } from "@fynix/shared/server/media-serving";
import { getMediaStorage } from "@fynix/shared/server/media-storage";

const BARE = { "Cache-Control": "no-store" } as const;

/**
 * A listing account's own picture, whatever staff have said about it, reached as `/listing-pictures/{pictureId}` on
 * the app host: the Photos page shows the owner what they uploaded while it waits. Like /media/{mediaId}, a visitor
 * without a session gets a bare 401, and another business's picture, a removed one and a malformed id are all 404.
 */
export async function GET(request: NextRequest, context: RouteContext<"/app-host/listing-pictures/[pictureId]">): Promise<Response> {
  const tenant = await getCustomerTenant();
  if (tenant === null) return new Response(null, { status: 401, headers: BARE });
  const { pictureId } = await context.params;
  const picture = await withTenantScope(getAppDb(), tenant, (tx) => findOwnDirectoryPictureFile(tx, tenant.businessId, pictureId));
  if (picture === null) return new Response(null, { status: 404, headers: BARE });
  return storedMediaResponse(getMediaStorage(), picture, request.headers.get("if-none-match"));
}
