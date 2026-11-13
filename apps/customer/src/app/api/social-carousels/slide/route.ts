import { brandOf } from "@/features/social/brand";
import { requireService } from "@/lib/guards";
import { guardOrNull } from "@/lib/server-media/route-guard";
import { fetchCarouselSlide, socialAutoSettings } from "@/legacy-social/server/social-auto";

const CAROUSEL_ID = /^[A-Za-z0-9._-]{1,120}$/;
const MAX_SLIDE = 10;

const refuse = (status: number): Response => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/**
 * One slide of the customer's carousel: `GET /api/social-carousels/slide?id=<carousel id>&slide=<position>`. The slides are kept by the
 * posting service, which answers only to our key, so the browser asks here and this route asks for it with the signed-in customer's own
 * brand: a customer sees only their own business's slides. A route handler gets no page guard, so the checks are here: a signed-in
 * customer with Social media, an id that looks like one, and a slide number that is a small whole number.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const id = params.get("id") ?? "";
  const slide = Number(params.get("slide") ?? "");
  if (!CAROUSEL_ID.test(id) || !Number.isInteger(slide) || slide < 1 || slide > MAX_SLIDE) return refuse(400);
  const customer = await guardOrNull(() => requireService("social"));
  if (customer === null) return refuse(401);
  try {
    const settings = socialAutoSettings();
    if (settings === null) return refuse(503);
    const bytes = await fetchCarouselSlide(settings, (await brandOf(customer)).externalId, id, slide);
    if (bytes === null) return refuse(404);
    return new Response(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[social] could not read a carousel slide", error instanceof Error ? error.message : "unknown");
    return refuse(502);
  }
}
