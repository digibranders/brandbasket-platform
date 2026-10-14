import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

/*
 * The picture staff upload for an ad they place by hand (docs/superpowers/specs/2026-10-12-staff-link-ads-design.md).
 * The form cuts it to the spot's shape in the browser, so what arrives is small; this checks it is really a picture,
 * cuts it to the exact size again (whatever was posted), and re-encodes it as WebP, so nothing of the original file's
 * metadata or format survives. Server actions take 1 MB bodies, which is why the browser does the heavy lifting.
 */

/** The largest picture accepted: a server action's body is limited to 1 MB, and the form's own output is far smaller. */
export const MAX_STAFF_AD_PICTURE_BYTES = 900_000;
/** Refuses a picture whose header claims more pixels than this before decoding it. */
const MAX_INPUT_PIXELS = 50_000_000;
const WEBP_QUALITY = 82;
/** Enough bytes to tell the formats apart. */
const SIGNATURE_BYTES = 12;

/** A refusal staff can read: the message says what to do. */
export class StaffAdPictureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaffAdPictureError";
  }
}

export interface StaffAdPictureSize {
  readonly width: number;
  readonly height: number;
}

export interface ProcessedStaffAdPicture {
  readonly bytes: Uint8Array;
  readonly mimeType: "image/webp";
  readonly width: number;
  readonly height: number;
  /** Hex SHA-256 of `bytes`. */
  readonly sha256: string;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((value, index) => bytes[offset + index] === value);
}

/** Whether the first bytes are a JPEG, PNG or WebP file: the file's name and declared type are never consulted. */
export function looksLikeAPicture(head: Uint8Array): boolean {
  const jpeg = startsWith(head, [0xff, 0xd8, 0xff]);
  const png = startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webp = startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8);
  return jpeg || png || webp;
}

/** The picture cut to exactly `size` (the middle of it, if the shape differs) and encoded as WebP. */
export async function processStaffAdPicture(bytes: Uint8Array, size: StaffAdPictureSize): Promise<ProcessedStaffAdPicture> {
  if (bytes.byteLength === 0) throw new StaffAdPictureError("That file is empty. Choose the picture again.");
  if (bytes.byteLength > MAX_STAFF_AD_PICTURE_BYTES) {
    throw new StaffAdPictureError("That picture is too large. Choose a smaller one.");
  }
  if (!looksLikeAPicture(bytes.subarray(0, SIGNATURE_BYTES))) {
    throw new StaffAdPictureError("Please choose a JPEG, PNG or WebP picture.");
  }
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true })
      .rotate()
      .resize({ width: size.width, height: size.height, fit: "cover", position: "centre" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return {
      bytes: new Uint8Array(data),
      mimeType: "image/webp",
      width: info.width,
      height: info.height,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  } catch (error) {
    console.error("A staff ad picture could not be read.", error instanceof Error ? error.message : error);
    throw new StaffAdPictureError("That picture could not be read. Try another file.");
  }
}
