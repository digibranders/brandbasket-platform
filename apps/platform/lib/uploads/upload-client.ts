// The type only: this module runs in the browser, and the package index pulls in the database.
import type { DirectoryPictureSlot } from "@brandbasket/db";
import { MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE, UPLOAD_FILE_NAME_HEADER, type UploadPurpose } from "./limits";
import { prepareImageForUpload } from "./prepare-image";

export type UploadResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

/** Under /api/ so the proxy never buffers the body; the route itself only answers on the app host. */
export const UPLOAD_ROUTE = "/api/uploads";
/** The Business page's logo and photos, once the website is built. */
export const BRAND_ASSETS_ROUTE = "/api/brand-assets";
/** A free listing account's pictures, one slot a request; under /api/ for the same reason. */
export const LISTING_PICTURE_ROUTE = "/api/listing-pictures";
/** Also what Vercel answers, as plain text, for a body over its own limit before our route runs. */
const PAYLOAD_TOO_LARGE = 413;
const UNREACHABLE_MESSAGE = "We couldn't upload that file. Check your connection and try again.";
const UNEXPECTED_MESSAGE = "Something went wrong with that upload. Reload the page and try again.";

function errorMessageOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  return typeof body.error === "string" && body.error !== "" ? body.error : null;
}

/** Sends one image as the raw request body and turns the answer into a message ready to show. */
async function sendImage(url: string, body: Blob, headers: Record<string, string>): Promise<UploadResult> {
  if (body.size > MAX_UPLOAD_BYTES) return { ok: false, message: TOO_LARGE_MESSAGE };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { "Content-Type": body.type === "" ? "application/octet-stream" : body.type, ...headers },
    });
  } catch {
    return { ok: false, message: UNREACHABLE_MESSAGE };
  }

  if (response.ok) return { ok: true };
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // A platform, proxy or crash page instead of our JSON; the fallbacks below cover it.
  }
  const fallback = response.status === PAYLOAD_TOO_LARGE ? TOO_LARGE_MESSAGE : UNEXPECTED_MESSAGE;
  return { ok: false, message: errorMessageOf(parsed) ?? fallback };
}

/**
 * Shrinks one chosen image in the browser and sends it to the upload route as the raw request body. Browser only.
 * The result carries a message ready to show; the page refreshes itself afterwards to show the stored image.
 */
export async function uploadImage(file: File, purpose: UploadPurpose, route: string = UPLOAD_ROUTE): Promise<UploadResult> {
  const body = await prepareImageForUpload(file, purpose);
  return sendImage(`${route}?purpose=${purpose}`, body, { [UPLOAD_FILE_NAME_HEADER]: encodeURIComponent(file.name) });
}

/**
 * Sends one picture the crop window made for a slot of a free listing account. It is already the slot's shape and
 * size, so nothing is shrunk here. Browser only; the result carries a message ready to show.
 */
export function uploadListingPicture(picture: Blob, slot: DirectoryPictureSlot): Promise<UploadResult> {
  return sendImage(`${LISTING_PICTURE_ROUTE}?slot=${slot}`, picture, {});
}
