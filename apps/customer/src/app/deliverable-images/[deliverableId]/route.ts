import { findDeliverableForBusiness, withTenantScope } from "@brandbasket/db";
import { storedMediaResponse } from "@brandbasket/shared/server/media-serving";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { z } from "zod";
import { getAppDb } from "@/lib/db";
import { requireCustomer } from "@/lib/guards";
import { bareStatus } from "@/lib/server-media/bare-status";
import { guardOrNull } from "@/lib/server-media/route-guard";

const idSchema = z.uuid();

/**
 * The picture of one of the customer's own posts, reached as `/deliverable-images/{deliverableId}`. The row is read through
 * row-level security, so another business's id, an id with no picture and an id that is not an id all look the same: a bare 404.
 * A visitor the guard turns away gets a bare 401, since an image request cannot follow a sign-in redirect usefully. A member of a
 * business is enough; billing is not read.
 */
export async function GET(request: Request, context: { params: Promise<{ deliverableId: string }> }): Promise<Response> {
  const customer = await guardOrNull(requireCustomer);
  if (customer === null) return bareStatus(401);
  const id = idSchema.safeParse((await context.params).deliverableId);
  if (!id.success) return bareStatus(404);
  const row = await withTenantScope(getAppDb(), customer.tenant, (tx) => findDeliverableForBusiness(tx, customer.businessId, id.data));
  if (row === null || row.imageKey === null || row.imageMime === null || row.imageSha256 === null) return bareStatus(404);
  return storedMediaResponse(getMediaStorage(), { storageKey: row.imageKey, mimeType: row.imageMime, sha256: row.imageSha256 }, request.headers.get("if-none-match"));
}
