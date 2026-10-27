import "server-only";
import { createHash } from "node:crypto";
import sharp, { type OutputInfo } from "sharp";
import { MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from "@/lib/uploads/limits";
import { PICTURE_COPY_WIDTHS, type PictureCopyWidth } from "@brandbasket/shared/server/media-keys";
import { createSemaphore, SemaphoreFullError } from "./semaphore";

export { MAX_UPLOAD_BYTES };

const WEBP_QUALITY = 82;
/**
 * Refuses an image whose header claims more pixels than this before decoding it (10,000 x 10,000). Sharp's own
 * default is higher; stated here so an upgrade cannot quietly raise it.
 */
export const MAX_INPUT_PIXELS = 100_000_000;
/** Images decoded at once in this process. Each decode can hold hundreds of megabytes of pixels. */
export const MAX_CONCURRENT_DECODES = 2;
/**
 * Uploads that may wait for a decode slot, each holding its body (up to MAX_UPLOAD_BYTES) in memory. Any more are
 * refused at once as `busy` rather than piling up.
 */
export const MAX_WAITING_DECODES = 8;
/** How long a refused upload is told to wait: a queue this short clears in seconds. */
export const BUSY_RETRY_AFTER_SECONDS = 10;
export const BUSY_MESSAGE = "We're handling a lot of uploads right now. Please try that image again in a few seconds.";
const decodeSlots = createSemaphore({ limit: MAX_CONCURRENT_DECODES, maxWaiting: MAX_WAITING_DECODES });
/**
 * Whether an image arriving now could be decoded or queued. The upload route asks before spending the customer's
 * hourly allowance, so a busy refusal does not cost them an upload. Two uploads can both see capacity and one still
 * be refused by processUpload; that one is charged, which is an acceptable rarity.
 */
export function hasDecodeCapacity(): boolean {
  return decodeSlots.hasCapacity;
}

/** Enough bytes to recognise every accepted format. */
const SIGNATURE_BYTES = 12;

const ACCEPTED_FORMATS_MESSAGE = "Please upload a JPEG, PNG or WebP image.";

export type DetectedImageType = "image/jpeg" | "image/png" | "image/webp";

/** The format sharp reports for each accepted type, used to confirm the decoder agrees with the signature. */
const SHARP_FORMAT: Readonly<Record<DetectedImageType, string>> = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
};

export type UploadRejection = "empty" | "too-large" | "unsupported-type" | "unreadable" | "busy";

/**
 * An upload we will not store. `message` is written for the customer; `retryAfterSeconds` is set when the same file
 * may succeed later, as for `busy`.
 */
export class UploadRejectedError extends Error {
  readonly reason: UploadRejection;
  readonly retryAfterSeconds: number | null;

  constructor(reason: UploadRejection, message: string, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = "UploadRejectedError";
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ProcessedUpload {
  /** The re-encoded image. Nothing of the original file's metadata survives in it. */
  readonly bytes: Uint8Array;
  readonly mimeType: "image/webp";
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  /** Hex SHA-256 of `bytes`. */
  readonly sha256: string;
  /** What the upload really was, from its first bytes. */
  readonly sourceType: DetectedImageType;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/**
 * The image type from the file's own first bytes, or null. The browser's declared type and the file name are never
 * consulted: both are whatever the uploader says they are.
 */
export function detectImageType(head: Uint8Array): DetectedImageType | null {
  if (startsWith(head, JPEG_SIGNATURE)) return "image/jpeg";
  if (startsWith(head, PNG_SIGNATURE)) return "image/png";
  if (startsWith(head, RIFF) && startsWith(head, WEBP, 8)) return "image/webp";
  return null;
}

function tooLarge(): UploadRejectedError {
  return new UploadRejectedError("too-large", TOO_LARGE_MESSAGE);
}

/** The pixel size an image must come out at, for a slot with one fixed shape. */
export interface ExactImageSize {
  readonly width: number;
  readonly height: number;
}

async function decodeAndReencode(
  input: Uint8Array,
  sourceType: DetectedImageType,
  exactSize: ExactImageSize | null,
): Promise<{ data: Buffer; info: OutputInfo }> {
  const image = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true });
  const metadata = await image.metadata();
  if (metadata.format !== SHARP_FORMAT[sourceType]) throw new Error(`Decoder read ${String(metadata.format)}`);
  return image
    .rotate()
    .resize(
      exactSize === null
        ? { width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION, fit: "inside", withoutEnlargement: true }
        : // The browser has already cropped to this shape; an image of any other shape is cut to it about its centre.
          { width: exactSize.width, height: exactSize.height, fit: "cover", position: "centre" },
    )
    .webp({ quality: WEBP_QUALITY })
    .toBuffer({ resolveWithObject: true });
}

/**
 * Checks and re-encodes one uploaded image, in the request. The bytes are identified by their signature, refused if
 * there are too many or they are not a JPEG, PNG or WebP, then decoded (at most two at a time with at most eight
 * waiting, the rest refused as busy, and never beyond MAX_INPUT_PIXELS), turned upright from the EXIF orientation, scaled to fit within 2400px and written out as WebP.
 * Re-encoding drops all metadata, GPS location included. Nothing is stored and nothing is written to the database.
 *
 * With `exactSize` the image comes out at exactly that many pixels instead, cut to the shape about its centre and
 * enlarged if it has to be: a picture for a slot of one fixed shape then fits it whatever was sent.
 */
export async function processUpload(input: Uint8Array, exactSize: ExactImageSize | null = null): Promise<ProcessedUpload> {
  if (input.byteLength === 0) throw new UploadRejectedError("empty", "That file is empty. Please choose an image.");
  if (input.byteLength > MAX_UPLOAD_BYTES) throw tooLarge();

  const sourceType = detectImageType(input.subarray(0, SIGNATURE_BYTES));
  if (sourceType === null) {
    throw new UploadRejectedError("unsupported-type", `That file isn't an image we can use. ${ACCEPTED_FORMATS_MESSAGE}`);
  }

  let output: { data: Buffer; info: OutputInfo };
  try {
    output = await decodeSlots.run(() => decodeAndReencode(input, sourceType, exactSize));
  } catch (error) {
    if (error instanceof SemaphoreFullError) {
      throw new UploadRejectedError("busy", BUSY_MESSAGE, BUSY_RETRY_AFTER_SECONDS);
    }
    throw new UploadRejectedError(
      "unreadable",
      `We couldn't read that image. It may be damaged. ${ACCEPTED_FORMATS_MESSAGE}`,
    );
  }

  const bytes = new Uint8Array(output.data);
  return {
    bytes,
    mimeType: "image/webp",
    width: output.info.width,
    height: output.info.height,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sourceType,
  };
}

/** One smaller copy of a stored picture. */
export interface PictureCopy {
  readonly width: PictureCopyWidth;
  readonly height: number;
  readonly bytes: Uint8Array;
  readonly mimeType: "image/webp";
}

const COPY_WEBP_QUALITY = 80;

/**
 * The smaller copies of a picture processUpload has already stored-ready: one WebP for each width in
 * PICTURE_COPY_WIDTHS that is narrower than the picture, in the same proportions. A picture that is no wider than the
 * smallest width gets none, because a "copy" at the same size would only cost storage. The input is our own output
 * (at most MAX_IMAGE_DIMENSION wide), so it needs none of processUpload's checks.
 */
export async function makePictureCopies(picture: Uint8Array): Promise<readonly PictureCopy[]> {
  const metadata = await sharp(picture).metadata();
  const sourceWidth = metadata.width ?? 0;
  const copies: PictureCopy[] = [];
  for (const width of PICTURE_COPY_WIDTHS) {
    if (width >= sourceWidth) continue;
    const { data, info } = await sharp(picture)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: COPY_WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    copies.push({ width, height: info.height, bytes: new Uint8Array(data), mimeType: "image/webp" });
  }
  return copies;
}
