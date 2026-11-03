import { findDeliverableForBusiness, withTenantScope } from "@brandbasket/db";
import { storedMediaResponse } from "@brandbasket/shared/server/media-serving";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { z } from "zod";
import { getAppDb } from "@/lib/db";
import { requirePaid } from "@/lib/guards";

const BARE = { "Cache-Control": "no-store" } as const;
const idSchema = z.uuid();

/**
 * The picture of one of the customer's own posts (the old app's /deliverable-images/{id}). The row is read through row-level
 * security, so another business's id, an id with no picture and an id that is not an id all look the same: a bare 404.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const customer = await requirePaid();
  const id = idSchema.safeParse((await context.params).id);
  if (!id.success) return new Response(null, { status: 404, headers: BARE });
  const row = await withTenantScope(getAppDb(), customer.tenant, (tx) => findDeliverableForBusiness(tx, customer.businessId, id.data));
  if (row === null || row.imageKey === null || row.imageMime === null || row.imageSha256 === null) return new Response(null, { status: 404, headers: BARE });
  return storedMediaResponse(getMediaStorage(), { storageKey: row.imageKey, mimeType: row.imageMime, sha256: row.imageSha256 }, request.headers.get("if-none-match"));
}
