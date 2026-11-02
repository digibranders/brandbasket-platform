// The type only: this module runs in the browser, and the package index pulls in the database.
import type { DirectoryPictureSlot } from "@brandbasket/db";
import { UPLOAD_FILE_NAME_HEADER, type UploadPurpose } from "@brandbasket/shared/lib/uploads/limits";
import { prepareImageForUpload } from "@brandbasket/shared/lib/uploads/prepare-image";
import { sendImage, type UploadResult } from "@brandbasket/shared/lib/uploads/send-image";

export type { UploadResult };

/** Under /api/ so the proxy never buffers the body; the route itself only answers on the app host. */
export const UPLOAD_ROUTE = "/api/uploads";
/** The Business page's logo and photos, once the website is built. */
export const BRAND_ASSETS_ROUTE = "/api/brand-assets";
/** A free listing account's pictures, one slot a request; under /api/ for the same reason. */
export const LISTING_PICTURE_ROUTE = "/api/listing-pictures";
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
