import { findDeliverableForBusiness, withTenantScope } from "@brandbasket/db";
import { storedMediaResponse } from "@brandbasket/shared/server/media-serving";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";

const BARE = { "Cache-Control": "no-store" } as const;
const idSchema = z.uuid();

/**
 * The picture of one of the customer's own posts, reached as `/deliverable-images/{deliverableId}` on the app host. The
 * row is read through row-level security, so another business's id, an id with no picture and an id that is not an id all
 * look the same: a bare 404. A visitor without a business gets a bare 401, since an image request cannot follow a sign-in
 * redirect usefully. Access needs a session and a business only; billing is not read.
 */
export async function GET(request: NextRequest, context: RouteContext<"/app-host/deliverable-images/[deliverableId]">): Promise<Response> {
  const tenant = await getCustomerTenant();
  if (tenant === null) return new Response(null, { status: 401, headers: BARE });
  const id = idSchema.safeParse((await context.params).deliverableId);
  if (!id.success) return new Response(null, { status: 404, headers: BARE });
  const row = await withTenantScope(getAppDb(), tenant, (tx) => findDeliverableForBusiness(tx, tenant.businessId, id.data));
  if (row === null || row.imageKey === null || row.imageMime === null || row.imageSha256 === null) return new Response(null, { status: 404, headers: BARE });
  return storedMediaResponse(getMediaStorage(), { storageKey: row.imageKey, mimeType: row.imageMime, sha256: row.imageSha256 }, request.headers.get("if-none-match"));
}
