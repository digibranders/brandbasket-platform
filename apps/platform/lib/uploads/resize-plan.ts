import {
  isAcceptedUploadType,
  MAX_IMAGE_DIMENSION,
  MAX_UPLOAD_BYTES,
  type AcceptedUploadType,
  type UploadPurpose,
} from "./limits";

/**
 * The decisions behind shrinking an image in the browser before upload, kept free of the DOM so they can be tested.
 * A file already this small, in an accepted format and within the pixel bound, is sent as it is.
 */
export const SMALL_ENOUGH_BYTES = 2 * 1024 * 1024;
/**
 * What a re-encoded image should come in under: a clear margin below MAX_UPLOAD_BYTES, so an image that compresses
 * badly is shrunk further in the browser rather than refused by the server.
 */
export const UPLOAD_TARGET_BYTES = 3 * 1024 * 1024;
/** The browser stops shrinking at this longest side; anything still too large is left for the server to refuse. */
export const MIN_SHRINK_DIMENSION = 800;
/** Encodes tried per image, the first at the planned size included. */
export const MAX_ENCODE_ATTEMPTS = 4;
/** Each further attempt is at least this much smaller on each side. */
const MAX_SHRINK_SCALE = 0.75;
/** Aim a little under the target, since encoded size only roughly follows pixel count. */
const SHRINK_MARGIN = 0.9;
const WEBP_QUALITY = 0.9;
const JPEG_QUALITY = 0.9;

export interface SourceImage {
  readonly bytes: number;
  /** The browser's declared type, which may be empty or a format the server refuses. */
  readonly type: string;
  readonly width: number;
  readonly height: number;
}

export type ResizePlan =
  | { readonly kind: "send-original" }
  | { readonly kind: "re-encode"; readonly width: number; readonly height: number };

export function planImageResize(source: SourceImage): ResizePlan {
  const longest = Math.max(source.width, source.height);
  const fits = longest <= MAX_IMAGE_DIMENSION;
  if (fits && source.bytes <= SMALL_ENOUGH_BYTES && isAcceptedUploadType(source.type)) {
    return { kind: "send-original" };
  }
  const scale = longest > 0 ? Math.min(1, MAX_IMAGE_DIMENSION / longest) : 1;
  return {
    kind: "re-encode",
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

export interface ImageSize {
  readonly width: number;
  readonly height: number;
}

/**
 * The size to try next after an encode came out at `encodedBytes`, or null to keep what was made: it is within
 * UPLOAD_TARGET_BYTES, or the image is already down to MIN_SHRINK_DIMENSION. Encoded size grows roughly with pixel
 * count, so each side is scaled by the square root of how far over the target it was, and always by at least a
 * quarter so the attempts converge.
 */
export function shrinkToTarget(size: ImageSize, encodedBytes: number): ImageSize | null {
  if (encodedBytes <= UPLOAD_TARGET_BYTES) return null;
  const longest = Math.max(size.width, size.height);
  if (longest <= MIN_SHRINK_DIMENSION) return null;
  const wanted = Math.min(Math.sqrt(UPLOAD_TARGET_BYTES / encodedBytes) * SHRINK_MARGIN, MAX_SHRINK_SCALE);
  const scale = Math.max(wanted, MIN_SHRINK_DIMENSION / longest);
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

export interface Encoding {
  readonly type: AcceptedUploadType;
  /** Passed to canvas.toBlob; ignored for PNG. */
  readonly quality: number | undefined;
  /** Paint a white ground first, for formats with no transparency. */
  readonly opaque: boolean;
}

const WEBP: Encoding = { type: "image/webp", quality: WEBP_QUALITY, opaque: false };
const JPEG: Encoding = { type: "image/jpeg", quality: JPEG_QUALITY, opaque: true };
const PNG: Encoding = { type: "image/png", quality: undefined, opaque: false };

/**
 * Encodings to try, in order. WebP first; a browser that cannot encode it falls back to JPEG, except for a logo that
 * may be transparent, which falls back to PNG so its transparency survives.
 */
export function encodingsFor(purpose: UploadPurpose, sourceType: string): readonly Encoding[] {
  const mayBeTransparent = sourceType === "image/png" || sourceType === "image/webp";
  return purpose === "logo" && mayBeTransparent ? [WEBP, PNG] : [WEBP, JPEG];
}

export interface Candidate {
  readonly bytes: number;
  readonly type: string;
}

/**
 * Which body to send: the smaller of the original and the re-encoded image, counting the original only if the
 * server would accept it as it is. With neither acceptable the original goes, so the customer sees the server's
 * own explanation.
 */
export function chooseUploadBody(original: Candidate, encoded: Candidate | null): "original" | "encoded" {
  const originalAcceptable = isAcceptedUploadType(original.type) && original.bytes <= MAX_UPLOAD_BYTES;
  if (encoded === null) return "original";
  if (!originalAcceptable) return "encoded";
  return encoded.bytes < original.bytes ? "encoded" : "original";
}
