import { describe, expect, it } from "vitest";
import { MAX_IMAGE_DIMENSION, MAX_UPLOAD_BYTES } from "./limits";
import {
  chooseUploadBody,
  encodingsFor,
  MAX_ENCODE_ATTEMPTS,
  MIN_SHRINK_DIMENSION,
  planImageResize,
  shrinkToTarget,
  SMALL_ENOUGH_BYTES,
  UPLOAD_TARGET_BYTES,
  type ImageSize,
} from "./resize-plan";

const MB = 1024 * 1024;

describe("planImageResize", () => {
  it("sends a small, accepted image within the bound as it is", () => {
    expect(planImageResize({ bytes: 500_000, type: "image/jpeg", width: 1600, height: 1200 })).toEqual({
      kind: "send-original",
    });
    expect(
      planImageResize({ bytes: SMALL_ENOUGH_BYTES, type: "image/png", width: MAX_IMAGE_DIMENSION, height: 10 }),
    ).toEqual({ kind: "send-original" });
  });

  it("re-encodes at the same size when only the file size is too big", () => {
    expect(planImageResize({ bytes: 6 * MB, type: "image/jpeg", width: 2000, height: 1500 })).toEqual({
      kind: "re-encode",
      width: 2000,
      height: 1500,
    });
  });

  it("scales the longest side down to the bound, keeping the shape", () => {
    expect(planImageResize({ bytes: 400_000, type: "image/jpeg", width: 4032, height: 3024 })).toEqual({
      kind: "re-encode",
      width: 2400,
      height: 1800,
    });
    expect(planImageResize({ bytes: 30 * MB, type: "image/png", width: 3000, height: 9000 })).toEqual({
      kind: "re-encode",
      width: 800,
      height: 2400,
    });
  });

  it("never scales a very thin image to nothing", () => {
    expect(planImageResize({ bytes: 3 * MB, type: "image/png", width: 12_000, height: 2 })).toEqual({
      kind: "re-encode",
      width: 2400,
      height: 1,
    });
  });

  it("converts a small image in a format the server refuses", () => {
    expect(planImageResize({ bytes: 100_000, type: "image/heic", width: 800, height: 600 })).toMatchObject({
      kind: "re-encode",
    });
    expect(planImageResize({ bytes: 100_000, type: "", width: 800, height: 600 })).toMatchObject({ kind: "re-encode" });
  });
});

describe("upload size targets", () => {
  it("fit under Vercel's 4.5 MB request cap with room to spare", () => {
    expect(MAX_UPLOAD_BYTES).toBe(4 * MB);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * 1000 * 1000);
    expect(UPLOAD_TARGET_BYTES).toBeLessThanOrEqual(MAX_UPLOAD_BYTES * 0.75);
    expect(SMALL_ENOUGH_BYTES).toBeLessThan(UPLOAD_TARGET_BYTES);
  });
});

describe("shrinkToTarget", () => {
  it("keeps an encode that is within the target", () => {
    expect(shrinkToTarget({ width: 2400, height: 1800 }, UPLOAD_TARGET_BYTES)).toBeNull();
    expect(shrinkToTarget({ width: 2400, height: 1800 }, 900_000)).toBeNull();
  });

  it("scales both sides by the square root of the overshoot, with a margin", () => {
    // 12 MB is four times the target: half on each side, then 90% of that.
    expect(shrinkToTarget({ width: 2400, height: 1800 }, 4 * UPLOAD_TARGET_BYTES)).toEqual({ width: 1080, height: 810 });
  });

  it("shrinks by at least a quarter, however slight the overshoot", () => {
    expect(shrinkToTarget({ width: 2400, height: 1200 }, UPLOAD_TARGET_BYTES + 1)).toEqual({ width: 1800, height: 900 });
  });

  it("never goes below the minimum longest side, and stops there", () => {
    expect(shrinkToTarget({ width: 1000, height: 500 }, 40 * MB)).toEqual({ width: MIN_SHRINK_DIMENSION, height: 400 });
    expect(shrinkToTarget({ width: MIN_SHRINK_DIMENSION, height: 400 }, 40 * MB)).toBeNull();
    expect(shrinkToTarget({ width: 300, height: 2 }, 40 * MB)).toBeNull();
  });

  it("gets an incompressible full-size image under the limit within the allowed attempts", () => {
    // The worst case: four bytes for every pixel, as an uncompressible PNG would take.
    const bytesFor = (size: ImageSize): number => size.width * size.height * 4;
    let size: ImageSize = { width: MAX_IMAGE_DIMENSION, height: MAX_IMAGE_DIMENSION };
    let attempts = 1;
    for (let next = shrinkToTarget(size, bytesFor(size)); next !== null; next = shrinkToTarget(size, bytesFor(size))) {
      size = next;
      attempts += 1;
    }
    expect(attempts).toBeLessThanOrEqual(MAX_ENCODE_ATTEMPTS);
    expect(bytesFor(size)).toBeLessThanOrEqual(UPLOAD_TARGET_BYTES);
  });
});

describe("encodingsFor", () => {
  it("tries WebP first, then JPEG on a white ground for photos", () => {
    expect(encodingsFor("photo", "image/png").map((encoding) => encoding.type)).toEqual(["image/webp", "image/jpeg"]);
    expect(encodingsFor("photo", "image/png")[1]).toMatchObject({ opaque: true, quality: 0.9 });
    expect(encodingsFor("photo", "image/webp")[0]).toMatchObject({ type: "image/webp", opaque: false, quality: 0.9 });
  });

  it("keeps a logo's transparency by falling back to PNG", () => {
    expect(encodingsFor("logo", "image/png").map((encoding) => encoding.type)).toEqual(["image/webp", "image/png"]);
    expect(encodingsFor("logo", "image/webp").map((encoding) => encoding.type)).toEqual(["image/webp", "image/png"]);
    expect(encodingsFor("logo", "image/jpeg").map((encoding) => encoding.type)).toEqual(["image/webp", "image/jpeg"]);
  });
});

describe("chooseUploadBody", () => {
  it("sends the smaller of two acceptable bodies", () => {
    expect(chooseUploadBody({ bytes: 5 * MB, type: "image/jpeg" }, { bytes: 1 * MB, type: "image/webp" })).toBe("encoded");
    expect(chooseUploadBody({ bytes: 3 * MB, type: "image/jpeg" }, { bytes: 4 * MB, type: "image/webp" })).toBe("original");
  });

  it("sends the re-encoded body when the original would be refused", () => {
    expect(
      chooseUploadBody({ bytes: MAX_UPLOAD_BYTES + 1, type: "image/jpeg" }, { bytes: MAX_UPLOAD_BYTES + 5, type: "image/webp" }),
    ).toBe("encoded");
    expect(chooseUploadBody({ bytes: 100, type: "image/heic" }, { bytes: 900, type: "image/jpeg" })).toBe("encoded");
  });

  it("sends the original when nothing could be encoded", () => {
    expect(chooseUploadBody({ bytes: 100, type: "image/heic" }, null)).toBe("original");
  });
});
