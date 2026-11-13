import "server-only";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { looksLikeJpeg } from "@/lib/social/new-post";
import { SocialAutoError } from "./social-auto";
import { readUploadBody, refuseUpload, refuseUploadEnvelope, refuseViewer, UPLOAD_RELOAD_MESSAGE, UPLOAD_SIGNED_OUT_MESSAGE } from "./upload-request";

/**
 * `POST /api/social-posts/picture`: the picture for a new post, sent as the raw JPG bytes (a form action cannot carry 4 MB). The
 * same first checks as every image upload on the app host, then:
 *
 * 1-3. the Host, the Origin and the declared length (refuseUploadEnvelope)
 * 4.   a customer session with a business, or 401
 * 5.   a business that has the social service, or 403
 * 6.   the body within 4 MB, or 413
 * 7.   bytes that start like a JPG, or 415
 * 8.   social-auto keeps it: 201 with the picture's id. It checks the rest (square, 320 to 4096 pixels); what it refuses is
 *      passed on as a 422 in its own words, and anything else as a 502.
 */
export interface SocialPictureDeps {
  /** The signed-in customer's business, or null. Reads the session and membership only. */
  readonly getTenant: () => Promise<TenantContext | null>;
  /** Exactly as the browser sends it in Origin: scheme, host and port. */
  readonly appOrigin: string;
  /** Local development only: also take an upload from the dashboard opened on any local address. */
  readonly anyLocalHost?: boolean;
  readonly hasSocial: (tenant: TenantContext) => Promise<boolean>;
  /** Stores the picture in social-auto and answers its id. Null settings (social-auto not set up here) is a 503. */
  readonly store: (picture: Uint8Array) => Promise<string | null>;
}

export async function handleSocialPictureRequest(request: Request, deps: SocialPictureDeps): Promise<Response> {
  const refused = refuseUploadEnvelope(request, deps.appOrigin, deps.anyLocalHost);
  if (refused !== null) return refused;

  const tenant = await deps.getTenant();
  if (tenant === null) return refuseUpload(401, UPLOAD_SIGNED_OUT_MESSAGE);
  const viewer = refuseViewer(tenant);
  if (viewer !== null) return viewer;
  if (!(await deps.hasSocial(tenant))) return refuseUpload(403, "Posting is not part of your plan yet.");

  const bytes = await readUploadBody(request);
  if (bytes instanceof Response) return bytes;
  if (!looksLikeJpeg(bytes)) return refuseUpload(415, "The picture must be a JPG.");

  try {
    const pictureId = await deps.store(bytes);
    if (pictureId === null) return refuseUpload(503, "Posting is not available just now. Try again later.");
    return Response.json({ pictureId }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof SocialAutoError && error.detail !== null) return refuseUpload(422, error.detail);
    console.error("[social] could not store a picture", error instanceof Error ? error.message : String(error));
    return refuseUpload(502, UPLOAD_RELOAD_MESSAGE);
  }
}
