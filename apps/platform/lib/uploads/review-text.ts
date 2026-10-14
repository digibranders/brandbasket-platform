import type { Size } from "./crop-geometry";

/*
 * The small print of the crop window's review step: what is about to be uploaded, what the owner chose, and the
 * smallest photo a spot can use. Plain strings, so the wording is tested without a browser.
 */

// Thousands, as Finder and Windows Explorer show a file's size, so the number matches what the owner sees on their computer.
const KB = 1000;
const MB = KB * 1000;

/** A file size for a person: KB under a megabyte (whole numbers), MB above it (one decimal). Never negative. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  const kilobytes = Math.max(1, Math.round(bytes / KB));
  if (kilobytes >= KB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${String(kilobytes)} KB`;
}

export interface PictureFacts extends Size {
  readonly bytes: number;
}

/** "960 × 600 px, 54 KB. Your photo was 3000 × 2250 px, 5.4 MB." Only the facts: no promise about quality or saving. */
export function reviewLine(upload: PictureFacts, original: PictureFacts): string {
  const sized = (facts: PictureFacts): string => `${String(facts.width)} × ${String(facts.height)} px, ${formatBytes(facts.bytes)}`;
  return `${sized(upload)}. Your photo was ${sized(original)}.`;
}

/** The smallest photo a spot can use, as a short hint. */
export function minimumSizeText(minimum: Size): string {
  return `Smallest photo for this spot: ${String(minimum.width)} × ${String(minimum.height)} px. A bigger one looks sharper.`;
}

/** Why a photo cannot be used at all: its own size beside what the spot needs. */
export function tooSmallText(photo: Size, minimum: Size): string {
  return `This photo is too small: it is ${String(photo.width)} × ${String(photo.height)} px, and this spot needs at least ${String(minimum.width)} × ${String(minimum.height)} px.`;
}

/**
 * A warning for a picture made from less of the photo than it has pixels (`shown` is the part of the photo inside the
 * frame, `picture` the size it was written at), or null when nothing was stretched.
 */
export function enlargedNote(shown: Size, picture: Size): string | null {
  if (shown.width >= picture.width && shown.height >= picture.height) return null;
  return ENLARGED_NOTE;
}

/** The warning itself, for a screen that already knows the picture was enlarged. */
export const ENLARGED_NOTE = "Your photo is smaller than this spot, so it was enlarged and may look a little soft.";

/** The smallest photo that is big enough for every one of `sizes`: the widest width and the tallest height among them. */
export function largestOf(sizes: readonly Size[]): Size {
  return sizes.reduce<Size>((all, size) => ({ width: Math.max(all.width, size.width), height: Math.max(all.height, size.height) }), { width: 0, height: 0 });
}
