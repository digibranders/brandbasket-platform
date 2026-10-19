import type { NextRequest } from "next/server";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";
import { serveTenantMedia } from "@brandbasket/shared/server/media-serving";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";

/**
 * A customer's own uploaded image, reached as `/media/{mediaId}` on the app host. Image requests cannot follow a
 * sign-in redirect usefully, so a visitor without access gets a bare 401 instead of the login page. Access needs a
 * session and a business only; billing is not read.
 */
export async function GET(request: NextRequest, context: RouteContext<"/app-host/media/[mediaId]">): Promise<Response> {
  const tenant = await getCustomerTenant();
  if (tenant === null) {
    return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const { mediaId } = await context.params;
  const ifNoneMatch = request.headers.get("if-none-match");
  return serveTenantMedia(getAppDb(), getMediaStorage(), tenant, mediaId, ifNoneMatch);
}
