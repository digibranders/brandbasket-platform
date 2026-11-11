import { getAppDb } from "@/lib/db";
import { requireCustomer } from "@/lib/guards";
import { bareStatus } from "@/lib/server-media/bare-status";
import { guardOrNull } from "@/lib/server-media/route-guard";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { serveTenantMedia } from "@brandbasket/shared/server/media-serving";

/**
 * A customer's own uploaded image, reached as `/media/{mediaId}`. An image request cannot follow a sign-in redirect usefully, so
 * a visitor the guard turns away gets a bare 401 instead of the sign-in page. A member of a business is enough; billing is not
 * read.
 */
export async function GET(request: Request, context: { params: Promise<{ mediaId: string }> }): Promise<Response> {
  const customer = await guardOrNull(requireCustomer);
  if (customer === null) return bareStatus(401);
  const { mediaId } = await context.params;
  return serveTenantMedia(getAppDb(), getMediaStorage(), customer.tenant, mediaId, request.headers.get("if-none-match"));
}
