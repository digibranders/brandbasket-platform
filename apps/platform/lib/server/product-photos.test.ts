import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@fynix/db";
import type { TenantContext } from "@fynix/shared/lib/access";
import type { MediaStorage } from "@fynix/shared/server/media-storage";

vi.mock("server-only", () => ({}));

const setPhoto = vi.fn();
const clearPhoto = vi.fn();
vi.mock("@fynix/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fynix/db")>()),
  setBusinessProductPhoto: (...args: unknown[]) => setPhoto(...args),
  clearBusinessProductPhoto: (...args: unknown[]) => clearPhoto(...args),
}));

const { removeProductPhoto, storeProductPhoto, deleteProductPhotoFiles } = await import("./product-photos");

const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const PRODUCT = "0192f3c4-3333-7000-8000-000000000003";
const OLD_PHOTO = "0192f3c4-4444-7000-8000-000000000004";
const tenant: TenantContext = { userId: "user-a", businessId: BUSINESS, businessName: "Smile Dental", role: "owner" };

/** An in-memory storage that remembers every key, so a test can see exactly what was left behind. */
class MemoryStorage implements MediaStorage {
  readonly files = new Map<string, Uint8Array>();
  failPutsAfter = Number.POSITIVE_INFINITY;
  private puts = 0;
  async put(key: string, bytes: Uint8Array): Promise<void> {
    this.puts += 1;
    if (this.puts > this.failPutsAfter) throw new Error("the disk is full");
    this.files.set(key, bytes);
  }
  async get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
    const bytes = this.files.get(key);
    return bytes === undefined ? null : { bytes, contentType: "image/webp" };
  }
  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
}

async function photoBytes(width: number, height: number, format: "png" | "jpeg" | "webp" = "png"): Promise<Uint8Array> {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 30, g: 110, b: 120 } } });
  return new Uint8Array(await (format === "png" ? image.png() : format === "jpeg" ? image.jpeg() : image.webp()).toBuffer());
}

let storage: MemoryStorage;
const deps = () => ({ staffDb: {} as Database, storage });

beforeEach(() => {
  storage = new MemoryStorage();
  setPhoto.mockReset();
  clearPhoto.mockReset();
});

describe("storeProductPhoto", () => {
  it("stores a square 800 × 800 WebP under the business and photo ids, with its smaller copies, and puts it on the product", async () => {
    setPhoto.mockResolvedValue({ kind: "saved", replacedPhotoId: null });
    const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, await photoBytes(1600, 1200));
    if (!outcome.ok) throw new Error(`Expected the photo to be stored: ${outcome.message}`);

    const key = `t/${BUSINESS}/${outcome.photoId}/display`;
    expect([...storage.files.keys()].sort()).toEqual([key, `t/${BUSINESS}/${outcome.photoId}/w320`, `t/${BUSINESS}/${outcome.photoId}/w640`].sort());
    const stored = storage.files.get(key);
    expect(await sharp(stored).metadata()).toMatchObject({ format: "webp", width: 800, height: 800 });
    expect(setPhoto).toHaveBeenCalledWith(expect.anything(), {
      businessId: BUSINESS,
      productId: PRODUCT,
      photo: expect.objectContaining({ photoId: outcome.photoId, mimeType: "image/webp", width: 800, height: 800 }),
    });
  });

  it("cuts a portrait and a wide photo to a square too", async () => {
    setPhoto.mockResolvedValue({ kind: "saved", replacedPhotoId: null });
    for (const [width, height] of [[600, 2400], [3000, 700]] as const) {
      const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, await photoBytes(width, height, "jpeg"));
      if (!outcome.ok) throw new Error("Expected the photo to be stored");
      expect(await sharp(storage.files.get(`t/${BUSINESS}/${outcome.photoId}/display`)).metadata()).toMatchObject({ width: 800, height: 800 });
    }
  });

  it("deletes the photo it replaces, with its copies, once the new one is on the product", async () => {
    for (const variant of ["display", "w320", "w640"]) storage.files.set(`t/${BUSINESS}/${OLD_PHOTO}/${variant}`, new Uint8Array([1]));
    setPhoto.mockResolvedValue({ kind: "saved", replacedPhotoId: OLD_PHOTO });
    const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, await photoBytes(900, 900));
    if (!outcome.ok) throw new Error("Expected the photo to be stored");
    expect([...storage.files.keys()].every((key) => key.includes(outcome.photoId))).toBe(true);
    expect(storage.files.size).toBe(3);
  });

  it("leaves no file behind when the product is gone by the time the photo is recorded", async () => {
    setPhoto.mockResolvedValue({ kind: "not-found" });
    const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, await photoBytes(900, 900));
    expect(outcome).toMatchObject({ ok: false, refusal: "not-found" });
    expect(storage.files.size).toBe(0);
  });

  it("leaves no file behind, and tells the caller, when the database write fails", async () => {
    setPhoto.mockRejectedValue(new Error("connection reset"));
    await expect(storeProductPhoto(deps(), tenant, PRODUCT, await photoBytes(900, 900))).rejects.toThrow("connection reset");
    expect(storage.files.size).toBe(0);
  });

  it("keeps the old photo and writes nothing when the new file cannot be stored", async () => {
    storage.failPutsAfter = 0;
    await expect(storeProductPhoto(deps(), tenant, PRODUCT, await photoBytes(900, 900))).rejects.toThrow("the disk is full");
    expect(setPhoto).not.toHaveBeenCalled();
    expect(storage.files.size).toBe(0);
  });

  it("still stores the photo when only a smaller copy cannot be written", async () => {
    setPhoto.mockResolvedValue({ kind: "saved", replacedPhotoId: null });
    storage.failPutsAfter = 1;
    const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, await photoBytes(900, 900));
    expect(outcome.ok).toBe(true);
    expect(storage.files.size).toBe(1);
  });

  it.each([
    ["an empty file", new Uint8Array(0), "empty"],
    ["text", new TextEncoder().encode("this is not a picture at all, just some words"), "unsupported-type"],
    ["a GIF", new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0, 0, 0x3b]), "unsupported-type"],
    ["an SVG", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>'), "unsupported-type"],
  ])("refuses %s, storing nothing and never touching the product", async (_name, bytes, refusal) => {
    const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, bytes);
    expect(outcome).toMatchObject({ ok: false, refusal });
    expect(storage.files.size).toBe(0);
    expect(setPhoto).not.toHaveBeenCalled();
  });

  it("refuses a picture that is cut off part-way through, storing nothing", async () => {
    const whole = await photoBytes(1200, 900, "jpeg");
    const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, whole.subarray(0, Math.floor(whole.length / 3)));
    expect(outcome).toMatchObject({ ok: false, refusal: "unreadable" });
    expect(storage.files.size).toBe(0);
  });

  it("drops the metadata the phone put in the file, GPS included", async () => {
    setPhoto.mockResolvedValue({ kind: "saved", replacedPhotoId: null });
    const withGps = new Uint8Array(await sharp(await photoBytes(900, 900, "jpeg")).withExif({ IFD0: { Copyright: "secret" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "19/1 7/1 0/1" } }).toBuffer());
    const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, withGps);
    if (!outcome.ok) throw new Error("Expected the photo to be stored");
    const metadata = await sharp(storage.files.get(`t/${BUSINESS}/${outcome.photoId}/display`)).metadata();
    expect(metadata.exif).toBeUndefined();
  });

  it("stands the picture upright from its orientation tag before it is cut", async () => {
    setPhoto.mockResolvedValue({ kind: "saved", replacedPhotoId: null });
    // Left half red, right half blue, tagged "rotate 90° clockwise": shown upright it is red on top, blue below.
    const left = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    const sideways = await sharp({ create: { width: 1200, height: 600, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .composite([{ input: left, left: 0, top: 0 }])
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const outcome = await storeProductPhoto(deps(), tenant, PRODUCT, new Uint8Array(sideways));
    if (!outcome.ok) throw new Error("Expected the photo to be stored");
    const { data, info } = await sharp(storage.files.get(`t/${BUSINESS}/${outcome.photoId}/display`)).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number): readonly number[] => [0, 1, 2].map((channel) => data[(y * info.width + x) * info.channels + channel] ?? -1);
    expect(pixel(400, 100)[0]).toBeGreaterThan(200); // top: red
    expect(pixel(400, 700)[2]).toBeGreaterThan(200); // bottom: blue
  });
});

describe("removeProductPhoto", () => {
  it("takes the photo off the product and deletes its files", async () => {
    for (const variant of ["display", "w320", "w640"]) storage.files.set(`t/${BUSINESS}/${OLD_PHOTO}/${variant}`, new Uint8Array([1]));
    clearPhoto.mockResolvedValue(OLD_PHOTO);
    await removeProductPhoto(deps(), tenant, PRODUCT);
    expect(clearPhoto).toHaveBeenCalledWith(expect.anything(), { businessId: BUSINESS, productId: PRODUCT });
    expect(storage.files.size).toBe(0);
  });

  it("does nothing for a product with no photo, or one that is not this business's", async () => {
    storage.files.set(`t/${BUSINESS}/${OLD_PHOTO}/display`, new Uint8Array([1]));
    clearPhoto.mockResolvedValue(null);
    await removeProductPhoto(deps(), tenant, PRODUCT);
    expect(storage.files.size).toBe(1);
  });
});

describe("deleteProductPhotoFiles", () => {
  it("only ever deletes keys built from the business and photo ids", async () => {
    await expect(deleteProductPhotoFiles(storage, "../etc", OLD_PHOTO)).rejects.toThrow();
    await expect(deleteProductPhotoFiles(storage, BUSINESS, "../../x")).rejects.toThrow();
  });
});
