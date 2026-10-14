import { MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE, UPLOAD_FILE_NAME_HEADER } from "./limits";
import { prepareImageForUpload } from "./prepare-image";

/** `POST /api/content-media-uploads`'s own two response shapes. */
type UploadResponseBody = { readonly media: { readonly id: string } } | { readonly error: string };

export const CONTENT_MEDIA_UPLOAD_ROUTE = "/api/content-media-uploads";

export type ContentMediaUploadResult =
  | { readonly ok: true; readonly mediaId: string }
  | { readonly ok: false; readonly message: string };

const UNREACHABLE_MESSAGE = "We couldn't upload that file. Check your connection and try again.";
const UNEXPECTED_MESSAGE = "Something went wrong with that upload. Reload the page and try again.";
const PAYLOAD_TOO_LARGE = 413;

function errorMessageOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = (body as { readonly error?: unknown }).error;
  return typeof error === "string" && error !== "" ? error : null;
}

function mediaIdOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("media" in body)) return null;
  const media = (body as { readonly media?: unknown }).media;
  if (typeof media !== "object" || media === null || !("id" in media)) return null;
  const id = (media as { readonly id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

/**
 * Uploads one image to `/api/content-media-uploads` (this app's customer-facing route that stores a Payload
 * `media` document, businessId-stamped from the signed-in session — see that route's own doc comment) and returns
 * the resulting media id. Shared by the gallery panel and the blog post's cover-image field: both just need
 * "upload an image, get back its media id," then attach that id to whatever they're editing through their own
 * server action (`addToGalleryAction` / `setCoverImageAction`) — the same "upload first, attach after" shape
 * `components/panel/admin-image-field-form.tsx` already uses for the admin's content-slot editor.
 */
export async function uploadContentMedia(file: File): Promise<ContentMediaUploadResult> {
  const body = await prepareImageForUpload(file, "photo");
  if (body.size > MAX_UPLOAD_BYTES) return { ok: false, message: TOO_LARGE_MESSAGE };

  let response: Response;
  try {
    response = await fetch(CONTENT_MEDIA_UPLOAD_ROUTE, {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: {
        "Content-Type": body.type === "" ? "application/octet-stream" : body.type,
        [UPLOAD_FILE_NAME_HEADER]: encodeURIComponent(file.name),
      },
    });
  } catch {
    return { ok: false, message: UNREACHABLE_MESSAGE };
  }

  let parsed: UploadResponseBody | null = null;
  try {
    parsed = (await response.json()) as UploadResponseBody;
  } catch {
    // A platform, proxy or crash page instead of our JSON; the fallbacks below cover it.
  }

  if (!response.ok) {
    const fallback = response.status === PAYLOAD_TOO_LARGE ? TOO_LARGE_MESSAGE : UNEXPECTED_MESSAGE;
    return { ok: false, message: errorMessageOf(parsed) ?? fallback };
  }

  const mediaId = mediaIdOf(parsed);
  if (mediaId === null) return { ok: false, message: UNEXPECTED_MESSAGE };
  return { ok: true, mediaId };
}
