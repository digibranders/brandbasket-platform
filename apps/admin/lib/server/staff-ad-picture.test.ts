import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { looksLikeAPicture, MAX_STAFF_AD_PICTURE_BYTES, processStaffAdPicture, StaffAdPictureError } from "./staff-ad-picture";

vi.mock("server-only", () => ({}));

const TALL = { width: 960, height: 1080 };
const WIDE = { width: 960, height: 600 };

async function picture(width: number, height: number, format: "jpeg" | "png" | "webp"): Promise<Uint8Array> {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 60 } } });
  return new Uint8Array(await image[format]().toBuffer());
}

describe("processStaffAdPicture", () => {
  it.each(["jpeg", "png", "webp"] as const)("cuts a %s of another shape to exactly the spot's size, as WebP", async (format) => {
    const out = await processStaffAdPicture(await picture(1600, 900, format), TALL);
    expect([out.width, out.height, out.mimeType]).toEqual([960, 1080, "image/webp"]);
    const meta = await sharp(out.bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 960, 1080]);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("makes the wide shape too, and enlarges a small picture rather than storing it at another size", async () => {
    const out = await processStaffAdPicture(await picture(300, 300, "png"), WIDE);
    expect([out.width, out.height]).toEqual([960, 600]);
  });

  it("refuses anything that is not a picture, whatever it is called", async () => {
    await expect(processStaffAdPicture(new TextEncoder().encode("<svg onload=alert(1)></svg>"), WIDE)).rejects.toThrow("JPEG, PNG or WebP");
    await expect(processStaffAdPicture(new TextEncoder().encode("GIF89a......"), WIDE)).rejects.toThrow(StaffAdPictureError);
  });

  it("refuses an empty file, an oversized one, and a file that only starts like a picture", async () => {
    await expect(processStaffAdPicture(new Uint8Array(), WIDE)).rejects.toThrow("empty");
    await expect(processStaffAdPicture(new Uint8Array(MAX_STAFF_AD_PICTURE_BYTES + 1), WIDE)).rejects.toThrow("too large");
    const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3]);
    await expect(processStaffAdPicture(broken, WIDE)).rejects.toThrow("could not be read");
  });

  it("tells the formats apart by their first bytes", () => {
    expect(looksLikeAPicture(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
    expect(looksLikeAPicture(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
    expect(looksLikeAPicture(new TextEncoder().encode("RIFF\0\0\0\0WEBP"))).toBe(true);
    expect(looksLikeAPicture(new TextEncoder().encode("RIFF\0\0\0\0WAVE"))).toBe(false);
    expect(looksLikeAPicture(new Uint8Array())).toBe(false);
  });
});
