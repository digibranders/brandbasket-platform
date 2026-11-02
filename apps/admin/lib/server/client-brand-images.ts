import "server-only";
import { newMediaAssetId, PhotoLimitReachedError, recordBrandAssetForStaff, type Database, type MediaAssetPurpose } from "@brandbasket/db";
import { MAX_PHOTOS } from "@brandbasket/shared/lib/uploads/limits";
import { deleteMediaFiles, mediaStorageKey, type MediaStorage } from "@brandbasket/shared/server/media-storage";
import { processUpload, UPLOAD_REJECTION_STATUS, UploadRejectedError } from "@brandbasket/shared/server/media-upload";

export interface ClientBrandImageDeps {
  readonly db: Database;
  readonly storage: MediaStorage;
}

export interface ClientBrandImageInput {
  readonly businessId: string;
  readonly staffUserId: string;
  readonly purpose: MediaAssetPurpose;
  readonly filename: string;
  readonly bytes: Uint8Array;
}

export type ClientBrandImageOutcome =
  | { readonly ok: true; readonly mediaId: string }
  | { readonly ok: false; readonly status: number; readonly message: string; readonly retryAfterSeconds?: number };

export const CLIENT_PHOTO_LIMIT_MESSAGE = `This business already has ${MAX_PHOTOS} photos. They can remove one on their Business page to make room.`;

/**
 * One logo or photo staff add for a client: checked and re-encoded like the customer's own uploads, stored, then recorded. The
 * file is written first under a fresh id and the row inserted after it; if the insert fails the file is deleted again, so a row
 * never points at a missing file. A new logo replaces the old one, and the old file is removed once that has committed.
 */
export async function storeClientBrandImage(deps: ClientBrandImageDeps, input: ClientBrandImageInput): Promise<ClientBrandImageOutcome> {
  let processed: Awaited<ReturnType<typeof processUpload>>;
  try {
    processed = await processUpload(input.bytes);
  } catch (error) {
    if (!(error instanceof UploadRejectedError)) throw error;
    const refusal = { ok: false, status: UPLOAD_REJECTION_STATUS[error.reason], message: error.message } as const;
    return error.retryAfterSeconds === null ? refusal : { ...refusal, retryAfterSeconds: error.retryAfterSeconds };
  }

  const mediaId = newMediaAssetId();
  const storageKey = mediaStorageKey(input.businessId, mediaId, "display");
  await deps.storage.put(storageKey, processed.bytes, processed.mimeType);

  let replacedStorageKeys: readonly string[];
  try {
    ({ replacedStorageKeys } = await recordBrandAssetForStaff(
      deps.db,
      input.businessId,
      {
        id: mediaId,
        purpose: input.purpose,
        storageKey,
        originalFilename: input.filename,
        mimeType: processed.mimeType,
        bytes: processed.byteLength,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        altText: null,
        uploadedByUserId: input.staffUserId,
      },
      { maxPhotos: MAX_PHOTOS },
    ));
  } catch (error) {
    await deleteMediaFiles(deps.storage, [storageKey]);
    if (error instanceof PhotoLimitReachedError) return { ok: false, status: 409, message: CLIENT_PHOTO_LIMIT_MESSAGE };
    throw error;
  }

  await deleteMediaFiles(deps.storage, replacedStorageKeys);
  return { ok: true, mediaId };
}
