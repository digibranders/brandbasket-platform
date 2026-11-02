import type { UploadPurpose } from "./limits";
import {
  chooseUploadBody,
  encodingsFor,
  MAX_ENCODE_ATTEMPTS,
  planImageResize,
  shrinkToTarget,
  type Encoding,
  type ImageSize,
} from "./resize-plan";

function toBlob(canvas: HTMLCanvasElement, encoding: Encoding): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, encoding.type, encoding.quality);
  });
}

async function encode(
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  encodings: readonly Encoding[],
): Promise<Blob | null> {
  for (const encoding of encodings) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (encoding.opaque) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await toBlob(canvas, encoding);
    // A browser that cannot write a format quietly writes PNG instead, so the type is checked.
    if (blob !== null && blob.type === encoding.type) return blob;
  }
  return null;
}

/**
 * Shrinks a chosen image in the browser before it is sent: decoded upright, scaled to fit the stored bound and
 * re-encoded, usually as WebP, then scaled down further while the result is over UPLOAD_TARGET_BYTES. A file the browser cannot decode (HEIC in most browsers, or a damaged file) is sent
 * unchanged, and the server refuses it with its usual explanation. Browser only.
 */
export async function prepareImageForUpload(file: File, purpose: UploadPurpose): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }

  try {
    const plan = planImageResize({ bytes: file.size, type: file.type, width: bitmap.width, height: bitmap.height });
    if (plan.kind === "send-original") return file;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context === null) return file;

    const encodings = encodingsFor(purpose, file.type);
    let size: ImageSize = { width: plan.width, height: plan.height };
    let encoded: Blob | null = null;
    for (let attempt = 0; attempt < MAX_ENCODE_ATTEMPTS; attempt += 1) {
      // Resizing the canvas resets its drawing state, so the smoothing setting is applied each time.
      canvas.width = size.width;
      canvas.height = size.height;
      context.imageSmoothingQuality = "high";
      encoded = await encode(canvas, context, bitmap, encodings);
      if (encoded === null) break;
      const smaller = shrinkToTarget(size, encoded.size);
      if (smaller === null) break;
      size = smaller;
    }
    const choice = chooseUploadBody(
      { bytes: file.size, type: file.type },
      encoded === null ? null : { bytes: encoded.size, type: encoded.type },
    );
    return choice === "encoded" && encoded !== null ? encoded : file;
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
