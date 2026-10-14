import { GALLERY_SLOTS, type PictureSize } from "@firstfold/shared/lib/directory/pictures";

/*
 * The arithmetic and wording behind the Photos tab's editor (components/panel/business/photos-editor.tsx), kept free of
 * the DOM and the database so it can be tested.
 */

export type GallerySlotName = (typeof GALLERY_SLOTS)[number];

/** One gallery place, in order: the slot it is stored in, and the picture there, or null when it is free. */
export interface GalleryEntry {
  readonly slot: GallerySlotName;
  readonly pictureId: string | null;
}

/** The gallery places with no picture, in order: where the next photos go. */
export function freeGallerySlots(gallery: readonly GalleryEntry[]): readonly GallerySlotName[] {
  return gallery.filter((entry) => entry.pictureId === null).map((entry) => entry.slot);
}

/**
 * The photo next to the one in `slot` as the owner sees the gallery (empty places are skipped): the one before it for
 * -1, the one after it for 1. Null at either end, or when `slot` holds no photo.
 */
export function galleryNeighbour(gallery: readonly GalleryEntry[], slot: GallerySlotName, step: -1 | 1): GalleryEntry | null {
  const shown = gallery.filter((entry) => entry.pictureId !== null);
  const at = shown.findIndex((entry) => entry.slot === slot);
  if (at === -1) return null;
  return shown[at + step] ?? null;
}

/** How many of `chosen` files fit in the free places, and how many are left over. */
export function galleryRoom(free: number, chosen: number): { readonly take: number; readonly leftOver: number } {
  const take = Math.max(0, Math.min(free, chosen));
  return { take, leftOver: Math.max(0, chosen - take) };
}

/** "3.2 MB" or "84 KB": a size a business owner can read. */
export function readableSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/**
 * What the browser did to the photos, in one line: "3.2 MB → 84 KB". Null when nothing was saved: a photo that was
 * already small can come out the same size or larger once it is cut to its place, and that is not a saving to announce.
 */
export function savingLine(originalBytes: number, storedBytes: number): string | null {
  if (originalBytes <= 0 || storedBytes <= 0 || storedBytes >= originalBytes) return null;
  return `${readableSize(originalBytes)} → ${readableSize(storedBytes)}`;
}

/** Said when a chosen photo is too small to fill its place without looking soft. */
export function tooSmallMessage(fileName: string, minimum: PictureSize): string {
  return `${fileName} is too small for this spot. Choose a photo at least ${String(minimum.width)} × ${String(minimum.height)} pixels.`;
}

export function notAnImageMessage(fileName: string): string {
  return `We couldn't open ${fileName}. Use a JPEG, PNG or WebP image.`;
}

/** Said when more photos were chosen than the gallery has room for. */
export function tooManyMessage(room: number, leftOver: number): string {
  if (room === 0) return "Your gallery is full. Remove a photo to add another.";
  const photos = (n: number): string => (n === 1 ? "1 photo" : `${String(n)} photos`);
  return `Your gallery has room for ${photos(room)}, so we added the first ${String(room)} and left ${photos(leftOver)} out.`;
}

/** The line above the page preview: what the owner still has to do, or where their photos stand. */
export function photosStatus(hasFeature: boolean, published: boolean): { readonly tone: "waiting" | "done" | "quiet"; readonly text: string } {
  if (!hasFeature) return { tone: "waiting", text: "Add a feature photo to go live" };
  return published ? { tone: "done", text: "Live on your page" } : { tone: "quiet", text: "Shows on your page once you publish" };
}
