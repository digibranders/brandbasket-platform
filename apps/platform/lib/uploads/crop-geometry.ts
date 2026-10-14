/**
 * The arithmetic behind the crop window, kept free of the DOM so it can be tested. A crop is always the shape of its
 * slot: the owner chooses only how far in it is zoomed and where in the photo it sits, so every crop that comes out
 * fits the layout. Distances are in the photo's own pixels unless a name says otherwise.
 */

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect extends Size {
  readonly x: number;
  readonly y: number;
}

/** What the owner has chosen: a zoom of 1 is the largest crop the photo allows, and the centre is where it sits. */
export interface CropView {
  readonly zoom: number;
  readonly centerX: number;
  readonly centerY: number;
}

/** A photo that can fill a slot, with how far it may be zoomed. */
export interface CropBounds {
  readonly photo: Size;
  /** The slot's stored size; only its proportions matter here. */
  readonly shape: Size;
  readonly maxZoom: number;
}

/** However large the photo, zooming further than this only invites a shaky, accidental crop. */
export const MAX_CROP_ZOOM = 4;

/** The largest rectangle of `shape`'s proportions that fits inside the photo. */
export function largestCrop(photo: Size, shape: Size): Size {
  const photoIsWider = photo.width * shape.height > photo.height * shape.width;
  return photoIsWider
    ? { width: (photo.height * shape.width) / shape.height, height: photo.height }
    : { width: photo.width, height: (photo.width * shape.height) / shape.width };
}

/**
 * How `photo` may be cropped to `shape`, or null when even its largest crop is smaller than `minimum`: such a photo
 * would have to be enlarged too far to fill the slot. The zoom stops where the crop would shrink to `minimum`.
 */
export function cropBounds(photo: Size, shape: Size, minimum: Size): CropBounds | null {
  const largest = largestCrop(photo, shape);
  if (largest.width < minimum.width || largest.height < minimum.height) return null;
  return { photo, shape, maxZoom: Math.min(MAX_CROP_ZOOM, largest.width / minimum.width) };
}

export function startView(bounds: CropBounds): CropView {
  return { zoom: 1, centerX: bounds.photo.width / 2, centerY: bounds.photo.height / 2 };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** The view with its zoom inside the photo's limits and its centre moved so the crop stays on the photo. */
function settle(bounds: CropBounds, view: CropView): CropView {
  const zoom = Number.isFinite(view.zoom) ? clamp(view.zoom, 1, bounds.maxZoom) : 1;
  const largest = largestCrop(bounds.photo, bounds.shape);
  const halfWidth = largest.width / zoom / 2;
  const halfHeight = largest.height / zoom / 2;
  return {
    zoom,
    centerX: clamp(view.centerX, halfWidth, bounds.photo.width - halfWidth),
    centerY: clamp(view.centerY, halfHeight, bounds.photo.height - halfHeight),
  };
}

/** The part of the photo the view selects. Always inside the photo and always the slot's shape. */
export function cropRect(bounds: CropBounds, view: CropView): Rect {
  const settled = settle(bounds, view);
  const largest = largestCrop(bounds.photo, bounds.shape);
  const width = largest.width / settled.zoom;
  const height = largest.height / settled.zoom;
  return { x: settled.centerX - width / 2, y: settled.centerY - height / 2, width, height };
}

/** Zooms about the crop's centre, within the photo's limits. */
export function zoomView(bounds: CropBounds, view: CropView, zoom: number): CropView {
  return settle(bounds, { ...view, zoom });
}

/**
 * Moves the photo under the frame by a drag of (`dx`, `dy`) screen pixels, where the frame is `frameWidth` screen
 * pixels wide: the photo follows the pointer, so the crop moves the other way.
 */
export function panView(bounds: CropBounds, view: CropView, dx: number, dy: number, frameWidth: number): CropView {
  if (!(frameWidth > 0)) return view;
  const photoPixelsPerScreenPixel = cropRect(bounds, view).width / frameWidth;
  return settle(bounds, {
    ...view,
    centerX: view.centerX - dx * photoPixelsPerScreenPixel,
    centerY: view.centerY - dy * photoPixelsPerScreenPixel,
  });
}
