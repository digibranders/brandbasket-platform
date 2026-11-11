import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { loadActiveServices } from "@/lib/server/active-services";
import { fetchPosterImage, socialAutoSettings } from "@/lib/server/social-auto";
import { socialBrand } from "@/lib/server/social-brand";

const POSTER_ID = /^[A-Za-z0-9._-]{1,120}$/;

const refuse = (status: number): Response => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/**
 * A picture waiting for the customer's OK: `GET /api/social-posters/image?id=<picture id>`. The picture is kept by social-auto, which
 * answers only to our key, so the browser asks here and this route asks for it with the signed-in customer's own business. A
 * customer sees only pictures of their own business. Under /api/ like the other image routes (proxy.ts skips the prefix), so every
 * check is here: a signed-in customer with the social service, and an id that looks like one.
 */
export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!POSTER_ID.test(id)) return refuse(400);
  const tenant = await getCustomerTenant();
  if (tenant === null) return refuse(401);
  if (!(await loadActiveServices(tenant)).includes("social")) return refuse(403);
  try {
    const settings = socialAutoSettings();
    if (settings === null) return refuse(503);
    const bytes = await fetchPosterImage(settings, (await socialBrand(tenant)).externalId, id);
    if (bytes === null) return refuse(404);
    return new Response(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[social] could not read a picture", error instanceof Error ? error.message : "unknown");
    return refuse(502);
  }
}
