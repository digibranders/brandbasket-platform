import { serverEnv } from "@/lib/env";
import { requireService } from "@/lib/guards";
import { allowsAnyLocalHost } from "@/lib/server-media/app-origin";
import { guardOrNull } from "@/lib/server-media/route-guard";
import { readUploadBody, refuseUpload, refuseUploadEnvelope, UPLOAD_RELOAD_MESSAGE, UPLOAD_SIGNED_OUT_MESSAGE } from "@/lib/server-media/upload-request";
import { looksLikeJpeg, MAX_PICTURE_BYTES } from "@/legacy-social/lib/social/new-post";
import { SocialAutoError, socialAutoSettings, uploadPicture } from "@/legacy-social/server/social-auto";

/**
 * A new post's picture: `POST /api/social-posts/picture`, the raw JPG bytes. The Host, the Origin and the declared length are checked
 * first (a route handler gets no host filtering or origin check of its own), then the session and that the business has Social media,
 * then the body within 4 MB and that it starts like a JPG. The posting service checks the rest (square, 320 to 4096 pixels) and what it
 * refuses is passed on in its own words.
 */
export async function POST(request: Request): Promise<Response> {
  const refused = refuseUploadEnvelope(request, serverEnv().APP_ORIGIN, allowsAnyLocalHost(process.env), { bytes: MAX_PICTURE_BYTES, message: "The picture is too big. Use one under 4 MB." });
  if (refused !== null) return refused;
  const customer = await guardOrNull(() => requireService("social", { write: true }));
  if (customer === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);
  if (customer.role === "viewer") return refuseUpload(403, "Only owners and editors can add pictures.");
  const bytes = await readUploadBody(request);
  if (bytes instanceof Response) return bytes;
  if (!looksLikeJpeg(bytes)) return refuseUpload(415, "The picture must be a JPG.");
  try {
    const settings = socialAutoSettings();
    if (settings === null) return refuseUpload(503, "Posting is not available just now. Try again later.");
    return Response.json({ pictureId: await uploadPicture(settings, bytes) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SocialAutoError && error.detail !== null) return refuseUpload(422, error.detail);
    console.error("[social] could not store a picture", error instanceof Error ? error.message : String(error));
    return refuseUpload(502, UPLOAD_RELOAD_MESSAGE);
  }
}
