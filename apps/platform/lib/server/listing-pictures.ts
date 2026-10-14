import "server-only";
import {
  findBusinessKind,
  findClaimForBusiness,
  listDirectoryPictures,
  newDirectoryPictureId,
  recordDirectoryPicture,
  removeDirectoryPictures,
  withTenantScope,
  type Database,
  type DirectoryClaim,
  type DirectoryPictureSlot,
  type DirectoryPictureStatus,
} from "@firstfold/db";
import type { TenantContext } from "@firstfold/shared/lib/access";
import { GALLERY_SLOTS, PICTURE_KIND_SLOTS, PICTURE_SHAPES, type PictureKind } from "@firstfold/shared/lib/directory/pictures";
import { deleteMediaFiles, mediaStorageKey, type MediaStorage } from "@firstfold/shared/server/media-storage";
import { pictureCopyKey } from "@firstfold/shared/server/media-keys";
import { NO_LISTING_MESSAGE, slotPictures, type SlotPictures } from "@/lib/photos-view";
import type { GrantedCustomer } from "./customer-access";
import { getAppDb } from "./db";
import { makePictureCopies, processUpload, UploadRejectedError, type ProcessedUpload, type UploadRejection } from "./media-upload";

/*
 * A free listing account's own pictures (docs/superpowers/specs/2026-09-30-listing-pictures-crop-design.md). Reads go
 * through the customer's own tenant scope. Writes run on the staff connection, because the customer role may write
 * nothing to directory_pictures: the business id comes only from the session, the slot is one of three fixed names,
 * and the file is re-encoded to the slot's exact size before anything is stored.
 */

export interface ListingPictureDeps {
  /** The staff connection: see the note above. */
  readonly staffDb: Database;
  readonly storage: MediaStorage;
}

/** What the browser is told about a stored picture. The storage key and checksum stay on the server. */
export interface UploadedPicture {
  readonly id: string;
  readonly slot: DirectoryPictureSlot;
  readonly status: DirectoryPictureStatus;
}

export type ListingPictureRefusal = "no-claim" | UploadRejection;

export type ListingPictureOutcome =
  | { readonly ok: true; readonly picture: UploadedPicture }
  | {
      readonly ok: false;
      readonly refusal: ListingPictureRefusal;
      readonly message: string;
      /** Set when the same upload may succeed later; the route sends it as Retry-After. */
      readonly retryAfterSeconds?: number;
    };

/**
 * Whether the business has a listing a picture could show on: one indexed read, done before an upload's body is read
 * or its hourly budget spent. The insert checks again under a lock, so this is only an early answer, never the gate.
 */
export async function canAddListingPictures(appDb: Database, tenant: TenantContext): Promise<boolean> {
  return withTenantScope(appDb, tenant, async (tx) => {
    const claim = await findClaimForBusiness(tx, tenant.businessId);
    if (claim !== null) return claim.status !== "rejected";
    // The Business profile's Photos tab comes before its Listing tab: a free listing account may add its photo first.
    return (await findBusinessKind(tx, tenant.businessId)) === "listing";
  });
}

/**
 * The slots whose new picture goes live at once, with no check from us: the Business profile's featured photo, banner
 * and gallery (docs/superpowers/specs/2026-10-01-business-profile-design.md). The ad picture still waits for staff.
 */
const SLOTS_LIVE_ON_UPLOAD: ReadonlySet<DirectoryPictureSlot> = new Set(["listing", "banner", ...GALLERY_SLOTS]);

/**
 * One picture for one slot, after the route's checks: checked, cut to the slot's exact size and re-encoded, then
 * stored and recorded: the featured photo goes live at once, the ad picture waits for staff. The file is written first under a fresh id and the row inserted after
 * it; if the insert fails or is refused the file is deleted again, so a row never points at a missing file and a
 * file never outlives a failed upload. The waiting picture it replaces loses its file once that has committed.
 */
export async function storeListingPicture(
  deps: ListingPictureDeps,
  tenant: TenantContext,
  slot: DirectoryPictureSlot,
  bytes: Uint8Array,
  now: Date,
): Promise<ListingPictureOutcome> {
  let processed: ProcessedUpload;
  try {
    processed = await processUpload(bytes, PICTURE_SHAPES[slot]);
  } catch (error) {
    if (error instanceof UploadRejectedError) {
      const refusal = { ok: false, refusal: error.reason, message: error.message } as const;
      return error.retryAfterSeconds === null ? refusal : { ...refusal, retryAfterSeconds: error.retryAfterSeconds };
    }
    throw error;
  }

  const pictureId = newDirectoryPictureId();
  const storageKey = mediaStorageKey(tenant.businessId, pictureId, "display");
  await deps.storage.put(storageKey, processed.bytes, processed.mimeType);

  let recorded: Awaited<ReturnType<typeof recordDirectoryPicture>>;
  try {
    recorded = await recordDirectoryPicture(deps.staffDb, {
      id: pictureId,
      businessId: tenant.businessId,
      slot,
      storageKey,
      mimeType: processed.mimeType,
      bytes: processed.byteLength,
      width: processed.width,
      height: processed.height,
      sha256: processed.sha256,
      uploadedByUserId: tenant.userId,
      now,
      goesLive: SLOTS_LIVE_ON_UPLOAD.has(slot),
    });
  } catch (error) {
    await deleteMediaFiles(deps.storage, [storageKey]);
    throw error;
  }
  if (recorded.kind === "no-claim") {
    await deleteMediaFiles(deps.storage, [storageKey]);
    return { ok: false, refusal: "no-claim", message: NO_LISTING_MESSAGE };
  }

  await deleteMediaFiles(deps.storage, recorded.replacedStorageKeys);
  await storePictureCopies(deps.storage, storageKey, processed.bytes);
  const { picture } = recorded;
  return { ok: true, picture: { id: picture.id, slot: picture.slot, status: picture.status } };
}

/**
 * Writes the smaller copies of a picture that is already stored and recorded. Best effort: a copy is only a lighter
 * way to show the picture, and the picture is served as itself when a copy is missing, so a failure here is logged and
 * never turns a saved upload into an error. A picture's copies are deleted with it (deleteMediaFiles).
 */
export async function storePictureCopies(storage: MediaStorage, displayKey: string, picture: Uint8Array): Promise<void> {
  try {
    for (const copy of await makePictureCopies(picture)) {
      const key = pictureCopyKey(displayKey, copy.width);
      if (key !== null) await storage.put(key, copy.bytes, copy.mimeType);
    }
  } catch (error) {
    console.error("Could not store a smaller copy of a picture", { key: displayKey, error });
  }
}

/** Removes the business's listing photo, or its ad picture in both shapes: rows first, then the files. */
export async function removeListingPictures(deps: ListingPictureDeps, tenant: TenantContext, kind: PictureKind, now: Date): Promise<void> {
  const keys = await removeDirectoryPictures(deps.staffDb, { businessId: tenant.businessId, slots: PICTURE_KIND_SLOTS[kind], now });
  await deleteMediaFiles(deps.storage, keys);
}

export interface PhotosPage {
  /** Null for an account that has not added or claimed a business yet. */
  readonly claim: DirectoryClaim | null;
  readonly slots: Readonly<Record<DirectoryPictureSlot, SlotPictures>>;
}

/** Everything the Photos page shows the signed-in listing account, read through its own tenant scope. */
export async function getPhotosPage(customer: Pick<GrantedCustomer, "tenant">): Promise<PhotosPage> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, async (tx) => {
    const claim = await findClaimForBusiness(tx, tenant.businessId);
    const pictures = await listDirectoryPictures(tx, tenant.businessId);
    return { claim, slots: slotPictures(pictures) };
  });
}
