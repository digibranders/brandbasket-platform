import "server-only";
import { clearBusinessProductPhoto, newDirectoryPictureId, setBusinessProductPhoto, type Database } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { PRODUCT_PHOTO_SIZE } from "@brandbasket/shared/lib/directory/pictures";
import { deleteMediaFiles, mediaStorageKey, type MediaStorage } from "@brandbasket/shared/server/media-storage";
import { storePictureCopies } from "./listing-pictures";
import { processUpload, UploadRejectedError, type UploadRejection } from "./media-upload";

/*
 * A product's photo (docs/superpowers/specs/2026-10-12-product-photos-design.md): one per product, added from the
 * product's edit sheet. Like a gallery photo it goes live at once, with no check from us. Writes run on the staff
 * connection, after the route has checked the customer; the business id comes only from the session.
 */

export interface ProductPhotoDeps {
  /** The staff connection: see the note above. */
  readonly staffDb: Database;
  readonly storage: MediaStorage;
}

export type ProductPhotoRefusal = "not-found" | UploadRejection;

export type ProductPhotoOutcome =
  | { readonly ok: true; readonly photoId: string }
  | {
      readonly ok: false;
      readonly refusal: ProductPhotoRefusal;
      readonly message: string;
      /** Set when the same upload may succeed later; the route sends it as Retry-After. */
      readonly retryAfterSeconds?: number;
    };

const NO_SUCH_PRODUCT_MESSAGE = "We couldn't find that product. Reload the page and try again.";

/**
 * One photo for one product: checked, cut to a square and re-encoded, stored, then put on the product. The file is
 * written first under a fresh id and the row updated after it; if the product is gone the file is deleted again, so a
 * row never points at a missing file and a file never outlives a failed upload. The photo it replaces loses its file
 * once the new one is on the product.
 */
export async function storeProductPhoto(
  deps: ProductPhotoDeps,
  tenant: TenantContext,
  productId: string,
  bytes: Uint8Array,
): Promise<ProductPhotoOutcome> {
  let processed: Awaited<ReturnType<typeof processUpload>>;
  try {
    processed = await processUpload(bytes, PRODUCT_PHOTO_SIZE);
  } catch (error) {
    if (error instanceof UploadRejectedError) {
      const refusal = { ok: false, refusal: error.reason, message: error.message } as const;
      return error.retryAfterSeconds === null ? refusal : { ...refusal, retryAfterSeconds: error.retryAfterSeconds };
    }
    throw error;
  }

  const photoId = newDirectoryPictureId();
  const storageKey = mediaStorageKey(tenant.businessId, photoId, "display");
  await deps.storage.put(storageKey, processed.bytes, processed.mimeType);

  let outcome: Awaited<ReturnType<typeof setBusinessProductPhoto>>;
  try {
    outcome = await setBusinessProductPhoto(deps.staffDb, {
      businessId: tenant.businessId,
      productId,
      photo: { photoId, mimeType: processed.mimeType, bytes: processed.byteLength, width: processed.width, height: processed.height, sha256: processed.sha256 },
    });
  } catch (error) {
    await deleteMediaFiles(deps.storage, [storageKey]);
    throw error;
  }
  if (outcome.kind === "not-found") {
    await deleteMediaFiles(deps.storage, [storageKey]);
    return { ok: false, refusal: "not-found", message: NO_SUCH_PRODUCT_MESSAGE };
  }

  if (outcome.replacedPhotoId !== null) await deleteProductPhotoFiles(deps.storage, tenant.businessId, outcome.replacedPhotoId);
  await storePictureCopies(deps.storage, storageKey, processed.bytes);
  return { ok: true, photoId };
}

/** Takes a product's photo off it and deletes the photo's files. Nothing happens for a product with no photo. */
export async function removeProductPhoto(deps: ProductPhotoDeps, tenant: TenantContext, productId: string): Promise<void> {
  const photoId = await clearBusinessProductPhoto(deps.staffDb, { businessId: tenant.businessId, productId });
  if (photoId !== null) await deleteProductPhotoFiles(deps.storage, tenant.businessId, photoId);
}

/** Deletes a photo's file and its smaller copies. A failure leaves an unreferenced file, which cannot be served. */
export async function deleteProductPhotoFiles(storage: MediaStorage, businessId: string, photoId: string): Promise<void> {
  await deleteMediaFiles(storage, [mediaStorageKey(businessId, photoId, "display")]);
}
