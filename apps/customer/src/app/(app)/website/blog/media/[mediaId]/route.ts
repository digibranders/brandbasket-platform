import { isDocId } from "@/features/blog/rules/paths";
import { serveBlogImage } from "@/features/blog/server/media";
import { getBlogPayload } from "@/features/blog/server/payload";
import { requireWebsite } from "@/lib/guards";
import { getSessionUser } from "@/lib/session";

/** One of the business's blog images, for the editor. Another business's image answers the same 404 as a missing one. */
export async function GET(_request: Request, context: { readonly params: Promise<{ readonly mediaId: string }> }): Promise<Response> {
  if ((await getSessionUser()) === null) return new Response(null, { status: 401, headers: { "Cache-Control": "no-store" } });
  const customer = await requireWebsite();
  const { mediaId } = await context.params;
  if (!isDocId(mediaId)) return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  return serveBlogImage(await getBlogPayload(), mediaId, customer.businessId);
}
