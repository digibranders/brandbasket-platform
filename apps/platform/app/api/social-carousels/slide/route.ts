import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { loadActiveServices } from "@/lib/server/active-services";
import { fetchCarouselSlide, socialAutoSettings } from "@/lib/server/social-auto";
import { socialBrand } from "@/lib/server/social-brand";

const CAROUSEL_ID = /^[A-Za-z0-9._-]{1,120}$/;
const MAX_SLIDE = 10;

const refuse = (status: number): Response => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/**
 * One slide of the customer's carousel: `GET /api/social-carousels/slide?id=<carousel id>&slide=<position>`. The slides are kept by
 * social-auto, which answers only to our key, so the browser asks here and this route asks for it with the signed-in customer's own
 * business: a customer sees only their own slides. Under /api/ like the other image routes (proxy.ts skips the prefix), so every check is
 * here: a signed-in customer with the social service, an id that looks like one, and a slide number that is a small whole number.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  const slide = Number(params.get("slide") ?? "");
  if (!CAROUSEL_ID.test(id) || !Number.isInteger(slide) || slide < 1 || slide > MAX_SLIDE) return refuse(400);
  const tenant = await getCustomerTenant();
  if (tenant === null) return refuse(401);
  if (!(await loadActiveServices(tenant)).includes("social")) return refuse(403);
  try {
    const settings = socialAutoSettings();
    if (settings === null) return refuse(503);
    const bytes = await fetchCarouselSlide(settings, (await socialBrand(tenant)).externalId, id, slide);
    if (bytes === null) return refuse(404);
    return new Response(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[social] could not read a carousel slide", error instanceof Error ? error.message : "unknown");
    return refuse(502);
  }
}
