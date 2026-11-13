import { findPreviewImage, withTenantScope } from "@brandbasket/db";
import { getAppDb } from "@/lib/db";
import { requireWebsite } from "@/lib/guards";

const NOSNIFF = { "X-Content-Type-Options": "nosniff" };

/**
 * `GET /website/preview-image`: the picture of the signed-in business's preview, ported from apps/platform. The business
 * comes only from the session and row-level security limits the read to it. `?v=` (when it was taken) is a cache buster.
 */
export async function GET(): Promise<Response> {
  const context = await requireWebsite();
  const picture = await withTenantScope(getAppDb(), context.tenant, findPreviewImage);
  if (picture === null) return new Response(null, { status: 404, headers: NOSNIFF });
  return new Response(new Uint8Array(picture.image), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=31536000, immutable", ...NOSNIFF },
  });
}
