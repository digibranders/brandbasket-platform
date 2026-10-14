import type { Rect, Size } from "./crop-geometry";
import { encodingsFor } from "./resize-plan";

/*
 * The browser half of the crop window: opening the chosen photo, drawing the chosen part of it, and writing that part
 * out at a slot's exact size. The arithmetic is in crop-geometry.ts. Browser only.
 */

/**
 * The chosen file as an upright bitmap, or null when the browser cannot decode it (HEIC in most browsers, or a
 * damaged file). The caller closes the bitmap when it is done with it.
 */
export async function openPhoto(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return null;
  }
}

/** Draws `rect` of the photo so it fills the whole canvas. Returns false when the canvas cannot be drawn on. */
export function drawCrop(canvas: HTMLCanvasElement, photo: ImageBitmap, rect: Rect): boolean {
  const context = canvas.getContext("2d");
  if (context === null) return false;
  context.imageSmoothingQuality = "high";
  // A white ground, for a photo with transparent parts and for formats with no transparency.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(photo, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);
  return true;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number | undefined): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

/**
 * `rect` of the photo as an image of exactly `size` pixels: WebP, or JPEG in a browser that cannot write WebP. Null
 * when the browser can write neither, which the caller reports.
 */
export async function cropToBlob(photo: ImageBitmap, rect: Rect, size: Size): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  if (!drawCrop(canvas, photo, rect)) return null;
  for (const encoding of encodingsFor("photo", "image/jpeg")) {
    const blob = await toBlob(canvas, encoding.type, encoding.quality);
    // A browser that cannot write a format quietly writes PNG instead, so the type is checked.
    if (blob !== null && blob.type === encoding.type) return blob;
  }
  return null;
}
