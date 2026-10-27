import { findPreviewImage, withTenantScope } from "@brandbasket/db";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";

const bare = (status: number): Response => new Response(null, { status, headers: { "X-Content-Type-Options": "nosniff" } });

/**
 * `GET /website/preview-image`: the picture of the signed-in business's preview. The business comes only from the session,
 * and row-level security limits the read to it, so another business's session finds nothing (404). The address carries
 * `?v=` (when the picture was taken) so a new picture is a new address and the old one can be cached for good.
 */
export async function GET(): Promise<Response> {
  const tenant = await getCustomerTenant();
  if (tenant === null) return bare(401);
  const picture = await withTenantScope(getAppDb(), tenant, (tx) => findPreviewImage(tx));
  if (picture === null) return bare(404);
  return new Response(new Uint8Array(picture.image), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
