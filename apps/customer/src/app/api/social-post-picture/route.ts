import { requireService } from "@/lib/guards";
import { guardOrNull } from "@/lib/server-media/route-guard";
import { isPostingServicePicture } from "@/legacy-social/lib/social/post-picture";
import { socialAutoSettings } from "@/legacy-social/server/social-auto";

const refuse = (status: number): Response => new Response(null, { status, headers: { "Cache-Control": "no-store" } });

const TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * The picture of a post on the calendar: `GET /api/social-post-picture?src=<its address on the posting service>`. The posting service serves
 * poster pictures openly (the networks fetch them), but the browser asks here so the page's security rules need not name the posting service.
 * Only a signed-in customer with Social media, and only an address that is a poster picture of the configured posting service (or of the pictures address, when that is set apart from the API).
 */
export async function GET(request: Request): Promise<Response> {
  const src = new URL(request.url).searchParams.get("src") ?? "";
  const customer = await guardOrNull(() => requireService("social"));
  if (customer === null) return refuse(401);
  try {
    const settings = socialAutoSettings();
    if (settings === null) return refuse(503);
    if (!isPostingServicePicture(src, settings.baseUrl) && !(settings.pictureUrl !== undefined && isPostingServicePicture(src, settings.pictureUrl))) return refuse(400);
    const answer = await fetch(src, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    const type = answer.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
    if (!answer.ok || !TYPES.has(type)) return refuse(answer.status === 404 ? 404 : 502);
    return new Response(await answer.arrayBuffer(), { status: 200, headers: { "Content-Type": type, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    console.error("[social] could not read a post picture", error instanceof Error ? error.message : "unknown");
    return refuse(502);
  }
}
