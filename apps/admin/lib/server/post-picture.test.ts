import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import { processPostPicture } from "./post-picture";
import { StaffAdPictureError } from "./staff-ad-picture";

vi.mock("server-only", () => ({}));

async function png(width: number, height: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 60 } } }).png().toBuffer());
}

describe("processPostPicture", () => {
  it("makes a large picture a WebP within 1080 wide and 1350 high, hashed", async () => {
    const out = await processPostPicture(await png(2400, 3000));
    const meta = await sharp(out.bytes).metadata();
    expect([meta.format, out.mimeType]).toEqual(["webp", "image/webp"]);
    expect([meta.width, meta.height]).toEqual([out.width, out.height]);
    expect(out.width).toBeLessThanOrEqual(1080);
    expect(out.height).toBeLessThanOrEqual(1350);
    expect(out.sha256).toBe(createHash("sha256").update(out.bytes).digest("hex"));
  });

  it("does not enlarge a small picture", async () => {
    const out = await processPostPicture(await png(300, 200));
    expect([out.width, out.height]).toEqual([300, 200]);
  });

  it("refuses an empty file, a text file called a picture, and one over 900,000 bytes", async () => {
    await expect(processPostPicture(new Uint8Array())).rejects.toThrow("empty");
    await expect(processPostPicture(new TextEncoder().encode("not a picture.png"))).rejects.toThrow(StaffAdPictureError);
    await expect(processPostPicture(new Uint8Array(901_000))).rejects.toThrow("too large");
  });
});
