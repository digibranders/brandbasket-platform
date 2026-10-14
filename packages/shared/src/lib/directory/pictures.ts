// The type only: this module reaches client components, and the package index pulls in the database.
import type { DirectoryPictureSlot } from "@fynix/db";

/*
 * A listing owner's pictures on the local directory, as the Photos page, the crop window, the upload route and the staff
 * console all see them (docs/superpowers/specs/2026-09-30-listing-pictures-crop-design.md). Each slot has one fixed
 * shape, taken from where the website shows it; a picture is cropped to that shape in the owner's browser and stored
 * at exactly that size.
 */

export const GALLERY_SLOTS = [
  "gallery_1",
  "gallery_2",
  "gallery_3",
  "gallery_4",
  "gallery_5",
  "gallery_6",
  "gallery_7",
  "gallery_8",
  "gallery_9",
  "gallery_10",
  "gallery_11",
  "gallery_12",
  "gallery_13",
  "gallery_14",
  "gallery_15",
  "gallery_16",
  "gallery_17",
  "gallery_18",
  "gallery_19",
  "gallery_20",
] as const satisfies readonly DirectoryPictureSlot[];

export const PICTURE_SLOTS: readonly DirectoryPictureSlot[] = ["listing", "ad_tall", "ad_wide", "banner", ...GALLERY_SLOTS];

export interface PictureSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The size each slot is stored at, in pixels. The list row and business page show the listing photo square at up to
 * 200px; the side column's ad cards are 8 : 9 (spot 1) and 8 : 5 (spot 2) and fill a phone's width, so they are kept
 * larger.
 */
export const PICTURE_SHAPES: Readonly<Record<DirectoryPictureSlot, PictureSize>> = {
  listing: { width: 640, height: 640 },
  ad_tall: { width: 960, height: 1080 },
  ad_wide: { width: 960, height: 600 },
  // The banner runs across the top of the business's page, three times as wide as it is tall; the gallery is 4 : 3.
  banner: { width: 1500, height: 500 },
  gallery_1: { width: 960, height: 720 },
  gallery_2: { width: 960, height: 720 },
  gallery_3: { width: 960, height: 720 },
  gallery_4: { width: 960, height: 720 },
  gallery_5: { width: 960, height: 720 },
  gallery_6: { width: 960, height: 720 },
  gallery_7: { width: 960, height: 720 },
  gallery_8: { width: 960, height: 720 },
  gallery_9: { width: 960, height: 720 },
  gallery_10: { width: 960, height: 720 },
  gallery_11: { width: 960, height: 720 },
  gallery_12: { width: 960, height: 720 },
  gallery_13: { width: 960, height: 720 },
  gallery_14: { width: 960, height: 720 },
  gallery_15: { width: 960, height: 720 },
  gallery_16: { width: 960, height: 720 },
  gallery_17: { width: 960, height: 720 },
  gallery_18: { width: 960, height: 720 },
  gallery_19: { width: 960, height: 720 },
  gallery_20: { width: 960, height: 720 },
};

/** A product's photo: square, stored at this size and shown on the business page at up to a few hundred pixels. */
export const PRODUCT_PHOTO_SIZE: PictureSize = { width: 800, height: 800 };

/** The smallest photo, in pixels, a product photo is made from: enlarged at most PICTURE_MAX_ENLARGEMENT times. */
export const PRODUCT_PHOTO_MINIMUM: PictureSize = {
  width: Math.ceil(PRODUCT_PHOTO_SIZE.width / 2),
  height: Math.ceil(PRODUCT_PHOTO_SIZE.height / 2),
};

/** The crop may be enlarged at most this many times to reach its stored size; past it the picture would look soft. */
export const PICTURE_MAX_ENLARGEMENT = 2;

export const PICTURE_SLOT_LABELS: Readonly<Record<DirectoryPictureSlot, string>> = {
  listing: "Listing photo",
  ad_tall: "Tall ad card",
  ad_wide: "Wide ad card",
  banner: "Banner",
  gallery_1: "Gallery photo 1",
  gallery_2: "Gallery photo 2",
  gallery_3: "Gallery photo 3",
  gallery_4: "Gallery photo 4",
  gallery_5: "Gallery photo 5",
  gallery_6: "Gallery photo 6",
  gallery_7: "Gallery photo 7",
  gallery_8: "Gallery photo 8",
  gallery_9: "Gallery photo 9",
  gallery_10: "Gallery photo 10",
  gallery_11: "Gallery photo 11",
  gallery_12: "Gallery photo 12",
  gallery_13: "Gallery photo 13",
  gallery_14: "Gallery photo 14",
  gallery_15: "Gallery photo 15",
  gallery_16: "Gallery photo 16",
  gallery_17: "Gallery photo 17",
  gallery_18: "Gallery photo 18",
  gallery_19: "Gallery photo 19",
  gallery_20: "Gallery photo 20",
};

/** What the owner uploads: one photo per kind, cropped once for each of the kind's slots, in this order. */
export const PICTURE_KINDS = ["listing", "ad", "banner", ...GALLERY_SLOTS] as const;
export type PictureKind = (typeof PICTURE_KINDS)[number];

export const PICTURE_KIND_SLOTS: Readonly<Record<PictureKind, readonly DirectoryPictureSlot[]>> = {
  listing: ["listing"],
  ad: ["ad_tall", "ad_wide"],
  banner: ["banner"],
  gallery_1: ["gallery_1"],
  gallery_2: ["gallery_2"],
  gallery_3: ["gallery_3"],
  gallery_4: ["gallery_4"],
  gallery_5: ["gallery_5"],
  gallery_6: ["gallery_6"],
  gallery_7: ["gallery_7"],
  gallery_8: ["gallery_8"],
  gallery_9: ["gallery_9"],
  gallery_10: ["gallery_10"],
  gallery_11: ["gallery_11"],
  gallery_12: ["gallery_12"],
  gallery_13: ["gallery_13"],
  gallery_14: ["gallery_14"],
  gallery_15: ["gallery_15"],
  gallery_16: ["gallery_16"],
  gallery_17: ["gallery_17"],
  gallery_18: ["gallery_18"],
  gallery_19: ["gallery_19"],
  gallery_20: ["gallery_20"],
};

export function parsePictureSlot(value: unknown): DirectoryPictureSlot | null {
  return PICTURE_SLOTS.find((slot) => slot === value) ?? null;
}

export function parsePictureKind(value: unknown): PictureKind | null {
  return PICTURE_KINDS.find((kind) => kind === value) ?? null;
}

/** The smallest photo, in pixels, that can fill `slot` without being enlarged past PICTURE_MAX_ENLARGEMENT. */
export function minimumPictureSize(slot: DirectoryPictureSlot): PictureSize {
  const shape = PICTURE_SHAPES[slot];
  return {
    width: Math.ceil(shape.width / PICTURE_MAX_ENLARGEMENT),
    height: Math.ceil(shape.height / PICTURE_MAX_ENLARGEMENT),
  };
}
