// Types only: this module reaches client components, and the package index pulls in the database.
import type { DirectoryPicture, DirectoryPictureSlot } from "@fynix/db";
import { PICTURE_KIND_SLOTS, PICTURE_SLOTS, type PictureKind } from "@fynix/shared/lib/directory/pictures";

/*
 * What the Photos page says about a listing account's pictures, worked out from its rows and kept free of the
 * database and the DOM so it can be tested (docs/superpowers/specs/2026-09-30-listing-pictures-crop-design.md).
 */

/** Said to an account whose business cannot have pictures: staff took it down, or it is not a free listing account. */
export const NO_LISTING_MESSAGE = "Pictures can't be added to this business. Email us and we'll sort it out.";

/** A slot's two pictures: the one the website shows, and the newer one that is waiting for staff or was refused. */
export interface SlotPictures {
  readonly live: DirectoryPicture | null;
  readonly waiting: DirectoryPicture | null;
}

/** The business's current pictures, by slot. The database holds at most one of each per slot. */
export function slotPictures(pictures: readonly DirectoryPicture[]): Readonly<Record<DirectoryPictureSlot, SlotPictures>> {
  const find = (slot: DirectoryPictureSlot, live: boolean): DirectoryPicture | null =>
    pictures.find((picture) => picture.slot === slot && (picture.status === "approved") === live) ?? null;
  return Object.fromEntries(PICTURE_SLOTS.map((slot) => [slot, { live: find(slot, true), waiting: find(slot, false) }])) as Record<
    DirectoryPictureSlot,
    SlotPictures
  >;
}

/** The picture the owner is shown in a slot: their newest upload, whatever staff have said about it so far. */
export function shownPicture(slot: SlotPictures): DirectoryPicture | null {
  return slot.waiting ?? slot.live;
}

/**
 * Where one kind of picture (the listing photo, or the ad picture in both its shapes) stands:
 * - `empty`: nothing uploaded
 * - `incomplete`: an ad picture with one of its two shapes missing altogether, after an upload that stopped half way.
 *   It comes before the rest, because whatever the other shape's state, the owner has to add the photo again
 * - `waiting`: staff have not checked the newest upload yet
 * - `refused`: staff did not accept the newest upload
 * - `showing`: every shape is approved
 */
export type PictureState = "empty" | "waiting" | "refused" | "incomplete" | "showing";

export interface KindStatus {
  readonly state: PictureState;
  /** Whether an approved picture is on the website right now, in at least one of the kind's shapes. */
  readonly hasLive: boolean;
}

export function kindStatus(slots: Readonly<Record<DirectoryPictureSlot, SlotPictures>>, kind: PictureKind): KindStatus {
  const mine = PICTURE_KIND_SLOTS[kind].map((slot) => slots[slot]);
  const hasLive = mine.some((slot) => slot.live !== null);
  const missing = mine.filter((slot) => slot.live === null && slot.waiting === null).length;
  if (missing === mine.length) return { state: "empty", hasLive };
  if (missing > 0) return { state: "incomplete", hasLive };
  if (mine.some((slot) => slot.waiting?.status === "pending")) return { state: "waiting", hasLive };
  if (mine.some((slot) => slot.waiting?.status === "rejected")) return { state: "refused", hasLive };
  return { state: "showing", hasLive };
}

/** Whether the account has any picture at all, in any slot. */
export function hasAnyPicture(slots: Readonly<Record<DirectoryPictureSlot, SlotPictures>>): boolean {
  return PICTURE_SLOTS.some((slot) => shownPicture(slots[slot]) !== null);
}

/** Where the owner's own picture is served from, on the app host. */
export function ownPictureHref(pictureId: string): string {
  return `/listing-pictures/${pictureId}`;
}

/** Where the owner's own product photo is served from, on the app host. */
export function ownProductPhotoHref(photoId: string): string {
  return `/product-photos/${photoId}`;
}

export const PHOTOS_NOTICE_KEYS = ["removed", "invalid"] as const;
export type PhotosNotice = (typeof PHOTOS_NOTICE_KEYS)[number];

/** What the page says after an action. Fixed messages only: the query parameter picks one, nothing more. */
export const PHOTOS_NOTICES: Readonly<Record<PhotosNotice, { readonly text: string; readonly ok: boolean }>> = {
  removed: { text: "Removed. It stops showing within a minute.", ok: true },
  invalid: { text: "That didn't work. Reload the page and try again.", ok: false },
};

export function readPhotosNotice(value: string | readonly string[] | undefined): PhotosNotice | null {
  const raw = typeof value === "string" ? value : value?.[0];
  return PHOTOS_NOTICE_KEYS.find((key) => key === raw) ?? null;
}
