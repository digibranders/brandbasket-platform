import "server-only";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { servePayloadMediaFile } from "@/lib/server/payload-media-serving";
import { getStaffAccess } from "@/lib/server/staff-access";

/**
 * `GET /content-media/{mediaId}` on the app host: the customer-facing proxy for a Payload `media` document's file
 * bytes. Nothing here talks to Payload's REST API — see `lib/server/payload-media-serving.ts`'s doc comment and
 * `collections/Media.ts`'s doc comment for why that route can never be used again (its `access.read` now denies
 * every request, including ours, on purpose). This route does its own access check, then reads the file directly
 * through the Local API + a disk read.
 *
 * Access model: a valid customer tenant OR a granted staff session — a customer is scoped to their own
 * `businessId` (checked inside `servePayloadMediaFile`), staff is unscoped (the single-admin model already gives
 * staff blanket access everywhere else in this app). Anyone else gets a bare 401 without even looking up the
 * media document.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/app-host/content-media/[mediaId]">,
): Promise<Response> {
  const [tenant, staff] = await Promise.all([getCustomerTenant(), getStaffAccess()]);
  if (tenant === null && staff.kind !== "granted") {
    return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const { mediaId } = await context.params;
  return servePayloadMediaFile(mediaId, tenant === null ? null : tenant.businessId);
}
