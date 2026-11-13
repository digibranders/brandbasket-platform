import { brandOf } from "@/features/social/brand";
import { requireService } from "@/lib/guards";
import { guardOrNull } from "@/lib/server-media/route-guard";
import { fetchPosterImage, socialAutoSettings } from "@/legacy-social/server/social-auto";

const POSTER_ID = /^[A-Za-z0-9._-]{1,120}$/;

const refuse = (status: number): Response => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

/**
 * A picture waiting for the customer's OK: `GET /api/social-posters/image?id=<picture id>`. The picture is kept by the posting service,
 * which answers only to our key, so the browser asks here and this route asks for it with the signed-in customer's own brand: a customer
 * sees only pictures of their own business. A route handler gets no page guard, so the checks are here: a signed-in customer with Social
 * media, and an id that looks like one.
 */
export async function GET(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!POSTER_ID.test(id)) return refuse(400);
  const customer = await guardOrNull(() => requireService("social"));
  if (customer === null) return refuse(401);
  try {
    const settings = socialAutoSettings();
    if (settings === null) return refuse(503);
    const bytes = await fetchPosterImage(settings, (await brandOf(customer)).externalId, id);
    if (bytes === null) return refuse(404);
    return new Response(Buffer.from(bytes), { status: 200, headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[social] could not read a picture", error instanceof Error ? error.message : "unknown");
    return refuse(502);
  }
}
