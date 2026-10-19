import { findOwnProductPhotoFile, withTenantScope } from "@brandbasket/db";
import type { NextRequest } from "next/server";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";
import { storedMediaResponse } from "@brandbasket/shared/server/media-serving";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";

const BARE = { "Cache-Control": "no-store" } as const;

/**
 * A business's own product photo, reached as `/product-photos/{photoId}` on the app host: the Products tab shows the
 * owner what they uploaded. Like /listing-pictures/{pictureId}, a visitor without a session gets a bare 401, and another
 * business's photo, a removed one and a malformed id are all 404.
 */
export async function GET(request: NextRequest, context: RouteContext<"/app-host/product-photos/[photoId]">): Promise<Response> {
  const tenant = await getCustomerTenant();
  if (tenant === null) return new Response(null, { status: 401, headers: BARE });
  const { photoId } = await context.params;
  const photo = await withTenantScope(getAppDb(), tenant, (tx) => findOwnProductPhotoFile(tx, tenant.businessId, photoId));
  if (photo === null) return new Response(null, { status: 404, headers: BARE });
  return storedMediaResponse(getMediaStorage(), photo, request.headers.get("if-none-match"));
}
