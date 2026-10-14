import type { DirectoryPictureSlot } from "@firstfold/db";
import { minimumPictureSize, PICTURE_SHAPES } from "@firstfold/shared/lib/directory/pictures";
import { ownPictureHref } from "@/lib/photos-view";
import { cropBounds, cropRect, startView } from "./crop-geometry";
import { cropToBlob, openPhoto } from "./crop-image";
import { uploadListingPicture } from "./upload-client";

/*
 * The browser half of moving a photo from one place on the page to another (the Photos tab's "Make main" and
 * arrows). A stored photo is already cut to its place's shape, so moving it means cutting it again to the new place's
 * shape and sending it to that place; a swap does the same for the photo that was there. Both new cuts are made
 * before anything is sent, and a swap that fails half way puts the first photo back. Browser only.
 */

/** One place on the page: where a photo is stored, and the photo there, or null when the place is empty. */
export interface PicturePlace {
  readonly slot: DirectoryPictureSlot;
  readonly pictureId: string | null;
}

export type MoveResult = { readonly ok: true } | { readonly ok: false; readonly message: string };

const OPEN_FAILED = "We couldn't open that photo. Reload the page and try again.";
const CUT_FAILED = "That photo is too small to fill its new place. Nothing was moved.";
const PART_WAY = "Something went wrong half way, so the photos may be in each other's places. Check them below.";

/** A stored photo as a bitmap, or null when it cannot be fetched or decoded. The caller closes the bitmap. */
async function loadStored(pictureId: string): Promise<ImageBitmap | null> {
  try {
    const response = await fetch(ownPictureHref(pictureId), { credentials: "same-origin" });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await openPhoto(new File([blob], "photo", { type: blob.type }));
  } catch {
    return null;
  }
}

/** The photo cut about its centre to `slot`'s shape and size, or null when it is too small for that place. */
async function cutFor(photo: ImageBitmap, slot: DirectoryPictureSlot): Promise<Blob | null> {
  const shape = PICTURE_SHAPES[slot];
  const bounds = cropBounds({ width: photo.width, height: photo.height }, shape, minimumPictureSize(slot));
  if (bounds === null) return null;
  return cropToBlob(photo, cropRect(bounds, startView(bounds)), shape);
}

/**
 * Moves the photo in `from` to `to`. When `to` holds a photo too, that one takes `from`'s place (a swap); when `to` is
 * empty the photo is only copied there, and the caller removes the original. `from` must hold a photo.
 */
export async function movePicture(from: PicturePlace, to: PicturePlace): Promise<MoveResult> {
  if (from.pictureId === null) return { ok: false, message: OPEN_FAILED };
  const moving = await loadStored(from.pictureId);
  const displaced = to.pictureId === null ? null : await loadStored(to.pictureId);
  try {
    if (moving === null || (to.pictureId !== null && displaced === null)) return { ok: false, message: OPEN_FAILED };
    const intoTo = await cutFor(moving, to.slot);
    const intoFrom = displaced === null ? null : await cutFor(displaced, from.slot);
    if (intoTo === null || (displaced !== null && intoFrom === null)) return { ok: false, message: CUT_FAILED };

    const first = await uploadListingPicture(intoTo, to.slot);
    if (!first.ok) return first;
    if (intoFrom === null) return { ok: true };

    const second = await uploadListingPicture(intoFrom, from.slot);
    if (second.ok) return { ok: true };
    // The first photo is already in its new place: the one it replaced is put back, so the page is as it was.
    const original = displaced === null ? null : await cutFor(displaced, to.slot);
    const restored = original === null ? null : await uploadListingPicture(original, to.slot);
    return { ok: false, message: restored?.ok === true ? `${second.message} Nothing was moved.` : `${second.message} ${PART_WAY}` };
  } finally {
    moving?.close();
    displaced?.close();
  }
}
