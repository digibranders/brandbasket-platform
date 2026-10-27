import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { POST_PICTURE_HEIGHT, POST_PICTURE_MAX_BYTES, POST_PICTURE_WIDTH } from "@/lib/deliverable-form";
import { looksLikeAPicture, StaffAdPictureError, type ProcessedStaffAdPicture } from "./staff-ad-picture";

/*
 * The picture staff attach to a social post. Same checks as the staff ad picture (a real JPEG, PNG or WebP by its first
 * bytes, a pixel limit, the camera's rotation applied), then it is fitted inside 1080 by 1350 without enlarging and
 * re-encoded as WebP, so nothing of the original file's metadata survives. The browser shrinks it first because a server
 * action's body is limited to 1 MB (components/post-picture-field.tsx).
 */

const MAX_INPUT_PIXELS = 50_000_000;
const WEBP_QUALITY = 82;
const SIGNATURE_BYTES = 12;

/** The picture fitted and encoded as WebP; throws a `StaffAdPictureError` whose message staff can act on. */
export async function processPostPicture(bytes: Uint8Array): Promise<ProcessedStaffAdPicture> {
  if (bytes.byteLength === 0) throw new StaffAdPictureError("That file is empty. Choose the picture again.");
  if (bytes.byteLength > POST_PICTURE_MAX_BYTES) throw new StaffAdPictureError("That picture is too large. Choose a smaller one.");
  if (!looksLikeAPicture(bytes.subarray(0, SIGNATURE_BYTES))) throw new StaffAdPictureError("Please choose a JPEG, PNG or WebP picture.");
  try {
    const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS, sequentialRead: true })
      .rotate()
      .resize({ width: POST_PICTURE_WIDTH, height: POST_PICTURE_HEIGHT, fit: "inside", withoutEnlargement: true })
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
    console.error("A post picture could not be read.", error instanceof Error ? error.message : error);
    throw new StaffAdPictureError("That picture could not be read. Try another file.");
  }
}
